import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerKeywordsCommands } from "../../commands/keywords.js";
import { AmazonAdsClient } from "../../amazon-ads-client.js";

function makeClient() {
  return {
    getKeywords: vi.fn(),
    updateKeywordBid: vi.fn(),
  } as unknown as AmazonAdsClient;
}

function resolveProfileId(_opts: { profile?: string }) {
  return "test-profile-123";
}

describe("keywords commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keywords list outputs JSON when --json flag set", async () => {
    const client = makeClient();
    const mockData = {
      keywords: [
        { keywordId: "1", keywordText: "running shoes", matchType: "EXACT", state: "ENABLED", bid: 1.25 },
      ],
    };
    (client.getKeywords as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const program = new Command();
    program.exitOverride();
    registerKeywordsCommands(program, client, resolveProfileId);

    await program.parseAsync(["node", "cli", "keywords", "list", "--json"]);

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(mockData, null, 2));
  });

  it("keywords list shows message for empty results", async () => {
    const client = makeClient();
    (client.getKeywords as ReturnType<typeof vi.fn>).mockResolvedValue({ keywords: [] });

    const program = new Command();
    program.exitOverride();
    registerKeywordsCommands(program, client, resolveProfileId);

    await program.parseAsync(["node", "cli", "keywords", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith("No keywords found.");
  });

  it("keywords list renders table with keyword data", async () => {
    const client = makeClient();
    (client.getKeywords as ReturnType<typeof vi.fn>).mockResolvedValue({
      keywords: [
        { keywordId: "55", keywordText: "blue widget", matchType: "BROAD", state: "PAUSED", bid: 0.75, campaignId: "10", adGroupId: "20" },
      ],
    });

    const program = new Command();
    program.exitOverride();
    registerKeywordsCommands(program, client, resolveProfileId);

    await program.parseAsync(["node", "cli", "keywords", "list"]);

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain("55");
    expect(output).toContain("blue widget");
  });

  it("keywords update-bid calls updateKeywordBid correctly", async () => {
    const client = makeClient();
    (client.updateKeywordBid as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const program = new Command();
    program.exitOverride();
    registerKeywordsCommands(program, client, resolveProfileId);

    await program.parseAsync([
      "node", "cli", "keywords", "update-bid",
      "--keyword", "kw-123",
      "--bid", "1.50",
    ]);

    expect(client.updateKeywordBid).toHaveBeenCalledWith("test-profile-123", "kw-123", 1.5);
  });

  it("keywords update-bid rejects invalid bid", async () => {
    const client = makeClient();

    const program = new Command();
    program.exitOverride();
    registerKeywordsCommands(program, client, resolveProfileId);

    await program.parseAsync([
      "node", "cli", "keywords", "update-bid",
      "--keyword", "kw-123",
      "--bid", "-5",
    ]);

    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(client.updateKeywordBid).not.toHaveBeenCalled();
  });
});
