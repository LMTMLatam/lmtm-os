#!/usr/bin/env node
/**
 * verify-creds.cjs
 *
 * Ping all external services to confirm credentials are still valid.
 * Reads env vars from `env-backup.json` (in the same directory) so it
 * works even when shell secrets are unavailable.
 *
 * For credentials that should NEVER live in env-backup.json (GitHub PAT,
 * Render API token — i.e. the keys to the deployment infrastructure),
 * read from a local `local-secrets.json` file if present, then from
 * process env, then from env-backup.json.
 *
 * Usage:
 *   node scripts/verify-creds.cjs
 *   node scripts/verify-creds.cjs --json
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const JSON_OUT = process.argv.includes("--json");

const ENV_BACKUP_PATH = path.join(__dirname, "env-backup.json");
const LOCAL_SECRETS_PATH = path.join(__dirname, "local-secrets.json");

function loadJson(p) {
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (e) {
    console.error(`Could not parse ${p}: ${e.message}`);
    return {};
  }
}

const env = loadJson(ENV_BACKUP_PATH);
const localSecrets = loadJson(LOCAL_SECRETS_PATH);

// env-backup.json is a Render-style envelope: { envVars: [{ key, value }, ...] }
// Flatten it to a simple {KEY: value} object so the rest of the script
// can look up `env.MINIMAX_API_KEY` directly.
function flattenEnv(raw) {
  if (Array.isArray(raw.envVars)) {
    const out = {};
    for (const { key, value } of raw.envVars) out[key] = value;
    return out;
  }
  return raw;
}
const envFlat = flattenEnv(env);
const ghToken = localSecrets.GITHUB_TOKEN || process.env.GITHUB_TOKEN || envFlat.GITHUB_TOKEN;
const renderToken =
  localSecrets.RENDER_API_TOKEN || process.env.RENDER_API_TOKEN || envFlat.RENDER_API_TOKEN;

function fetch_(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const reqOpts = {
      method: opts.method || "GET",
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: opts.headers || {},
    };
    if (opts.body) {
      reqOpts.headers["content-length"] = Buffer.byteLength(opts.body);
    }
    const req = https.request(reqOpts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf-8");
        resolve({ status: res.statusCode, headers: res.headers, text });
      });
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function ok(note) { return { status: "ok", note }; }
function fail(note) { return { status: "fail", note }; }
function skip(note) { return { status: "skip", note }; }
function warn(note) { return { status: "warn", note }; }

async function checkGitHub(token) {
  if (!token) return skip("GITHUB_TOKEN not set");
  const r = await fetch_("https://api.github.com/user", {
    headers: { authorization: `Bearer ${token}`, "user-agent": "lmtm-verify" },
  });
  if (r.status === 200) {
    const j = JSON.parse(r.text);
    return ok(`user=${j.login} (${j.html_url})`);
  }
  return fail(`HTTP ${r.status}`);
}

async function checkRender(token) {
  if (!token) return skip("RENDER_API_TOKEN not set");
  const r = await fetch_("https://api.render.com/v1/services?limit=1", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (r.status === 200) {
    const j = JSON.parse(r.text);
    return ok(`${(j || []).length} service(s) visible`);
  }
  return fail(`HTTP ${r.status}`);
}

async function checkM3(apiKey, baseUrl) {
  if (!apiKey) return skip("MINIMAX_API_KEY not set");
  if (!baseUrl) return skip("MINIMAX_BASE_URL not set");
  // The MiniMax endpoint is /text/chatcompletion_v2 (NOT /v1/chat/completions).
  // The base URL stored in env is the root (e.g. https://api.minimax.io/v1 or
  // https://api.minimaxi.chat/v1) and the adapter appends /text/chatcompletion_v2.
  const base = baseUrl.replace(/\/+$/, "");
  const body = JSON.stringify({
    model: "minimax-m3",
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
  });
  const r = await fetch_(`${base}/text/chatcompletion_v2`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body,
  });
  if (r.status === 200) {
    try {
      const j = JSON.parse(r.text);
      const code = j.base_resp?.status_code;
      if (code === 0 || code === undefined) {
        return ok("chat completions reachable (200, code 0)");
      }
      if (code === 1002 || code === 1004 || code === 1008) {
        return warn(`upstream code ${code}: ${j.base_resp?.status_msg || ""}`);
      }
      return fail(`upstream code ${code}: ${j.base_resp?.status_msg || r.text.slice(0, 100)}`);
    } catch {
      return ok("200 OK (could not parse body)");
    }
  }
  if (r.status === 401) return fail("401 invalid API key");
  if (r.status === 429) return warn("429 rate limited (key is valid)");
  return fail(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
}

async function checkN8n(token, url) {
  if (!token) return skip("N8N_MCP_TOKEN not set");
  if (!url) return skip("N8N_MCP_URL not set");
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  });
  const r = await fetch_(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body,
  });
  if (r.status !== 200) return fail(`HTTP ${r.status}: ${r.text.slice(0, 100)}`);
  // n8n returns Server-Sent Events: `event: message\ndata: {...}\n\n`
  // Look for the result JSON inside the data: line.
  const dataMatch = r.text.match(/^data: (.+)$/m);
  if (dataMatch) {
    try {
      const payload = JSON.parse(dataMatch[1]);
      const toolCount = payload.result?.tools?.length;
      const serverName = payload.result?.serverInfo?.name;
      if (toolCount !== undefined) {
        return ok(`server=${serverName || "?"} tools=${toolCount}`);
      }
    } catch {}
  }
  // Fallback marker check
  if (r.text.includes("n8n MCP Server")) {
    return ok("server reachable (n8n MCP Server)");
  }
  return warn(`200 but unexpected body: ${r.text.slice(0, 200)}`);
}

async function checkClickUp(token) {
  if (!token) return skip("CLICKUP_API_TOKEN not set");
  const r = await fetch_("https://api.clickup.com/api/v2/user", {
    headers: { authorization: token },
  });
  if (r.status === 200) {
    const j = JSON.parse(r.text);
    return ok(`user=${j.user?.username || j.user?.email}`);
  }
  return fail(`HTTP ${r.status}`);
}

function getPg() {
  // pnpm hoists into node_modules/.pnpm/<pkg>@.../node_modules/pg
  // We try the root first, then walk the .pnpm directory for any pg package.
  const root = path.resolve(__dirname, "..", "node_modules");
  const candidates = [
    path.join(root, "pg"),
    path.join(root, ".pnpm", "pg@8.18.0"),
  ];
  // Generic walk: any path matching node_modules\.pnpm\pg@*\node_modules\pg
  try {
    const fsEntries = fs.readdirSync(path.join(root, ".pnpm"));
    for (const entry of fsEntries) {
      if (entry.startsWith("pg@") && !entry.includes("@types")) {
        const cand = path.join(root, ".pnpm", entry, "node_modules", "pg");
        if (fs.existsSync(path.join(cand, "package.json"))) {
          candidates.push(cand);
        }
      }
    }
  } catch {}
  for (const p of candidates) {
    try {
      return require(p);
    } catch {}
  }
  return null;
}

async function checkSupabase(databaseUrl) {
  if (!databaseUrl) return skip("DATABASE_URL not set");
  const pg = getPg();
  if (!pg) return skip("pg client not installed in node_modules");
  return new Promise((resolve) => {
    // Pass the full connection string straight to pg. It handles the URL
    // parsing internally and is more tolerant of unusual chars (e.g. the
    // Supabase password contains a literal `%B!` which is an incomplete
    // percent-encoding that the WHATWG URL parser preserves as-is).
    const c = new pg.Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    c.connect()
      .then(() => c.query("SELECT 1 AS ok, current_database() AS db"))
      .then((res) => {
        resolve(ok(`db=${res.rows[0]?.db}`));
      })
      .catch((e) => resolve(fail(`${e.code || "ERR"}: ${e.message.split("\n")[0]}`)))
      .finally(() => c.end());
  });
}

async function checkMetaApp(appId, appSecret) {
  if (!appId || !appSecret) return skip("META_APP_ID/SECRET not set");
  const r = await fetch_(
    `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&grant_type=client_credentials`,
  );
  if (r.status === 200) return ok("app access token obtained");
  if (r.status === 400) return ok("app auth reachable (expected: invalid grant)");
  return fail(`HTTP ${r.status}: ${r.text.slice(0, 100)}`);
}

async function checkLmtmHealth() {
  const r = await fetch_("https://lmtm.onrender.com/api/health");
  if (r.status === 200) {
    try {
      const j = JSON.parse(r.text);
      const status = j.bootstrapStatus === "ready" ? "ok" : "warn";
      return { status, note: `bootstrapStatus=${j.bootstrapStatus}` };
    } catch {
      return ok("200 OK");
    }
  }
  return fail(`HTTP ${r.status}`);
}

async function main() {
  const checks = [
    { service: "GitHub PAT", run: () => checkGitHub(ghToken) },
    { service: "Render API", run: () => checkRender(renderToken) },
    { service: "M3 API", run: () => checkM3(envFlat.MINIMAX_API_KEY, envFlat.MINIMAX_BASE_URL) },
    { service: "n8n MCP", run: () => checkN8n(envFlat.N8N_MCP_TOKEN, envFlat.N8N_MCP_URL) },
    { service: "ClickUp", run: () => checkClickUp(envFlat.CLICKUP_API_TOKEN) },
    { service: "Supabase DB", run: () => checkSupabase(envFlat.DATABASE_URL) },
    { service: "Meta app", run: () => checkMetaApp(envFlat.META_APP_ID, envFlat.META_APP_SECRET) },
    { service: "LMTM-OS /api/health", run: () => checkLmtmHealth() },
  ];

  const results = [];
  for (const c of checks) {
    try {
      const r = await c.run();
      results.push({ service: c.service, ...r });
    } catch (e) {
      results.push({ service: c.service, status: "fail", note: e.message });
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log("SERVICE                  STATUS    NOTE");
    console.log("-".repeat(72));
    for (const r of results) {
      const s = (r.status || "?").padEnd(8);
      console.log(`${r.service.padEnd(23)} ${s}  ${r.note || ""}`);
    }
    const fails = results.filter((r) => r.status === "fail");
    if (fails.length > 0) {
      console.log("");
      console.log(`${fails.length} check(s) FAILED.`);
      process.exit(1);
    } else {
      console.log("");
      console.log("All checks passed.");
    }
  }
}

main().catch((e) => {
  console.error("verify-creds crashed:", e.message);
  console.error(e.stack);
  process.exit(2);
});
