import { Command } from "commander";
import { AmazonAdsClient } from "../amazon-ads-client.js";
import {
  printTable,
  printJson,
  printSuccess,
  printError,
  colorState,
  formatCurrency,
} from "../output.js";

interface Keyword {
  keywordId?: string | number;
  campaignId?: string | number;
  adGroupId?: string | number;
  keywordText?: string;
  matchType?: string;
  state?: string;
  bid?: number;
}

interface KeywordsResponse {
  keywords?: Keyword[];
}

function resolveKeywords(data: unknown): Keyword[] {
  if (Array.isArray(data)) return data as Keyword[];
  const resp = data as KeywordsResponse;
  if (resp.keywords && Array.isArray(resp.keywords)) return resp.keywords;
  return [];
}

export function registerKeywordsCommands(
  program: Command,
  client: AmazonAdsClient,
  resolveProfileId: (opts: { profile?: string }) => string
): void {
  const keywords = program.command("keywords").description("Manage keywords");

  keywords
    .command("list")
    .description("List keywords")
    .option("--profile <id>", "Profile ID")
    .option("--campaign <id>", "Filter by campaign ID")
    .option("--ad-group <id>", "Filter by ad group ID")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const profileId = resolveProfileId(opts);
        const data = await client.getKeywords(profileId, opts.campaign, opts.adGroup);

        if (opts.json) {
          printJson(data);
          return;
        }

        const list = resolveKeywords(data);
        if (list.length === 0) {
          console.log("No keywords found.");
          return;
        }

        const headers = ["Keyword ID", "Keyword", "Match Type", "State", "Bid", "Campaign ID", "Ad Group ID"];
        const rows = list.map((k) => [
          String(k.keywordId || ""),
          k.keywordText || "",
          k.matchType || "",
          colorState(k.state || ""),
          formatCurrency(k.bid),
          String(k.campaignId || ""),
          String(k.adGroupId || ""),
        ]);

        printTable(headers, rows);
      } catch (err) {
        printError(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  keywords
    .command("update-bid")
    .description("Update keyword bid")
    .requiredOption("--keyword <id>", "Keyword ID")
    .requiredOption("--bid <amount>", "New bid amount")
    .option("--profile <id>", "Profile ID")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const profileId = resolveProfileId(opts);
        const bid = parseFloat(opts.bid);

        if (isNaN(bid) || bid <= 0) {
          printError("Bid must be a positive number.");
          process.exit(1);
          return;
        }

        const data = await client.updateKeywordBid(profileId, opts.keyword, bid);

        if (opts.json) {
          printJson(data);
        } else {
          printSuccess(`Keyword ${opts.keyword} bid updated to ${formatCurrency(bid)}.`);
        }
      } catch (err) {
        printError(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
