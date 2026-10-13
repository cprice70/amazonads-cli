import http from "http";
import { randomBytes } from "crypto";
import { URL } from "url";
import readline from "readline/promises";
import { Command } from "commander";
import { loadConfig, saveConfig, deleteConfig, getConfigPath } from "../config.js";
import { printSuccess, printError, printWarning } from "../output.js";
import {
  buildConsentUrl,
  getTokenUrl,
  normalizeRegion,
  parseCallback,
  REGIONS,
} from "../lwa.js";

const CALLBACK_PORT = 3000;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;

function maskSecret(value: string | undefined): string {
  if (!value) return "(not set)";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

/** Escape a value for interpolation into the callback HTML page. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Turn a listen() failure into something the user can act on. */
export function listenErrorMessage(err: unknown, port: number): string {
  const code = (err as { code?: string })?.code;
  if (code === "EADDRINUSE") {
    return (
      `Port ${port} is already in use, so the OAuth callback server cannot start. ` +
      `Stop whatever is listening on ${port} (often a dev server) and run auth login again.`
    );
  }
  return err instanceof Error ? err.message : String(err);
}

function htmlPage(title: string, body: string): string {
  return (
    `<html><body style="font-family:Arial,sans-serif;padding:50px;text-align:center">` +
    `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`
  );
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Manage authentication");

  auth
    .command("login")
    .description("Authenticate with Amazon Ads OAuth")
    .action(async () => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      try {
        console.log("\nAmazon Ads CLI — OAuth Login");
        console.log("=============================\n");

        const clientId = (await rl.question("Client ID: ")).trim();
        const clientSecret = (await rl.question("Client Secret: ")).trim();

        if (!clientId || !clientSecret) {
          printError("Client ID and Client Secret are required.");
          process.exit(1);
        }

        // Region picks the Login with Amazon consent page, so ask before opening the browser.
        const regionAnswer = await rl.question(`Region (${REGIONS.join("/")}) [NA]: `);
        const region = normalizeRegion(regionAnswer);
        const sandboxAnswer = await rl.question("Sandbox mode? (y/N): ");
        const sandbox = sandboxAnswer.trim().toLowerCase() === "y";

        // Random state ties the callback to this login attempt (CSRF protection).
        const state = randomBytes(16).toString("hex");
        const authUrl = buildConsentUrl(region, clientId, REDIRECT_URI, state);

        console.log(`\nStarting local callback server on http://localhost:${CALLBACK_PORT}...`);

        const refreshToken = await new Promise<string>((resolve, reject) => {
          const server = http.createServer(async (req, res) => {
            const url = new URL(req.url || "", `http://${req.headers.host}`);

            if (url.pathname !== "/callback") {
              res.writeHead(404);
              res.end("Not found");
              return;
            }

            let code: string;
            try {
              code = parseCallback(url.searchParams, state);
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              res.writeHead(400, { "Content-Type": "text/html" });
              res.end(htmlPage("Authorization Failed", message));
              server.close();
              reject(new Error(message));
              return;
            }

            try {
              const tokenData = new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI,
                client_id: clientId,
                client_secret: clientSecret,
              });

              const response = await fetch(getTokenUrl(region), {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: tokenData.toString(),
              });

              if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Token exchange failed: ${errText}`);
              }

              const tokens = (await response.json()) as { refresh_token: string };

              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(htmlPage("Success!", "Your token has been saved. You can close this window."));
              server.close(() => resolve(tokens.refresh_token));
            } catch (e) {
              res.writeHead(500, { "Content-Type": "text/html" });
              res.end(htmlPage("Token Exchange Failed", e instanceof Error ? e.message : String(e)));
              server.close();
              reject(e);
            }
          });

          server.listen(CALLBACK_PORT, "127.0.0.1", async () => {
            console.log("Callback server started.\n");
            console.log("Opening browser to Amazon OAuth...");
            console.log(`\n  ${authUrl.toString()}\n`);
            console.log("If the browser doesn't open, copy and paste the URL above.\n");
            console.log("Waiting for authorization...\n");

            try {
              const open = await import("open");
              await open.default(authUrl.toString());
            } catch {
              // open not available; user will copy/paste
            }
          });

          server.on("error", (err) => {
            reject(new Error(listenErrorMessage(err, CALLBACK_PORT)));
          });
        });

        const existing = loadConfig();
        saveConfig({
          ...existing,
          clientId,
          clientSecret,
          refreshToken,
          region,
          sandbox,
        });

        printSuccess(`\nAuthentication successful! Config saved to ${getConfigPath()}`);
      } catch (err) {
        printError(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      } finally {
        rl.close();
      }
    });

  auth
    .command("status")
    .description("Show current authentication status")
    .action(() => {
      const config = loadConfig();
      console.log("\nAmazon Ads CLI — Auth Status");
      console.log("=============================\n");
      console.log(`Client ID:        ${maskSecret(config.clientId)}`);
      console.log(`Client Secret:    ${maskSecret(config.clientSecret)}`);
      console.log(`Refresh Token:    ${maskSecret(config.refreshToken)}`);
      console.log(`Region:           ${config.region || "(not set)"}`);
      console.log(`Sandbox:          ${config.sandbox ? "yes" : "no"}`);
      console.log(`Default Profile:  ${config.defaultProfileId || "(not set)"}`);
      console.log(`Config File:      ${getConfigPath()}\n`);

      const hasCredentials = config.clientId && config.clientSecret && config.refreshToken;
      if (hasCredentials) {
        printSuccess("Status: Authenticated");
      } else {
        printWarning('Status: Not authenticated — run "amazonads auth login"');
      }
    });

  auth
    .command("logout")
    .description("Remove saved credentials")
    .action(() => {
      deleteConfig();
      printSuccess("Logged out. Config file deleted.");
    });
}
