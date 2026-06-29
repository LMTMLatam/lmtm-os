#!/usr/bin/env node
// One-shot helper to obtain a long-lived Google refresh token for the LMTM-OS
// pipeline (Sheets · Drive · Apps Script). Runs a loopback server, opens the
// consent screen, captures the auth code, and exchanges it for tokens.
//
// Usage:
//   node scripts/google-oauth-token.mjs <CLIENT_ID> <CLIENT_SECRET>
//
// Log in with grow@bylmtm.com when the browser opens. The script prints the
// refresh_token at the end.

import http from "node:http";
import { URL, URLSearchParams } from "node:url";
import { exec } from "node:child_process";

const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Usage: node google-oauth-token.mjs <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

const PORT = 4117;
const REDIRECT_URI = `http://localhost:${PORT}`;
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/script.projects",
  "https://www.googleapis.com/auth/script.deployments",
];

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  }).toString();

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === "win32"
      ? `start "" "${url}"`
      : platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function exchangeCode(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }).toString(),
  });
  return res.json();
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, REDIRECT_URI);
  const code = reqUrl.searchParams.get("code");
  const error = reqUrl.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h2>Error: ${error}</h2>`);
    console.error("\n[ERROR] Authorization denied:", error);
    server.close();
    process.exit(1);
  }
  if (!code) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h2>Esperando autorización…</h2>");
    return;
  }

  const tokens = await exchangeCode(code);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  if (tokens.refresh_token) {
    res.end(
      "<h2>✅ Listo. Ya podés cerrar esta pestaña y volver a la terminal.</h2>",
    );
    console.log("\n========================================");
    console.log("REFRESH_TOKEN:", tokens.refresh_token);
    console.log("========================================\n");
    console.log("Scopes:", tokens.scope);
    console.log("Expires in:", tokens.expires_in, "s (access token)");
  } else {
    res.end(`<h2>⚠️ No vino refresh_token.</h2><pre>${JSON.stringify(tokens, null, 2)}</pre>`);
    console.error("\n[WARN] No refresh_token in response:", JSON.stringify(tokens, null, 2));
  }
  server.close();
  setTimeout(() => process.exit(0), 500);
});

server.listen(PORT, () => {
  console.log(`\nLoopback server escuchando en ${REDIRECT_URI}`);
  console.log("\nAbrí esta URL (o se abre sola) y logueate con grow@bylmtm.com:\n");
  console.log(authUrl + "\n");
  openBrowser(authUrl);
});
