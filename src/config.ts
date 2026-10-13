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

const DEFAULTS: CliConfig = { region: "NA", sandbox: false };

export function getConfigPath(): string {
  return path.join(os.homedir(), ".config", "amazonads-cli", "config.json");
}

export function loadConfig(): CliConfig {
  const configPath = getConfigPath();
  let fileConfig: CliConfig = {};

  let raw: string | undefined;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch {
    // No config file yet; env vars or `auth login` will supply credentials.
  }

  if (raw !== undefined) {
    try {
      fileConfig = JSON.parse(raw) as CliConfig;
    } catch {
      console.warn(`Warning: ${configPath} is not valid JSON and was ignored.`);
    }
  }

  // Precedence: environment variables, then the config file, then defaults.
  const config: CliConfig = { ...DEFAULTS, ...fileConfig };

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

  // The file holds the client secret and refresh token: owner-only access.
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
  // writeFileSync only applies mode on create; tighten an existing file too.
  fs.chmodSync(configPath, 0o600);
}

export function deleteConfig(): void {
  const configPath = getConfigPath();
  try {
    fs.unlinkSync(configPath);
  } catch {
    // File doesn't exist — nothing to do
  }
}
