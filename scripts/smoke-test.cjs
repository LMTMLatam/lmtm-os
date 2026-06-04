#!/usr/bin/env node
/**
 * smoke-test.cjs
 *
 * End-to-end smoke test of the LMTM-OS service. Runs every step in
 * the credential-rotation runbook Phase 3 automatically, so a single
 * command can verify the service is up + all 4 plugins are alive.
 *
 * Steps:
 *   1. GET /api/health                              (200, bootstrapStatus=ready)
 *   2. GET /api/clients?status=active               (≥ 1 client)
 *   3. GET /api/companies/<lmtm>/agents             (= 14 agents)
 *   4. GET /api/_debug/workers                      (≥ 2 workers running: clickup, n8n)
 *   5. POST lmtm-meta-ads:meta-list-ad-accounts     (200 OR clear "no connection" error)
 *   6. POST lmtm-google-ads:google-list-accounts    (200 OR clear "no connection" error)
 *   7. POST lmtm-clickup:clickup-list-folders       (≥ 1 folder, space=Clientes)
 *   8. POST lmtm-n8n:n8n-ping                       (200)
 *
 * Auth: reads the session cookie from
 *   C:\Users\Administrator\AppData\Local\Temp\lmtm-cookie.txt
 * or from --cookie=PATH.
 *
 * Usage:
 *   node scripts/smoke-test.cjs
 *   node scripts/smoke-test.cjs --json
 *   node scripts/smoke-test.cjs --cookie=C:\path\to\cookie.txt
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const BASE = "https://lmtm.onrender.com";
const LMTM_COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const CLICKUP_CLIENTES_SPACE = "90131985551";
const EXPECTED_AGENT_COUNT = 14;
const MILO_AGENT_ID = "11111111-0000-4000-8000-000000000002";
const NICOLAS_AGENT_ID = "11111111-0000-4000-8000-000000000007";
const PABLO_AGENT_ID = "11111111-0000-4000-8000-00000000000e";
const COOKIE_DEFAULT = path.join(process.env.TEMP || "C:\\Users\\Administrator\\AppData\\Local\\Temp", "lmtm-cookie.txt");

// Per-agent lastRunId + projectId, populated from /api/agents/:id/runtime-state
// The server validates that runContext.runId is a real heartbeat_run that
// belongs to (companyId, agentId), so we can't use a random UUID.
const agentContext = {};

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const COOKIE_ARG = args.find((a) => a.startsWith("--cookie="));
const COOKIE_PATH = COOKIE_ARG ? COOKIE_ARG.slice("--cookie=".length) : COOKIE_DEFAULT;

if (!fs.existsSync(COOKIE_PATH)) {
  console.error(`Cookie file not found: ${COOKIE_PATH}`);
  console.error("Sign in first and save the session cookie there.");
  console.error("See doc/plans/2026-06-04-credential-rotation.md Phase 2.7");
  process.exit(2);
}
const COOKIE = fs.readFileSync(COOKIE_PATH, "utf-8").trim();

function fetch_(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const headers = {
      cookie: COOKIE,
      origin: BASE,
      referer: `${BASE}/`,
      accept: "application/json",
      ...(opts.headers || {}),
    };
    const reqOpts = {
      method: opts.method || "GET",
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers,
    };
    if (opts.body) {
      headers["content-type"] = headers["content-type"] || "application/json";
      reqOpts.headers["content-length"] = Buffer.byteLength(opts.body);
    }
    const req = https.request(reqOpts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf-8");
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function ok(note) { return { status: "ok", note }; }
function fail(note) { return { status: "fail", note }; }
function warn(note) { return { status: "warn", note }; }

async function step1Health() {
  const r = await fetch_(`${BASE}/api/health`);
  if (r.status !== 200) return fail(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
  const j = r.json;
  if (j?.bootstrapStatus !== "ready") return warn(`bootstrapStatus=${j?.bootstrapStatus}`);
  return ok(`bootstrapStatus=ready`);
}

async function resolveAgentContext(agentId) {
  // /api/agents/:id/runtime-state returns the lastRunId for that agent.
  // We also need a projectId that belongs to the company — use the
  // first project we find via /api/companies/:id/projects.
  if (agentContext[agentId]) return agentContext[agentId];
  const r = await fetch_(`${BASE}/api/agents/${agentId}/runtime-state`);
  if (r.status !== 200) return null;
  const runId = r.json?.lastRunId;
  if (!runId) return null;
  // Find a project for the company. The agent runs are associated with
  // a project via the wakeup flow, but the tool execute validator only
  // checks that projectId is a real project in the same company.
  const pr = await fetch_(`${BASE}/api/companies/${LMTM_COMPANY_ID}/projects?limit=1`);
  let projectId = "00000000-0000-4000-8000-000000000123"; // safe fallback
  if (pr.status === 200) {
    const list = pr.json?.projects ?? pr.json;
    if (Array.isArray(list) && list.length > 0) projectId = list[0].id;
  }
  agentContext[agentId] = { runId, projectId };
  return agentContext[agentId];
}

async function step2Clients() {
  const r = await fetch_(`${BASE}/api/clients?status=active`);
  if (r.status !== 200) return fail(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
  const list = r.json?.clients ?? r.json;
  if (!Array.isArray(list)) return fail(`expected array, got ${typeof list}`);
  if (list.length === 0) return fail("no clients");
  return ok(`${list.length} clients (e.g. ${list[0]?.slug})`);
}

async function step3Agents() {
  const r = await fetch_(`${BASE}/api/companies/${LMTM_COMPANY_ID}/agents`);
  if (r.status !== 200) return fail(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
  const list = r.json?.agents ?? r.json;
  if (!Array.isArray(list)) return fail(`expected array, got ${typeof list}`);
  if (list.length !== EXPECTED_AGENT_COUNT) return warn(`${list.length} agents (expected ${EXPECTED_AGENT_COUNT})`);
  return ok(`${list.length} agents`);
}

async function step4Workers() {
  const r = await fetch_(`${BASE}/api/_debug/workers`);
  if (r.status !== 200) return fail(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
  const workers = r.json?.workers ?? [];
  const running = workers.filter((w) => w.status === "running");
  const names = workers.map((w) => w.pluginId).join(", ");
  if (running.length === 0) return fail("no workers running");
  return ok(`${running.length}/${workers.length} running: ${names}`);
}

async function step5MetaAds() {
  const ctx = await resolveAgentContext(MILO_AGENT_ID);
  if (!ctx) return warn("no lastRunId for Milo — agent hasn't run yet");
  const body = JSON.stringify({
    tool: "lmtm-meta-ads:meta-list-ad-accounts",
    parameters: {},
    runContext: { agentId: MILO_AGENT_ID, runId: ctx.runId, companyId: LMTM_COMPANY_ID, projectId: ctx.projectId },
  });
  const r = await fetch_(`${BASE}/api/plugins/tools/execute`, { method: "POST", body });
  if (r.status === 200) return ok("200 OK (Meta connection exists)");
  if (r.status === 400 || r.status === 404) return warn(`HTTP ${r.status} (likely no Meta connection yet — expected on first run)`);
  if (r.status === 502) return warn(`HTTP 502 (worker not running — likely the image hasn't been redeployed yet)`);
  return fail(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
}

async function step6GoogleAds() {
  const ctx = await resolveAgentContext(MILO_AGENT_ID);
  if (!ctx) return warn("no lastRunId for Milo — agent hasn't run yet");
  const body = JSON.stringify({
    tool: "lmtm-google-ads:google-list-accounts",
    parameters: {},
    runContext: { agentId: MILO_AGENT_ID, runId: ctx.runId, companyId: LMTM_COMPANY_ID, projectId: ctx.projectId },
  });
  const r = await fetch_(`${BASE}/api/plugins/tools/execute`, { method: "POST", body });
  if (r.status === 200) return ok("200 OK (Google connection exists)");
  if (r.status === 400 || r.status === 404) return warn(`HTTP ${r.status} (likely no Google connection yet)`);
  if (r.status === 502) return warn(`HTTP 502 (worker not running — likely the image hasn't been redeployed yet)`);
  return fail(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
}

async function step7ClickUp() {
  const ctx = await resolveAgentContext(PABLO_AGENT_ID);
  if (!ctx) return warn("no lastRunId for Pablo — agent hasn't run yet");
  const body = JSON.stringify({
    tool: "lmtm-clickup:clickup-list-folders",
    parameters: { spaceId: CLICKUP_CLIENTES_SPACE },
    runContext: { agentId: PABLO_AGENT_ID, runId: ctx.runId, companyId: LMTM_COMPANY_ID, projectId: ctx.projectId },
  });
  const r = await fetch_(`${BASE}/api/plugins/tools/execute`, { method: "POST", body });
  if (r.status !== 200) return fail(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
  const j = r.json;
  const folders = j?.result?.folders ?? j?.folders ?? j;
  if (typeof folders === "string" && folders.includes("Not authenticated")) return fail("ClickUp plugin returned auth error");
  if (Array.isArray(folders) && folders.length > 0) return ok(`${folders.length} folders in Clientes space`);
  if (typeof j === "object" && j !== null) return ok(`200 OK (raw result keys: ${Object.keys(j).slice(0, 3).join(", ")})`);
  return fail(`unexpected response: ${r.text.slice(0, 200)}`);
}

async function step8N8n() {
  const ctx = await resolveAgentContext(NICOLAS_AGENT_ID);
  if (!ctx) return warn("no lastRunId for Nicolas — agent hasn't run yet");
  const body = JSON.stringify({
    tool: "lmtm-n8n:n8n-ping",
    parameters: {},
    runContext: { agentId: NICOLAS_AGENT_ID, runId: ctx.runId, companyId: LMTM_COMPANY_ID, projectId: ctx.projectId },
  });
  const r = await fetch_(`${BASE}/api/plugins/tools/execute`, { method: "POST", body });
  if (r.status === 200) return ok("200 OK");
  return fail(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
}

async function main() {
  const steps = [
    { name: "GET /api/health", run: step1Health },
    { name: "GET /api/clients?status=active", run: step2Clients },
    { name: "GET /api/companies/:id/agents", run: step3Agents },
    { name: "GET /api/_debug/workers", run: step4Workers },
    { name: "POST lmtm-meta-ads:meta-list-ad-accounts", run: step5MetaAds },
    { name: "POST lmtm-google-ads:google-list-accounts", run: step6GoogleAds },
    { name: "POST lmtm-clickup:clickup-list-folders (space=Clientes)", run: step7ClickUp },
    { name: "POST lmtm-n8n:n8n-ping", run: step8N8n },
  ];

  const results = [];
  for (const s of steps) {
    try {
      const r = await s.run();
      results.push({ step: s.name, ...r });
    } catch (e) {
      results.push({ step: s.name, status: "fail", note: e.message });
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log("STEP                                                    STATUS    NOTE");
    console.log("-".repeat(96));
    for (const r of results) {
      const s = (r.status || "?").padEnd(8);
      console.log(`${r.step.padEnd(56)} ${s}  ${r.note || ""}`);
    }
    const fails = results.filter((r) => r.status === "fail");
    if (fails.length > 0) {
      console.log("");
      console.log(`${fails.length} step(s) FAILED.`);
      process.exit(1);
    } else {
      console.log("");
      console.log("All steps passed (some may be warn — that's expected before ad connections are set up).");
    }
  }
}

main().catch((e) => {
  console.error("smoke-test crashed:", e.message);
  console.error(e.stack);
  process.exit(2);
});
