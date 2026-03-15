import { Command } from "commander";
import { AmazonAdsClient } from "../amazon-ads-client.js";
import { printJson, printError, printWarning } from "../output.js";

export function registerReportsCommands(
  program: Command,
  client: AmazonAdsClient,
  resolveProfileId: (opts: { profile?: string }) => string
): void {
  const reports = program.command("reports").description("Manage reports");

  reports
    .command("get")
    .description("Get a report by ID")
    .requiredOption("--report <id>", "Report ID")
    .option("--profile <id>", "Profile ID")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const profileId = resolveProfileId(opts);
        const data = await client.getReport(profileId, opts.report);
        const result = data as Record<string, unknown>;

        if (result.status === "PENDING" || result.status === "IN_PROGRESS") {
          printWarning(`Report ${opts.report} is still processing (status: ${result.status}).`);
          console.log("Try again in a few seconds.");
          if (opts.json) printJson(data);
          return;
        }

        if (result.status === "FAILURE") {
          printError(`Report failed: ${result.reason || "Unknown error"}`);
          if (opts.json) printJson(data);
          process.exit(1);
          return;
        }

        printJson(opts.json ? data : result.data ?? data);
      } catch (err) {
        printError(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
