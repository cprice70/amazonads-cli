import fs from "fs";
import path from "path";
import os from "os";

export interface CliConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  region?: string;
  sandbox?: boolean;
  defaultProfileId?: string;
}

export function getConfigPath(): string {
  return path.join(os.homedir(), ".config", "amazonads-cli", "config.json");
}

export function loadConfig(): CliConfig {
  const configPath = getConfigPath();
  let fileConfig: CliConfig = {};

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    fileConfig = JSON.parse(raw) as CliConfig;
  } catch {
    // File doesn't exist or is invalid — start with empty config
  }

  // Environment variables take precedence over file config
  const config: CliConfig = { ...fileConfig };

  if (process.env.AMAZON_ADS_CLIENT_ID) {
    config.clientId = process.env.AMAZON_ADS_CLIENT_ID;
  }
  if (process.env.AMAZON_ADS_CLIENT_SECRET) {
    config.clientSecret = process.env.AMAZON_ADS_CLIENT_SECRET;
  }
  if (process.env.AMAZON_ADS_REFRESH_TOKEN) {
    config.refreshToken = process.env.AMAZON_ADS_REFRESH_TOKEN;
  }
  if (process.env.AMAZON_ADS_REGION) {
    config.region = process.env.AMAZON_ADS_REGION;
  }
  if (process.env.AMAZON_ADS_SANDBOX) {
    config.sandbox = process.env.AMAZON_ADS_SANDBOX === "true";
  }
  if (process.env.AMAZON_ADS_PROFILE_ID) {
    config.defaultProfileId = process.env.AMAZON_ADS_PROFILE_ID;
  }

  return config;
}

export function saveConfig(config: CliConfig): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function deleteConfig(): void {
  const configPath = getConfigPath();
  try {
    fs.unlinkSync(configPath);
  } catch {
    // File doesn't exist — nothing to do
  }
}
