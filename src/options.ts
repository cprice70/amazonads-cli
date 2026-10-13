import { InvalidArgumentError, Option } from "commander";

export const CAMPAIGN_TYPES = ["sponsoredProducts", "sponsoredBrands", "sponsoredDisplay"] as const;
export const CAMPAIGN_STATES = ["ENABLED", "PAUSED", "ARCHIVED"] as const;
export const TARGETING_TYPES = ["MANUAL", "AUTO"] as const;

/**
 * An option restricted to a fixed set of values. Matching is case-insensitive
 * and the canonical spelling is what the action receives, so `--state enabled`
 * arrives as "ENABLED".
 */
export function choiceOption(
  flags: string,
  description: string,
  choices: readonly string[]
): Option {
  const list = choices.join(", ");
  return new Option(flags, `${description} (${list})`).argParser((value: string) => {
    const match = choices.find((c) => c.toLowerCase() === value.toLowerCase());
    if (!match) {
      throw new InvalidArgumentError(`Allowed choices are ${list}.`);
    }
    return match;
  });
}
