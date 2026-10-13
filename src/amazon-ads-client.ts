import zlib from "zlib";
import { promisify } from "util";
import { getTokenUrl, normalizeRegion } from "./lwa.js";
import { buildReportSpec } from "./report-presets.js";

const gunzip = promisify(zlib.gunzip);

export interface AmazonAdsConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  region?: string;
  sandbox?: boolean;
}

export interface ReportSpec {
  name: string;
  startDate: string;
  endDate: string;
  reportTypeId: string;
  groupBy: string[];
  columns: string[];
  timeUnit?: "SUMMARY" | "DAILY";
  adProduct?: string;
  filters?: unknown[];
}

interface RejectedItem {
  index?: number;
  errors?: { errorType?: string; errorValue?: unknown }[];
}

/**
 * Amazon's v3/v4 batch endpoints (create/update/delete) return 207 with
 * `{ <entity>: { success: [...], error: [...] } }`. Throw when any item was
 * rejected so callers never report success for a failed write.
 */
function throwIfItemsRejected(body: unknown): void {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;

  for (const [entity, value] of Object.entries(body as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const errors = (value as { error?: unknown }).error;
    if (!Array.isArray(errors) || errors.length === 0) continue;

    const details = (errors as RejectedItem[])
      .map((item) => {
        const reasons = (item.errors ?? [])
          .map((e) => {
            const type = e.errorType ?? "UNKNOWN_ERROR";
            const value = e.errorValue === undefined ? "" : ` ${JSON.stringify(e.errorValue)}`;
            return `${type}${value}`;
          })
          .join("; ");
        return `item ${item.index ?? "?"}: ${reasons || "no details"}`;
      })
      .join("\n");

    throw new Error(
      `Amazon Ads API rejected ${errors.length} ${entity} item(s):\n${details}`
    );
  }
}

export class AmazonAdsClient {
  private config: AmazonAdsConfig;
  private accessToken?: string;
  private tokenExpiry?: number;

  /** Config comes fully resolved from loadConfig(); the client never reads process.env itself. */
  constructor(config: AmazonAdsConfig = {}) {
    this.config = { region: "NA", sandbox: false, ...config };
  }

  private getEndpoint(): string {
    const { region, sandbox } = this.config;

    if (sandbox) {
      return "https://advertising-api-test.amazon.com";
    }

    switch (region) {
      case "NA":
        return "https://advertising-api.amazon.com";
      case "EU":
        return "https://advertising-api-eu.amazon.com";
      case "FE":
        return "https://advertising-api-fe.amazon.com";
      default:
        return "https://advertising-api.amazon.com";
    }
  }

  private async ensureAccessToken(): Promise<void> {
    // Check if we have a valid access token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return;
    }

    // Refresh the access token
    const { clientId, clientSecret, refreshToken } = this.config;

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        "Missing Amazon Ads credentials. Please run 'amazonads auth login' or set AMAZON_ADS_CLIENT_ID, AMAZON_ADS_CLIENT_SECRET, and AMAZON_ADS_REFRESH_TOKEN environment variables."
      );
    }

    const tokenData = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(getTokenUrl(normalizeRegion(this.config.region)), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenData.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh access token: ${error}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 1 minute before expiry
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Exponential backoff: 1s, 2s, 4s, ... */
  private backoffMs(attempt: number): number {
    return Math.pow(2, attempt) * 1000;
  }

  private isRetryableError(status: number): boolean {
    // Retry on rate limit (429) and server errors (5xx)
    return status === 429 || (status >= 500 && status < 600);
  }

  private async makeRequest(
    method: string,
    path: string,
    profileId?: string,
    body?: unknown,
    contentType?: string
  ): Promise<unknown> {
    await this.ensureAccessToken();

    const url = `${this.getEndpoint()}${path}`;
    const ct = contentType || "application/json";
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.accessToken}`,
      "Amazon-Advertising-API-ClientId": this.config.clientId!,
    };

    // Only set Content-Type and Accept for requests with a body
    if (body) {
      headers["Content-Type"] = ct;
      headers["Accept"] = ct;
    } else {
      headers["Accept"] = "application/json";
    }

    if (profileId) {
      headers["Amazon-Advertising-API-Scope"] = profileId;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    // Retry on 429/5xx and on connection failures, with exponential backoff.
    const maxRetries = 3;

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, options);
      } catch (err) {
        if (attempt >= maxRetries) {
          throw new Error(
            `Amazon Ads API request failed after ${attempt + 1} attempts: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
        await this.sleep(this.backoffMs(attempt));
        continue;
      }

      if (response.ok) {
        // Some endpoints answer with no body (e.g. 204).
        const text = await response.text();
        if (!text) return { success: true };
        const parsed: unknown = JSON.parse(text);
        // Batch endpoints answer 207 Multi-Status and report per-item failures
        // in the body, so an OK status alone does not mean the write succeeded.
        throwIfItemsRejected(parsed);
        return parsed;
      }

      const errorText = await response.text();

      if (this.isRetryableError(response.status) && attempt < maxRetries) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : this.backoffMs(attempt);
        await this.sleep(Math.min(waitTime, 10000)); // Cap at 10 seconds
        continue;
      }

      throw new Error(`Amazon Ads API error (${response.status}): ${errorText}`);
    }
  }

  /**
   * POST a v3/v4 list endpoint and follow `nextToken` until every page has
   * been fetched. Pages are merged under `key` so callers see one response.
   */
  private async listAll(
    path: string,
    profileId: string,
    body: Record<string, unknown>,
    contentType: string,
    key: string
  ): Promise<unknown> {
    const items: unknown[] = [];
    let merged: Record<string, unknown> = {};
    let nextToken: string | undefined;

    do {
      const page = (await this.makeRequest(
        "POST",
        path,
        profileId,
        nextToken ? { ...body, nextToken } : body,
        contentType
      )) as Record<string, unknown> | unknown[];

      // Older endpoints answer with a bare array and no paging.
      if (Array.isArray(page)) return page;

      const { nextToken: token, ...rest } = page;
      merged = rest;
      if (Array.isArray(page[key])) items.push(...(page[key] as unknown[]));
      nextToken = typeof token === "string" && token ? token : undefined;
    } while (nextToken);

    return { ...merged, [key]: items };
  }

  async getProfiles(): Promise<unknown> {
    return this.makeRequest("GET", "/v2/profiles");
  }

  async getCampaigns(
    profileId: string,
    state?: string,
    campaignType?: string
  ): Promise<unknown> {
    // v3 API uses POST with filters in body
    let path = "/sp/campaigns/list";
    let contentType = "application/vnd.spcampaign.v3+json";

    if (campaignType === "sponsoredBrands") {
      path = "/sb/v4/campaigns/list";
      contentType = "application/vnd.sbcampaignresource.v4+json";
    } else if (campaignType === "sponsoredDisplay") {
      path = "/sd/campaigns/list";
      contentType = "application/vnd.sdcampaign.v3+json";
    }

    const body: Record<string, unknown> = {};

    if (state) {
      body.stateFilter = { include: [state.toUpperCase()] };
    }

    return this.listAll(path, profileId, body, contentType, "campaigns");
  }

  /**
   * Performance rows for one campaign over a date range. Builds the standard
   * campaign report (7-day attribution) and waits for Amazon to generate it.
   */
  async getCampaignPerformance(
    profileId: string,
    campaignId: string,
    startDate: string,
    endDate: string,
    options: { timeoutMs?: number } = {}
  ): Promise<Record<string, unknown>[]> {
    const spec = buildReportSpec("campaign", startDate, endDate, false);
    spec.name = `Campaign ${campaignId} Performance Report`;

    const { reportId } = await this.createReport(profileId, spec);
    const rows = (await this.waitForReport(profileId, reportId, options)) as Record<
      string,
      unknown
    >[];

    // An empty result is correct here; never fall back to the whole account's rows.
    return rows.filter((row) => String(row.campaignId) === campaignId);
  }

  /**
   * Create an async v3 report. Returns the reportId; poll with getReport()
   * or waitForReport().
   */
  async createReport(
    profileId: string,
    spec: ReportSpec
  ): Promise<{ reportId: string }> {
    const contentType = "application/vnd.createasyncreportrequest.v3+json";
    const body = {
      name: spec.name,
      startDate: spec.startDate,
      endDate: spec.endDate,
      configuration: {
        adProduct: spec.adProduct ?? "SPONSORED_PRODUCTS",
        groupBy: spec.groupBy,
        columns: spec.columns,
        reportTypeId: spec.reportTypeId,
        timeUnit: spec.timeUnit ?? "SUMMARY",
        format: "GZIP_JSON",
        ...(spec.filters ? { filters: spec.filters } : {}),
      },
    };

    return this.makeRequest(
      "POST",
      "/reporting/reports",
      profileId,
      body,
      contentType
    ) as Promise<{ reportId: string }>;
  }

  /**
   * Poll a report until it completes or the timeout passes. Returns the
   * decompressed rows on success; throws on FAILURE or timeout.
   */
  async waitForReport(
    profileId: string,
    reportId: string,
    options: { timeoutMs?: number; pollMs?: number; onPoll?: (status: string) => void } = {}
  ): Promise<unknown[]> {
    const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    const pollMs = options.pollMs ?? 5000;
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const statusResponse = (await this.makeRequest(
        "GET",
        `/reporting/reports/${reportId}`,
        profileId
      )) as { status: string; url?: string; failureReason?: string };

      options.onPoll?.(statusResponse.status);

      if (statusResponse.status === "COMPLETED" && statusResponse.url) {
        const data = await this.downloadReport(statusResponse.url);
        return Array.isArray(data) ? data : [data];
      }

      if (statusResponse.status === "FAILURE") {
        throw new Error(
          `Report ${reportId} failed: ${statusResponse.failureReason || "Unknown error"}`
        );
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Report ${reportId} still ${statusResponse.status} after ${Math.round(timeoutMs / 1000)}s. ` +
            `Retrieve later with: amazonads reports get --report ${reportId}`
        );
      }

      await this.sleep(pollMs);
    }
  }

  async getPortfolios(profileId: string): Promise<unknown> {
    const contentType = "application/vnd.spPortfolio.v3+json";
    return this.listAll("/portfolios/list", profileId, {}, contentType, "portfolios");
  }

  private async downloadReport(url: string): Promise<unknown> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download report: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const decompressed = await gunzip(Buffer.from(buffer));
    return JSON.parse(decompressed.toString("utf-8"));
  }

  async getReport(profileId: string, reportId: string): Promise<unknown> {
    const statusResponse = await this.makeRequest(
      "GET",
      `/reporting/reports/${reportId}`,
      profileId
    ) as { status: string; url?: string; failureReason?: string };

    if (statusResponse.status === "COMPLETED" && statusResponse.url) {
      const reportData = await this.downloadReport(statusResponse.url);
      return {
        status: "COMPLETED",
        data: reportData,
      };
    }

    if (statusResponse.status === "FAILURE") {
      return {
        status: "FAILURE",
        reason: statusResponse.failureReason || "Unknown error",
        reportId,
      };
    }

    return {
      status: statusResponse.status,
      message: "Report still processing. Try again in a few seconds.",
      reportId,
    };
  }

  async getKeywords(
    profileId: string,
    campaignId?: string,
    adGroupId?: string
  ): Promise<unknown> {
    const path = "/sp/keywords/list";
    const contentType = "application/vnd.spkeyword.v3+json";

    const body: Record<string, unknown> = {};

    if (campaignId) {
      body.campaignIdFilter = { include: [campaignId] };
    }

    if (adGroupId) {
      body.adGroupIdFilter = { include: [adGroupId] };
    }

    return this.listAll(path, profileId, body, contentType, "keywords");
  }

  async updateKeywordBid(
    profileId: string,
    keywordId: string,
    bid: number
  ): Promise<unknown> {
    const contentType = "application/vnd.spkeyword.v3+json";
    const body = {
      keywords: [
        {
          keywordId,
          bid,
        },
      ],
    };

    return this.makeRequest("PUT", "/sp/keywords", profileId, body, contentType);
  }

  async createCampaign(
    profileId: string,
    name: string,
    campaignType: string,
    targetingType: string,
    dailyBudget: number,
    startDate: string
  ): Promise<unknown> {
    let path = "/sp/campaigns";
    let contentType = "application/vnd.spcampaign.v3+json";

    if (campaignType === "sponsoredBrands") {
      path = "/sb/v4/campaigns";
      contentType = "application/vnd.sbcampaignresource.v4+json";
    } else if (campaignType === "sponsoredDisplay") {
      path = "/sd/campaigns";
      contentType = "application/vnd.sdcampaign.v3+json";
    }

    const body = {
      campaigns: [
        {
          name,
          targetingType,
          state: "PAUSED",  // Default to PAUSED for safety - won't spend money
          budget: {
            budgetType: "DAILY",
            budget: dailyBudget,
          },
          startDate,
        },
      ],
    };

    return this.makeRequest("POST", path, profileId, body, contentType);
  }

  async getProductAds(
    profileId: string,
    campaignId?: string,
    adGroupId?: string
  ): Promise<unknown> {
    const path = "/sp/productAds/list";
    const contentType = "application/vnd.spproductad.v3+json";

    const body: Record<string, unknown> = {};

    if (campaignId) {
      body.campaignIdFilter = { include: [campaignId] };
    }

    if (adGroupId) {
      body.adGroupIdFilter = { include: [adGroupId] };
    }

    return this.listAll(path, profileId, body, contentType, "productAds");
  }

  async archiveCampaign(
    profileId: string,
    campaignId: string,
    campaignType: string
  ): Promise<unknown> {
    // v3 API: DELETE endpoint with campaignIdFilter in body
    let path = "/sp/campaigns/delete";
    let contentType = "application/vnd.spcampaign.v3+json";

    if (campaignType === "sponsoredBrands") {
      path = "/sb/v4/campaigns/delete";
      contentType = "application/vnd.sbcampaignresource.v4+json";
    } else if (campaignType === "sponsoredDisplay") {
      path = "/sd/campaigns/delete";
      contentType = "application/vnd.sdcampaign.v3+json";
    }

    const body = {
      campaignIdFilter: {
        include: [campaignId],
      },
    };

    return this.makeRequest("POST", path, profileId, body, contentType);
  }
}
