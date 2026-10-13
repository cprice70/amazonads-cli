import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { registerReportsCommands } from "../../commands/reports.js";
import { AmazonAdsClient } from "../../amazon-ads-client.js";
import { buildReportSpec } from "../../report-presets.js";
import { toCsv } from "../../output.js";

function makeClient() {
  return {
    createReport: vi.fn(),
    waitForReport: vi.fn(),
    getReport: vi.fn(),
  } as unknown as AmazonAdsClient;
}

function resolveProfileId(_opts: { profile?: string }) {
  return "test-profile-123";
}

describe("report presets", () => {
  it("search-term summary uses startDate/endDate columns", () => {
    const spec = buildReportSpec("search-term", "2026-09-01", "2026-09-30", false);
    expect(spec.reportTypeId).toBe("spSearchTerm");
    expect(spec.groupBy).toEqual(["searchTerm"]);
    expect(spec.timeUnit).toBe("SUMMARY");
    expect(spec.columns.slice(0, 2)).toEqual(["startDate", "endDate"]);
    expect(spec.columns).toContain("searchTerm");
    expect(spec.columns).toContain("sales7d");
  });

  it("daily reports use the date column", () => {
    const spec = buildReportSpec("targeting", "2026-09-01", "2026-09-30", true);
    expect(spec.timeUnit).toBe("DAILY");
    expect(spec.columns[0]).toBe("date");
    expect(spec.columns).toContain("keywordBid");
  });

  it("campaign preset omits portfolioId, which spCampaigns rejects", () => {
    const spec = buildReportSpec("campaign", "2026-09-01", "2026-09-30", false);
    expect(spec.reportTypeId).toBe("spCampaigns");
    expect(spec.columns).not.toContain("portfolioId");
  });
});

describe("toCsv", () => {
  it("unions headers and escapes quotes, commas and newlines", () => {
    const csv = toCsv([
      { a: 1, b: 'say "hi"' },
      { a: 2, c: "x,y\nz" },
    ]);
    expect(csv).toBe('a,b,c\n1,"say ""hi""",\n2,,"x,y\nz"\n');
  });
});

describe("reports commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let dir: string;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    dir = mkdtempSync(join(tmpdir(), "amazonads-test-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports create --no-wait prints the report ID", async () => {
    const client = makeClient();
    (client.createReport as ReturnType<typeof vi.fn>).mockResolvedValue({ reportId: "r-1" });

    const program = new Command();
    program.exitOverride();
    registerReportsCommands(program, client, resolveProfileId);

    await program.parseAsync([
      "node",
      "cli",
      "reports",
      "create",
      "--type",
      "search-term",
      "--start",
      "2026-09-01",
      "--end",
      "2026-09-30",
      "--no-wait",
      "--json",
    ]);

    expect(client.createReport).toHaveBeenCalledWith(
      "test-profile-123",
      expect.objectContaining({ reportTypeId: "spSearchTerm", startDate: "2026-09-01" })
    );
    expect(client.waitForReport).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      JSON.stringify({ reportId: "r-1", status: "PENDING" }, null, 2)
    );
  });

  it("reports create waits and writes CSV to --out", async () => {
    const client = makeClient();
    (client.createReport as ReturnType<typeof vi.fn>).mockResolvedValue({ reportId: "r-2" });
    (client.waitForReport as ReturnType<typeof vi.fn>).mockResolvedValue([
      { campaignName: "A", clicks: 3 },
      { campaignName: "B", clicks: 5 },
    ]);
    const out = join(dir, "rows.csv");

    const program = new Command();
    program.exitOverride();
    registerReportsCommands(program, client, resolveProfileId);

    await program.parseAsync([
      "node",
      "cli",
      "reports",
      "create",
      "--type",
      "campaign",
      "--start",
      "2026-09-01",
      "--end",
      "2026-09-30",
      "--out",
      out,
    ]);

    expect(readFileSync(out, "utf-8")).toBe("campaignName,clicks\nA,3\nB,5\n");
  });

  it("reports create rejects an unknown preset", async () => {
    const client = makeClient();
    const program = new Command();
    program.exitOverride();
    registerReportsCommands(program, client, resolveProfileId);

    await program.parseAsync([
      "node",
      "cli",
      "reports",
      "create",
      "--type",
      "bogus",
      "--start",
      "2026-09-01",
      "--end",
      "2026-09-30",
    ]);

    expect(client.createReport).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("reports get --out writes completed rows as JSON when the name ends in .json", async () => {
    const client = makeClient();
    (client.getReport as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "COMPLETED",
      data: [{ searchTerm: "ghost decor", clicks: 2 }],
    });
    const out = join(dir, "rows.json");

    const program = new Command();
    program.exitOverride();
    registerReportsCommands(program, client, resolveProfileId);

    await program.parseAsync(["node", "cli", "reports", "get", "--report", "r-3", "--out", out]);

    expect(JSON.parse(readFileSync(out, "utf-8"))).toEqual([
      { searchTerm: "ghost decor", clicks: 2 },
    ]);
  });
});
