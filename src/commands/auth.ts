import http from "http";
import { URL } from "url";
import readline from "readline/promises";
import { Command } from "commander";
import { loadConfig, saveConfig, deleteConfig, getConfigPath } from "../config.js";
import { printSuccess, printError, printWarning } from "../output.js";

const REDIRECT_URI = "http://localhost:3000/callback";
const SCOPES = "advertising::campaign_management";

function maskSecret(value: string | undefined): string {
  if (!value) return "(not set)";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
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

        const clientId = await rl.question("Client ID: ");
        const clientSecret = await rl.question("Client Secret: ");

        if (!clientId.trim() || !clientSecret.trim()) {
          printError("Client ID and Client Secret are required.");
          process.exit(1);
        }

        // Build the authorization URL
        const authUrl = new URL("https://www.amazon.com/ap/oa");
        authUrl.searchParams.set("client_id", clientId.trim());
        authUrl.searchParams.set("scope", SCOPES);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("redirect_uri", REDIRECT_URI);

        console.log("\nStarting local callback server on http://localhost:3000...");

        await new Promise<void>((resolve, reject) => {
          const server = http.createServer(async (req, res) => {
            const url = new URL(req.url || "", `http://${req.headers.host}`);

            if (url.pathname !== "/callback") {
              res.writeHead(404);
              res.end("Not found");
              return;
            }

            const code = url.searchParams.get("code");
            const error = url.searchParams.get("error");

            if (error) {
              res.writeHead(400, { "Content-Type": "text/html" });
              res.end(htmlPage("Authorization Failed", `Error: ${error}`));
              printError(`\nAuthorization failed: ${error}`);
              server.close();
              reject(new Error(error));
              return;
            }

            if (!code) {
              res.writeHead(400, { "Content-Type": "text/html" });
              res.end(htmlPage("Missing Authorization Code", "No code received."));
              server.close();
              reject(new Error("No authorization code received"));
              return;
            }

            try {
              const tokenData = new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI,
                client_id: clientId.trim(),
                client_secret: clientSecret.trim(),
              });

              const response = await fetch("https://api.amazon.com/auth/o2/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: tokenData.toString(),
              });

              if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Token exchange failed: ${errText}`);
              }

              const tokens = await response.json() as { refresh_token: string };

              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(htmlPage("Success!", "Your token has been saved. You can close this window."));

              server.close(async () => {
                try {
                  const regionAnswer = await rl.question(
                    "\nRegion (NA/EU/FE) [NA]: "
                  );
                  const sandboxAnswer = await rl.question("Sandbox mode? (y/N): ");

                  const region = regionAnswer.trim().toUpperCase() || "NA";
                  const sandbox = sandboxAnswer.trim().toLowerCase() === "y";

                  const existing = loadConfig();
                  saveConfig({
                    ...existing,
                    clientId: clientId.trim(),
                    clientSecret: clientSecret.trim(),
                    refreshToken: tokens.refresh_token,
                    region,
                    sandbox,
                  });

                  printSuccess(`\nAuthentication successful! Config saved to ${getConfigPath()}`);
                  resolve();
                } catch (e) {
                  reject(e);
                }
              });
            } catch (e) {
              res.writeHead(500, { "Content-Type": "text/html" });
              res.end(htmlPage("Token Exchange Failed", String(e)));
              server.close();
              reject(e);
            }
          });

          server.listen(3000, "127.0.0.1", async () => {
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
            reject(err);
          });
        });
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

function htmlPage(title: string, body: string): string {
  return `<html><body style="font-family:Arial,sans-serif;padding:50px;text-align:center"><h1>${title}</h1><p>${body}</p></body></html>`;
}
