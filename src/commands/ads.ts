import { Command } from "commander";
import { AmazonAdsClient } from "../amazon-ads-client.js";
import { printTable, printJson, printError, colorState } from "../output.js";

interface ProductAd {
  adId?: string | number;
  campaignId?: string | number;
  adGroupId?: string | number;
  asin?: string;
  sku?: string;
  state?: string;
}

interface ProductAdsResponse {
  productAds?: ProductAd[];
}

function resolveAds(data: unknown): ProductAd[] {
  if (Array.isArray(data)) return data as ProductAd[];
  const resp = data as ProductAdsResponse;
  if (resp.productAds && Array.isArray(resp.productAds)) return resp.productAds;
  return [];
}

export function registerAdsCommands(
  program: Command,
  client: AmazonAdsClient,
  resolveProfileId: (opts: { profile?: string }) => string
): void {
  const productAds = program.command("product-ads").description("Manage product ads");

  productAds
    .command("list")
    .description("List product ads")
    .option("--profile <id>", "Profile ID")
    .option("--campaign <id>", "Filter by campaign ID")
    .option("--ad-group <id>", "Filter by ad group ID")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const profileId = resolveProfileId(opts);
        const data = await client.getProductAds(profileId, opts.campaign, opts.adGroup);

        if (opts.json) {
          printJson(data);
          return;
        }

        const list = resolveAds(data);
        if (list.length === 0) {
          console.log("No product ads found.");
          return;
        }

        const headers = ["Ad ID", "ASIN", "SKU", "State", "Campaign ID", "Ad Group ID"];
        const rows = list.map((a) => [
          String(a.adId || ""),
          a.asin || "",
          a.sku || "",
          colorState(a.state || ""),
          String(a.campaignId || ""),
          String(a.adGroupId || ""),
        ]);

        printTable(headers, rows);
      } catch (err) {
        printError(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
