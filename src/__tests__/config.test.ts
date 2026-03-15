import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { getConfigPath, loadConfig, saveConfig, deleteConfig } from "../config.js";

describe("config", () => {
  const testConfigDir = path.join(os.tmpdir(), "amazonads-cli-test-" + Date.now());

  beforeEach(() => {
    vi.spyOn(os, "homedir").mockReturnValue(testConfigDir);
    delete process.env.AMAZON_ADS_CLIENT_ID;
    delete process.env.AMAZON_ADS_CLIENT_SECRET;
    delete process.env.AMAZON_ADS_REFRESH_TOKEN;
    delete process.env.AMAZON_ADS_REGION;
    delete process.env.AMAZON_ADS_SANDBOX;
    delete process.env.AMAZON_ADS_PROFILE_ID;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("getConfigPath returns correct path", () => {
    const p = getConfigPath();
    expect(p).toContain("amazonads-cli");
    expect(p).toContain("config.json");
  });

  it("loadConfig returns empty config when file does not exist", () => {
    const config = loadConfig();
    expect(config.clientId).toBeUndefined();
    expect(config.refreshToken).toBeUndefined();
  });

  it("saveConfig and loadConfig round-trip", () => {
    const testConfig = {
      clientId: "test-client-id",
      clientSecret: "test-secret",
      refreshToken: "test-refresh-token",
      region: "EU",
      sandbox: true,
      defaultProfileId: "12345",
    };

    saveConfig(testConfig);
    const loaded = loadConfig();

    expect(loaded.clientId).toBe("test-client-id");
    expect(loaded.clientSecret).toBe("test-secret");
    expect(loaded.refreshToken).toBe("test-refresh-token");
    expect(loaded.region).toBe("EU");
    expect(loaded.sandbox).toBe(true);
    expect(loaded.defaultProfileId).toBe("12345");
  });

  it("env vars take precedence over file config", () => {
    saveConfig({ clientId: "file-client-id", region: "NA" });

    process.env.AMAZON_ADS_CLIENT_ID = "env-client-id";
    process.env.AMAZON_ADS_REGION = "EU";

    const config = loadConfig();
    expect(config.clientId).toBe("env-client-id");
    expect(config.region).toBe("EU");
  });

  it("deleteConfig removes the config file", () => {
    saveConfig({ clientId: "test" });
    expect(fs.existsSync(getConfigPath())).toBe(true);

    deleteConfig();
    expect(fs.existsSync(getConfigPath())).toBe(false);
  });

  it("deleteConfig does not throw when file does not exist", () => {
    expect(() => deleteConfig()).not.toThrow();
  });
});
