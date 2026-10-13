import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerCampaignsCommands } from "../../commands/campaigns.js";
import { AmazonAdsClient } from "../../amazon-ads-client.js";

function makeClient() {
  return {
    getCampaigns: vi.fn(),
    getCampaignPerformance: vi.fn(),
    createCampaign: vi.fn(),
    archiveCampaign: vi.fn(),
  } as unknown as AmazonAdsClient;
}

function resolveProfileId(_opts: { profile?: string }) {
  return "test-profile-123";
}

describe("campaigns commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("campaigns list outputs JSON when --json flag is set", async () => {
    const client = makeClient();
    const mockData = {
      campaigns: [
        {
          campaignId: "1",
          name: "Test Campaign",
          state: "ENABLED",
          budget: { budget: 10 },
          startDate: "2024-01-01",
          targetingType: "MANUAL",
        },
      ],
    };
    (client.getCampaigns as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const program = new Command();
    program.exitOverride();
    registerCampaignsCommands(program, client, resolveProfileId);

    await program.parseAsync(["node", "cli", "campaigns", "list", "--json"]);

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(mockData, null, 2));
  });

  it("campaigns list shows 'No campaigns found.' for empty response", async () => {
    const client = makeClient();
    (client.getCampaigns as ReturnType<typeof vi.fn>).mockResolvedValue({ campaigns: [] });

    const program = new Command();
    program.exitOverride();
    registerCampaignsCommands(program, client, resolveProfileId);

    await program.parseAsync(["node", "cli", "campaigns", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith("No campaigns found.");
  });

  it("campaigns performance computes ACoS from cost and 7-day sales", async () => {
    const client = makeClient();
    (client.getCampaignPerformance as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        campaignId: "7",
        campaignName: "Perf",
        impressions: 1000,
        clicks: 50,
        cost: 25,
        sales7d: 100,
      },
    ]);

    const program = new Command();
    program.exitOverride();
    registerCampaignsCommands(program, client, resolveProfileId);

    await program.parseAsync([
      "node",
      "cli",
      "campaigns",
      "performance",
      "--campaign",
      "7",
      "--start",
      "2026-10-01",
      "--end",
      "2026-10-10",
    ]);

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain("$25.00");
    expect(output).toContain("$100.00");
    expect(output).toContain("25.0%");
  });

  it("campaigns list renders table for campaign data", async () => {
    const client = makeClient();
    (client.getCampaigns as ReturnType<typeof vi.fn>).mockResolvedValue({
      campaigns: [
        {
          campaignId: "42",
          name: "My Campaign",
          state: "PAUSED",
          budget: { budget: 50.0 },
          startDate: "2024-06-01",
          targetingType: "AUTO",
        },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerCampaignsCommands(program, client, resolveProfileId);

    await program.parseAsync(["node", "cli", "campaigns", "list"]);

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain("42");
    expect(output).toContain("My Campaign");
  });

  it("campaigns create calls createCampaign with correct args", async () => {
    const client = makeClient();
    (client.createCampaign as ReturnType<typeof vi.fn>).mockResolvedValue({
      campaigns: [{ campaignId: "99" }],
    });

    const program = new Command();
    program.exitOverride();
    registerCampaignsCommands(program, client, resolveProfileId);

    await program.parseAsync([
      "node",
      "cli",
      "campaigns",
      "create",
      "--name",
      "New Campaign",
      "--type",
      "sponsoredProducts",
      "--targeting",
      "manual",
      "--budget",
      "25.00",
      "--start",
      "2024-07-01",
    ]);

    expect(client.createCampaign).toHaveBeenCalledWith(
      "test-profile-123",
      "New Campaign",
      "sponsoredProducts",
      "MANUAL",
      25,
      "2024-07-01"
    );
  });

  it("campaigns create rejects invalid budget", async () => {
    const client = makeClient();

    const program = new Command();
    program.exitOverride();
    registerCampaignsCommands(program, client, resolveProfileId);

    await program.parseAsync([
      "node",
      "cli",
      "campaigns",
      "create",
      "--name",
      "Bad Campaign",
      "--type",
      "sponsoredProducts",
      "--targeting",
      "MANUAL",
      "--budget",
      "abc",
      "--start",
      "2024-07-01",
    ]);

    expect(process.exitCode).toBe(1);
  });
});

describe("campaigns option validation", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeProgram(client: AmazonAdsClient): Command {
    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
    registerCampaignsCommands(program, client, resolveProfileId);
    return program;
  }

  it("rejects an unknown campaign type on list", async () => {
    const program = makeProgram(makeClient());

    await expect(
      program.parseAsync(["node", "cli", "campaigns", "list", "--type", "sponsoredFoo"])
    ).rejects.toThrow(/sponsoredProducts, sponsoredBrands, sponsoredDisplay/);
  });

  it("accepts state in any case and passes the canonical value on", async () => {
    const client = makeClient();
    (client.getCampaigns as ReturnType<typeof vi.fn>).mockResolvedValue({ campaigns: [] });

    await makeProgram(client).parseAsync([
      "node",
      "cli",
      "campaigns",
      "list",
      "--state",
      "enabled",
    ]);

    expect(client.getCampaigns).toHaveBeenCalledWith("test-profile-123", "ENABLED", undefined);
  });

  it("only allows sponsoredProducts on create", async () => {
    const program = makeProgram(makeClient());

    await expect(
      program.parseAsync([
        "node",
        "cli",
        "campaigns",
        "create",
        "--name",
        "x",
        "--type",
        "sponsoredBrands",
        "--targeting",
        "MANUAL",
        "--budget",
        "5",
        "--start",
        "2026-10-13",
      ])
    ).rejects.toThrow(/sponsoredProducts/);
  });

  it("rejects an unknown targeting type on create", async () => {
    const program = makeProgram(makeClient());

    await expect(
      program.parseAsync([
        "node",
        "cli",
        "campaigns",
        "create",
        "--name",
        "x",
        "--type",
        "sponsoredProducts",
        "--targeting",
        "broad",
        "--budget",
        "5",
        "--start",
        "2026-10-13",
      ])
    ).rejects.toThrow(/MANUAL, AUTO/);
  });
});
