import { Command } from "commander";
import { AmazonAdsClient } from "../amazon-ads-client.js";
import { printTable, printJson, printError, colorState, formatCurrency } from "../output.js";

interface Portfolio {
  portfolioId: number | string;
  name?: string;
  state?: string;
  inBudget?: boolean;
  budget?: { amount?: number; policy?: string };
}

export function registerPortfoliosCommands(
  program: Command,
  client: AmazonAdsClient,
  resolveProfileId: (opts: { profile?: string }) => string
): void {
  const portfolios = program.command("portfolios").description("Manage portfolios");

  portfolios
    .command("list")
    .description("List portfolios")
    .option("--profile <id>", "Profile ID")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const profileId = resolveProfileId(opts);
        const data = await client.getPortfolios(profileId);

        if (opts.json) {
          printJson(data);
          return;
        }

        const result = data as { portfolios?: Portfolio[] };
        const rows = result.portfolios ?? [];
        if (rows.length === 0) {
          console.log("No portfolios found.");
          return;
        }

        const headers = ["Portfolio ID", "Name", "State", "Budget", "Policy"];
        printTable(
          headers,
          rows.map((p) => [
            String(p.portfolioId),
            p.name || "",
            colorState(p.state || ""),
            p.budget?.amount !== undefined ? formatCurrency(p.budget.amount) : "",
            p.budget?.policy || "",
          ])
        );
      } catch (err) {
        printError(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
