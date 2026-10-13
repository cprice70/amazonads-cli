import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
