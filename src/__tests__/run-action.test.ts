import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runAction, fail } from "../run-action.js";

describe("runAction", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("passes the action's arguments through and leaves exitCode alone on success", async () => {
    const seen: unknown[] = [];
    await runAction(async (a: string, b: number) => {
      seen.push(a, b);
    })("x", 2);

    expect(seen).toEqual(["x", 2]);
    expect(process.exitCode).toBeUndefined();
  });

  it("reports an unexpected error with an Error: prefix and exit code 1", async () => {
    await runAction(async () => {
      throw new Error("boom");
    })();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Error: boom"));
    expect(process.exitCode).toBe(1);
  });

  it("prints a fail() message verbatim, since it is already user-facing", async () => {
    await runAction(async () => fail("Budget must be a positive number."))();

    const printed = errorSpy.mock.calls[0][0] as string;
    expect(printed).toContain("Budget must be a positive number.");
    expect(printed).not.toContain("Error:");
    expect(process.exitCode).toBe(1);
  });
});
