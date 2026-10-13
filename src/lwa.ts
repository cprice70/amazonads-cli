/**
 * Login with Amazon (LwA) endpoints. The consent page and token service are
 * served from regional hosts; tokens issued by any region are valid globally.
 * https://advertising.amazon.com/API/docs/en-us/guides/account-management/authorization/authorization-grants
 */

export type Region = "NA" | "EU" | "FE";

export const REGIONS: Region[] = ["NA", "EU", "FE"];

const CONSENT_HOSTS: Record<Region, string> = {
  NA: "https://www.amazon.com",
  EU: "https://eu.account.amazon.com",
  FE: "https://apac.account.amazon.com",
};

const TOKEN_HOSTS: Record<Region, string> = {
  NA: "https://api.amazon.com",
  EU: "https://api.amazon.co.uk",
  FE: "https://api.amazon.co.jp",
};

export const SCOPE = "advertising::campaign_management";

/** Upper-cases and validates a region string; empty input means NA. */
export function normalizeRegion(input: string | undefined): Region {
  const value = (input ?? "").trim().toUpperCase();
  if (!value) return "NA";
  if ((REGIONS as string[]).includes(value)) return value as Region;
  throw new Error(`Unknown region "${input}". Use one of: ${REGIONS.join(", ")}`);
}

export function getTokenUrl(region: Region): string {
  return `${TOKEN_HOSTS[region]}/auth/o2/token`;
}

export function buildConsentUrl(region: Region, clientId: string, redirectUri: string): URL {
  const url = new URL("/ap/oa", CONSENT_HOSTS[region]);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  return url;
}
