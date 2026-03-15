import readline from "readline/promises";
import { Command } from "commander";
import { AmazonAdsClient } from "../amazon-ads-client.js";
import {
  printTable,
  printJson,
  printSuccess,
  printError,
  printWarning,
  colorState,
  formatCurrency,
} from "../output.js";

interface Campaign {
  campaignId?: string | number;
  name?: string;
  state?: string;
  budget?: { budget?: number };
  startDate?: string;
  endDate?: string;
  targetingType?: string;
}

interface CampaignsResponse {
  campaigns?: Campaign[];
}

function resolveCampaigns(data: unknown): Campaign[] {
  if (Array.isArray(data)) return data as Campaign[];
  const resp = data as CampaignsResponse;
  if (resp.campaigns && Array.isArray(resp.campaigns)) return resp.campaigns;
  return [];
}

export function registerCampaignsCommands(
  program: Command,
  client: AmazonAdsClient,
  resolveProfileId: (opts: { profile?: string }) => string
): void {
  const campaigns = program.command("campaigns").description("Manage campaigns");

  campaigns
    .command("list")
    .description("List campaigns")
    .option("--profile <id>", "Profile ID")
    .option("--state <state>", "Filter by state (ENABLED, PAUSED, ARCHIVED)")
    .option("--type <type>", "Campaign type (sponsoredProducts, sponsoredBrands, sponsoredDisplay)")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const profileId = resolveProfileId(opts);
        const data = await client.getCampaigns(profileId, opts.state, opts.type);

        if (opts.json) {
          printJson(data);
          return;
        }

        const list = resolveCampaigns(data);
        if (list.length === 0) {
          console.log("No campaigns found.");
          return;
        }

        const headers = ["Campaign ID", "Name", "State", "Budget", "Start Date", "Targeting"];
        const rows = list.map((c) => [
          String(c.campaignId || ""),
          c.name || "",
          colorState(c.state || ""),
          formatCurrency(c.budget?.budget),
          c.startDate || "",
          c.targetingType || "",
        ]);

        printTable(headers, rows);
      } catch (err) {
        printError(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  campaigns
    .command("performance")
    .description("Get campaign performance report")
    .requiredOption("--campaign <id>", "Campaign ID")
    .requiredOption("--start <date>", "Start date (YYYY-MM-DD)")
    .requiredOption("--end <date>", "End date (YYYY-MM-DD)")
    .option("--profile <id>", "Profile ID")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const profileId = resolveProfileId(opts);
        const data = await client.getCampaignPerformance(
          profileId,
          opts.campaign,
          opts.start,
          opts.end
        );

        const result = data as Record<string, unknown>;

        if (result.status === "PENDING") {
          printWarning(`Report still processing. Report ID: ${result.reportId}`);
          console.log(`Check status with: amazonads reports get --report ${result.reportId} --profile ${profileId}`);
          if (opts.json) printJson(data);
          return;
        }

        if (opts.json) {
          printJson(data);
          return;
        }

        const rows = Array.isArray(data) ? data as Record<string, unknown>[] : [];
        if (rows.length === 0) {
          console.log("No performance data found.");
          return;
        }

        const headers = ["Campaign ID", "Name", "Impressions", "Clicks", "Spend", "Sales", "ACOS"];
        const tableRows = rows.map((r) => {
          const spend = typeof r.spend === "number" ? r.spend : parseFloat(String(r.spend || 0));
          const sales = typeof r.sales14d === "number" ? r.sales14d : parseFloat(String(r.sales14d || 0));
          const acos = sales > 0 ? ((spend / sales) * 100).toFixed(1) + "%" : "N/A";
          return [
            String(r.campaignId || ""),
            String(r.campaignName || ""),
            String(r.impressions || 0),
            String(r.clicks || 0),
            formatCurrency(spend),
            formatCurrency(sales),
            acos,
          ];
        });

        printTable(headers, tableRows);
      } catch (err) {
        printError(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  campaigns
    .command("create")
    .description("Create a new campaign (created in PAUSED state)")
    .requiredOption("--name <name>", "Campaign name")
    .requiredOption("--type <type>", "Campaign type (sponsoredProducts, sponsoredBrands, sponsoredDisplay)")
    .requiredOption("--targeting <type>", "Targeting type (MANUAL or AUTO)")
    .requiredOption("--budget <amount>", "Daily budget amount")
    .requiredOption("--start <date>", "Start date (YYYY-MM-DD)")
    .option("--profile <id>", "Profile ID")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const profileId = resolveProfileId(opts);
        const budget = parseFloat(opts.budget);

        if (isNaN(budget) || budget <= 0) {
          printError("Budget must be a positive number.");
          process.exit(1);
          return;
        }

        const data = await client.createCampaign(
          profileId,
          opts.name,
          opts.type,
          opts.targeting.toUpperCase(),
          budget,
          opts.start
        );

        printWarning("Campaign created in PAUSED state. Enable it in the Amazon Ads console when ready.");

        if (opts.json) {
          printJson(data);
        } else {
          printSuccess("Campaign created successfully.");
          printJson(data);
        }
      } catch (err) {
        printError(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  campaigns
    .command("archive")
    .description("Archive a campaign")
    .requiredOption("--campaign <id>", "Campaign ID")
    .requiredOption("--type <type>", "Campaign type (sponsoredProducts, sponsoredBrands, sponsoredDisplay)")
    .option("--profile <id>", "Profile ID")
    .option("--confirm", "Skip confirmation prompt")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const profileId = resolveProfileId(opts);

        if (!opts.confirm) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          try {
            const answer = await rl.question(
              `Archive campaign ${opts.campaign}? This cannot be undone. (y/N): `
            );
            if (answer.trim().toLowerCase() !== "y") {
              console.log("Aborted.");
              return;
            }
          } finally {
            rl.close();
          }
        }

        const data = await client.archiveCampaign(profileId, opts.campaign, opts.type);

        if (opts.json) {
          printJson(data);
        } else {
          printSuccess(`Campaign ${opts.campaign} archived successfully.`);
        }
      } catch (err) {
        printError(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
