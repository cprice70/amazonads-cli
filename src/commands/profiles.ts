import { Command } from "commander";
import { AmazonAdsClient } from "../amazon-ads-client.js";
import { printTable, printJson, printError } from "../output.js";

interface Profile {
  profileId: number | string;
  accountInfo?: {
    name?: string;
    type?: string;
    marketplaceStringId?: string;
  };
  countryCode?: string;
  currencyCode?: string;
  timezone?: string;
}

export function registerProfilesCommands(
  program: Command,
  client: AmazonAdsClient
): void {
  program
    .command("profiles")
    .description("List Amazon Ads profiles")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const data = await client.getProfiles();
        const profiles = data as Profile[];

        if (opts.json) {
          printJson(profiles);
          return;
        }

        const headers = ["Profile ID", "Name", "Type", "Country", "Currency", "Timezone"];
        const rows = profiles.map((p) => [
          String(p.profileId),
          p.accountInfo?.name || "",
          p.accountInfo?.type || "",
          p.countryCode || p.accountInfo?.marketplaceStringId || "",
          p.currencyCode || "",
          p.timezone || "",
        ]);

        printTable(headers, rows);
      } catch (err) {
        printError(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
