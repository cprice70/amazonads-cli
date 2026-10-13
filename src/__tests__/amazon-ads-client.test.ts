import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gzipSync } from "zlib";
import { AmazonAdsClient } from "../amazon-ads-client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokenResponse(): Response {
  return jsonResponse(200, { access_token: "access-123", expires_in: 3600 });
}

function makeClient(region = "NA"): AmazonAdsClient {
  return new AmazonAdsClient({
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    region,
    sandbox: false,
  });
}

describe("AmazonAdsClient token refresh", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes against the regional Login with Amazon host", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse(200, []));

    await makeClient("EU").getProfiles();

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.amazon.co.uk/auth/o2/token");
    expect(fetchMock.mock.calls[1][0]).toBe("https://advertising-api-eu.amazon.com/v2/profiles");
  });
});

describe("AmazonAdsClient multi-status handling", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when a 207 response reports a rejected item", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      jsonResponse(207, {
        keywords: {
          success: [],
          error: [
            {
              index: 0,
              errors: [
                {
                  errorType: "ENTITY_NOT_FOUND",
                  errorValue: { message: "Keyword 999 does not exist" },
                },
              ],
            },
          ],
        },
      })
    );

    await expect(makeClient().updateKeywordBid("profile-1", "999", 1.25)).rejects.toThrow(
      /ENTITY_NOT_FOUND/
    );
  });

  it("resolves with the body when a 207 response has no rejected items", async () => {
    const body = {
      keywords: { success: [{ index: 0, keywordId: "123" }], error: [] },
    };
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse(207, body));

    await expect(makeClient().updateKeywordBid("profile-1", "123", 1.25)).resolves.toEqual(body);
  });

  it("throws when a campaign create is rejected", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      jsonResponse(207, {
        campaigns: {
          success: [],
          error: [
            {
              index: 0,
              errors: [{ errorType: "DUPLICATE_VALUE", errorValue: { message: "Name already used" } }],
            },
          ],
        },
      })
    );

    await expect(
      makeClient().createCampaign("profile-1", "Dup", "sponsoredProducts", "MANUAL", 10, "2026-10-13")
    ).rejects.toThrow(/DUPLICATE_VALUE/);
  });

  it("leaves list responses untouched", async () => {
    const body = { campaigns: [{ campaignId: "1" }], totalResults: 1 };
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse(200, body));

    await expect(makeClient().getCampaigns("profile-1")).resolves.toEqual(body);
  });
});

describe("AmazonAdsClient.getCampaignPerformance", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function gzipResponse(rows: unknown[]): Response {
    return new Response(gzipSync(JSON.stringify(rows)), { status: 200 });
  }

  function mockCompletedReport(rows: unknown[]): void {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse(200, { reportId: "r1" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { status: "COMPLETED", url: "https://example.com/r1.gz" })
      )
      .mockResolvedValueOnce(gzipResponse(rows));
  }

  it("returns only the requested campaign's rows", async () => {
    mockCompletedReport([
      { campaignId: 111, campaignName: "A" },
      { campaignId: 222, campaignName: "B" },
    ]);

    const rows = await makeClient().getCampaignPerformance("p", "222", "2026-10-01", "2026-10-10");

    expect(rows).toEqual([{ campaignId: 222, campaignName: "B" }]);
  });

  it("requests the campaign preset with 7-day attribution", async () => {
    mockCompletedReport([]);

    await makeClient().getCampaignPerformance("p", "1", "2026-10-01", "2026-10-10");

    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body.configuration.reportTypeId).toBe("spCampaigns");
    expect(body.configuration.timeUnit).toBe("SUMMARY");
    expect(body.configuration.columns).toContain("sales7d");
    expect(body.configuration.columns).not.toContain("sales14d");
  });

  it("keeps polling past five seconds until the report completes", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse(200, { reportId: "r1" }));
    for (let i = 0; i < 6; i++) {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "PENDING" }));
    }
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { status: "COMPLETED", url: "https://example.com/r1.gz" }))
      .mockResolvedValueOnce(gzipResponse([{ campaignId: 1 }]));

    const pending = makeClient().getCampaignPerformance("p", "1", "2026-10-01", "2026-10-10");
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toEqual([{ campaignId: 1 }]);
    vi.useRealTimers();
  });

  it("returns an empty list, not every campaign, when the campaign has no rows", async () => {
    mockCompletedReport([
      { campaignId: 111, campaignName: "A" },
      { campaignId: 222, campaignName: "B" },
    ]);

    const rows = await makeClient().getCampaignPerformance("p", "999", "2026-10-01", "2026-10-10");

    expect(rows).toEqual([]);
  });
});

