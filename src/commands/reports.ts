import { writeFileSync } from "fs";
import { Command } from "commander";
import { AmazonAdsClient } from "../amazon-ads-client.js";
import { printJson, printWarning, printSuccess, toCsv } from "../output.js";
import { runAction, fail } from "../run-action.js";
import { REPORT_PRESET_NAMES, buildReportSpec, isReportPresetName } from "../report-presets.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Write rows to `path` as CSV (default) or JSON when the path ends in .json. */
export function writeReportRows(path: string, rows: unknown[]): void {
  const asJson = path.toLowerCase().endsWith(".json");
  const body = asJson ? JSON.stringify(rows, null, 2) : toCsv(rows as Record<string, unknown>[]);
  writeFileSync(path, body, "utf-8");
}

export function registerReportsCommands(
  program: Command,
  client: AmazonAdsClient,
  resolveProfileId: (opts: { profile?: string }) => string
): void {
  const reports = program.command("reports").description("Manage reports");

  reports
    .command("create")
    .description("Create a Sponsored Products report and (by default) wait for it")
    .requiredOption("--type <preset>", `Report preset (${REPORT_PRESET_NAMES.join(", ")})`)
    .requiredOption("--start <date>", "Start date (YYYY-MM-DD)")
    .requiredOption("--end <date>", "End date (YYYY-MM-DD)")
    .option("--daily", "One row per day instead of a summary over the range")
    .option("--no-wait", "Return the report ID immediately instead of polling")
    .option("--timeout <seconds>", "Max seconds to wait for the report", "600")
    .option("--out <file>", "Write rows to a file (.csv default, .json if the name ends in .json)")
    .option("--profile <id>", "Profile ID")
    .option("--json", "Output rows as JSON to stdout")
    .action(
      runAction(async (opts) => {
        if (!isReportPresetName(opts.type)) {
          fail(`Unknown report type "${opts.type}". Use one of: ${REPORT_PRESET_NAMES.join(", ")}`);
        }
        if (!DATE_RE.test(opts.start) || !DATE_RE.test(opts.end)) {
          fail("Dates must be YYYY-MM-DD.");
        }

        const profileId = resolveProfileId(opts);
        const spec = buildReportSpec(opts.type, opts.start, opts.end, Boolean(opts.daily));
        const { reportId } = await client.createReport(profileId, spec);

        if (!opts.wait) {
          if (opts.json) {
            printJson({ reportId, status: "PENDING" });
          } else {
            printSuccess(`Report requested. Report ID: ${reportId}`);
            console.log(
              `Retrieve with: amazonads reports get --report ${reportId} --profile ${profileId}`
            );
          }
          return;
        }

        const timeoutMs = Math.max(1, parseInt(opts.timeout, 10) || 600) * 1000;
        if (!opts.json)
          printWarning(`Report ${reportId} requested; waiting for Amazon to generate it...`);

        const rows = await client.waitForReport(profileId, reportId, { timeoutMs });

        if (opts.out) {
          writeReportRows(opts.out, rows);
          if (!opts.json) printSuccess(`Wrote ${rows.length} rows to ${opts.out}`);
        }

        // Rows go to stdout unless they were written to a file and JSON was not asked for.
        if (opts.json || !opts.out) printJson(rows);
      })
    );

  reports
    .command("get")
    .description("Get a report by ID")
    .requiredOption("--report <id>", "Report ID")
    .option("--out <file>", "Write rows to a file (.csv default, .json if the name ends in .json)")
    .option("--profile <id>", "Profile ID")
    .option("--json", "Output as JSON")
    .action(
      runAction(async (opts) => {
        const profileId = resolveProfileId(opts);
        const data = await client.getReport(profileId, opts.report);
        const result = data as Record<string, unknown>;

        if (
          result.status === "PENDING" ||
          result.status === "IN_PROGRESS" ||
          result.status === "PROCESSING"
        ) {
          printWarning(`Report ${opts.report} is still processing (status: ${result.status}).`);
          console.log("Try again in a few seconds.");
          if (opts.json) printJson(data);
          return;
        }

        if (result.status === "FAILURE") {
          if (opts.json) printJson(data);
          fail(`Report failed: ${result.reason || "Unknown error"}`);
        }

        const rows = Array.isArray(result.data) ? result.data : [];
        if (opts.out) {
          writeReportRows(opts.out, rows);
          printSuccess(`Wrote ${rows.length} rows to ${opts.out}`);
          if (!opts.json) return;
        }

        printJson(opts.json ? data : (result.data ?? data));
      })
    );
}
