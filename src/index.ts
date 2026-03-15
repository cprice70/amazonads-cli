#!/usr/bin/env node
import "dotenv/config";
import { program } from "commander";
import { loadConfig } from "./config.js";
import { AmazonAdsClient } from "./amazon-ads-client.js";
import { printError } from "./output.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerProfilesCommands } from "./commands/profiles.js";
import { registerCampaignsCommands } from "./commands/campaigns.js";
import { registerKeywordsCommands } from "./commands/keywords.js";
import { registerAdsCommands } from "./commands/ads.js";
import { registerReportsCommands } from "./commands/reports.js";

const config = loadConfig();

const client = new AmazonAdsClient({
  clientId: config.clientId,
  clientSecret: config.clientSecret,
  refreshToken: config.refreshToken,
  region: config.region,
  sandbox: config.sandbox,
});

function resolveProfileId(opts: { profile?: string }): string {
  const profileId =
    opts.profile ||
    process.env.AMAZON_ADS_PROFILE_ID ||
    config.defaultProfileId;

  if (!profileId) {
    printError(
      "Profile ID is required. Use --profile <id>, set AMAZON_ADS_PROFILE_ID, or set defaultProfileId in config."
    );
    process.exit(1);
  }

  return profileId;
}

program
  .name("amazonads")
  .description("Amazon Ads CLI")
  .version("0.1.0");

registerAuthCommands(program);
registerProfilesCommands(program, client);
registerCampaignsCommands(program, client, resolveProfileId);
registerKeywordsCommands(program, client, resolveProfileId);
registerAdsCommands(program, client, resolveProfileId);
registerReportsCommands(program, client, resolveProfileId);

program.parse();
