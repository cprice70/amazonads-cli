import chalk from "chalk";
import Table from "cli-table3";

export function printTable(headers: string[], rows: (string | number)[][]): void {
  const table = new Table({
    head: headers.map((h) => chalk.cyan.bold(h)),
    style: { head: [] },
  });

  for (const row of rows) {
    table.push(row.map(String));
  }

  console.log(table.toString());
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printSuccess(message: string): void {
  console.log(chalk.green(message));
}

export function printError(message: string): void {
  console.error(chalk.red(message));
}

export function printWarning(message: string): void {
  console.warn(chalk.yellow(message));
}

export function colorState(state: string): string {
  switch (state.toUpperCase()) {
    case "ENABLED":
      return chalk.green(state);
    case "PAUSED":
      return chalk.yellow(state);
    case "ARCHIVED":
      return chalk.gray(state);
    default:
      return state;
  }
}

export function formatCurrency(amount: number | string | undefined): string {
  if (amount === undefined || amount === null) return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}