describe("AmazonAdsClient list pagination", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function requestBody(callIndex: number): Record<string, unknown> {
    return JSON.parse(fetchMock.mock.calls[callIndex][1].body as string);
  }

  it("follows nextToken until every campaign page is fetched", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        jsonResponse(200, { campaigns: [{ campaignId: "1" }], totalResults: 2, nextToken: "page2" })
      )
      .mockResolvedValueOnce(jsonResponse(200, { campaigns: [{ campaignId: "2" }], totalResults: 2 }));

    const result = await makeClient().getCampaigns("p", "enabled");

    expect(result).toEqual({
      campaigns: [{ campaignId: "1" }, { campaignId: "2" }],
      totalResults: 2,
    });
    expect(requestBody(1)).toEqual({ stateFilter: { include: ["ENABLED"] } });
    expect(requestBody(2)).toEqual({ stateFilter: { include: ["ENABLED"] }, nextToken: "page2" });
  });

  it("makes a single request when the first page has no nextToken", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse(200, { keywords: [{ keywordId: "k1" }], totalResults: 1 }));

    const result = await makeClient().getKeywords("p", "c1");

    expect(result).toEqual({ keywords: [{ keywordId: "k1" }], totalResults: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(1)).toEqual({ campaignIdFilter: { include: ["c1"] } });
  });

  it("paginates product ads and portfolios too", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse(200, { productAds: [{ adId: "a1" }], nextToken: "n" }))
      .mockResolvedValueOnce(jsonResponse(200, { productAds: [{ adId: "a2" }] }))
      .mockResolvedValueOnce(jsonResponse(200, { portfolios: [{ portfolioId: 1 }], nextToken: "n" }))
      .mockResolvedValueOnce(jsonResponse(200, { portfolios: [{ portfolioId: 2 }] }));

    const client = makeClient();
    const ads = await client.getProductAds("p");
    const portfolios = await client.getPortfolios("p");

    expect(ads).toEqual({ productAds: [{ adId: "a1" }, { adId: "a2" }] });
    expect(portfolios).toEqual({ portfolios: [{ portfolioId: 1 }, { portfolioId: 2 }] });
  });
});

describe("AmazonAdsClient request hardening", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.AMAZON_ADS_REGION;
  });

  it("retries a request whose connection failed", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse(200, [{ profileId: 1 }]));

    const pending = makeClient().getProfiles();
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toEqual([{ profileId: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after the retry budget and reports the connection error", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const pending = makeClient().getProfiles();
    const outcome = pending.catch((e: Error) => e);
    await vi.runAllTimersAsync();

    await expect(outcome).resolves.toMatchObject({ message: expect.stringMatching(/fetch failed/) });
    expect(fetchMock).toHaveBeenCalledTimes(1 + 4);
  });

  it("reports a bare success for an empty response body", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(makeClient().archiveCampaign("p", "c1", "sponsoredProducts")).resolves.toEqual({
      success: true,
    });
  });

  it("uses only the config it was given, not process.env", async () => {
    process.env.AMAZON_ADS_REGION = "EU";
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse(200, []));

    await new AmazonAdsClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
    }).getProfiles();

    expect(fetchMock.mock.calls[1][0]).toBe("https://advertising-api.amazon.com/v2/profiles");
  });
});
