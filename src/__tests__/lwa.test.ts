import { describe, it, expect } from "vitest";
import { buildConsentUrl, getTokenUrl, normalizeRegion, parseCallback } from "../lwa.js";

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

describe("buildConsentUrl state", () => {
  it("carries the state value so the callback can be verified", () => {
    const url = buildConsentUrl("NA", "cid", "http://localhost:3000/callback", "abc123");
    expect(url.searchParams.get("state")).toBe("abc123");
  });
});

describe("parseCallback", () => {
  it("returns the code when state matches", () => {
    const params = new URLSearchParams({ code: "the-code", state: "s1" });
    expect(parseCallback(params, "s1")).toBe("the-code");
  });

  it("rejects a callback whose state does not match", () => {
    const params = new URLSearchParams({ code: "the-code", state: "other" });
    expect(() => parseCallback(params, "s1")).toThrow(/state/i);
  });

  it("rejects a callback with no state at all", () => {
    const params = new URLSearchParams({ code: "the-code" });
    expect(() => parseCallback(params, "s1")).toThrow(/state/i);
  });

  it("surfaces the provider's error before checking anything else", () => {
    const params = new URLSearchParams({
      error: "access_denied",
      error_description: "User said no",
    });
    expect(() => parseCallback(params, "s1")).toThrow(/access_denied.*User said no/);
  });

  it("rejects a callback with no code", () => {
    const params = new URLSearchParams({ state: "s1" });
    expect(() => parseCallback(params, "s1")).toThrow(/code/i);
  });
});
