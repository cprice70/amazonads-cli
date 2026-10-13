import { describe, it, expect } from "vitest";
import { buildConsentUrl, getTokenUrl, normalizeRegion } from "../lwa.js";

describe("normalizeRegion", () => {
  it("defaults to NA when empty", () => {
    expect(normalizeRegion(undefined)).toBe("NA");
    expect(normalizeRegion("")).toBe("NA");
    expect(normalizeRegion("  ")).toBe("NA");
  });

  it("accepts any case and surrounding whitespace", () => {
    expect(normalizeRegion("eu")).toBe("EU");
    expect(normalizeRegion(" fe ")).toBe("FE");
  });

  it("rejects unknown regions", () => {
    expect(() => normalizeRegion("UK")).toThrow(/NA, EU, FE/);
  });
});

describe("getTokenUrl", () => {
  it("returns the regional Login with Amazon token host", () => {
    expect(getTokenUrl("NA")).toBe("https://api.amazon.com/auth/o2/token");
    expect(getTokenUrl("EU")).toBe("https://api.amazon.co.uk/auth/o2/token");
    expect(getTokenUrl("FE")).toBe("https://api.amazon.co.jp/auth/o2/token");
  });
});

describe("buildConsentUrl", () => {
  it("uses the regional consent host", () => {
    expect(buildConsentUrl("NA", "cid", "http://localhost:3000/callback").origin).toBe(
      "https://www.amazon.com"
    );
    expect(buildConsentUrl("EU", "cid", "http://localhost:3000/callback").origin).toBe(
      "https://eu.account.amazon.com"
    );
    expect(buildConsentUrl("FE", "cid", "http://localhost:3000/callback").origin).toBe(
      "https://apac.account.amazon.com"
    );
  });

  it("sets the OAuth query parameters", () => {
    const url = buildConsentUrl("NA", "my-client", "http://localhost:3000/callback");
    expect(url.pathname).toBe("/ap/oa");
    expect(url.searchParams.get("client_id")).toBe("my-client");
    expect(url.searchParams.get("scope")).toBe("advertising::campaign_management");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/callback");
  });
});
