import { printError } from "./output.js";

/** An error whose message is already written for the user; printed without a prefix. */
export class CliError extends Error {}

/** Abort the current command with a user-facing message. */
export function fail(message: string): never {
  throw new CliError(message);
}

/**
 * Wrap a commander action so any thrown error is printed once and the
 * process exits non-zero after stdout has flushed. Using exitCode instead
 * of process.exit() keeps the action testable and never truncates output.
 */
export function runAction<T extends unknown[]>(
  fn: (...args: T) => Promise<void> | void
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (err) {
      if (err instanceof CliError) {
        printError(err.message);
      } else {
        printError(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exitCode = 1;
    }
  };
}
