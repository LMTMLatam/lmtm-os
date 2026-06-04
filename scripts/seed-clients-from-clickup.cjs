// ClickUp → Paperclip clients seed.
//
// Reads every Folder in the "Clientes" ClickUp space (each Folder is
// 1 client) and upserts a corresponding row in Paperclip's `clients`
// table. The script is idempotent: a client with the same `slug`
// (derived from the folder name) is skipped on the second run, so it's
// safe to schedule via n8n / cron.
//
// Run from a developer machine or from inside the LMTM-OS container
// (where DATABASE_URL is wired and the API is reachable):
//   node seed-clients-from-clickup.cjs [--dry-run]
//
// Mapping:
//   ClickUp Folder name      -> clients.name
//   ClickUp Folder id        -> clients.planillaExternalId
//   "clickup"                -> clients.planillaSource
//   derived from folder name -> clients.slug
//   # of lists in folder     -> clients.tier (heuristic: 1-5 standard, 6-8 premium, 9+ enterprise)

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const CLICKUP_TOKEN = "pk_96835660_GQF427XRXP8ESXYKFGVUIUM317RO6IDU";
const CLICKUP_TEAM = "9013352440"; // LMTM workspace
const CLICKUP_CLIENTES_SPACE = "90131985551";

const LMTM_API = "https://lmtm.onrender.com";
const COOKIE_FILE = path.join(__dirname, "lmtm-cookie.txt");
const DRY_RUN = process.argv.includes("--dry-run");

function readCookie() {
  if (!fs.existsSync(COOKIE_FILE)) {
    throw new Error(`Cookie file not found at ${COOKIE_FILE}. Login first and save the cookie.`);
  }
  return fs.readFileSync(COOKIE_FILE, "utf-8").trim();
}

function clickupFetch(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath);
    const req = https.request(
      {
        method: "GET",
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: { Authorization: CLICKUP_TOKEN },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(text));
            } catch {
              resolve(text);
            }
          } else {
            reject(new Error(`ClickUp ${res.statusCode} ${urlPath}\n${text.slice(0, 300)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function lmtmFetch(cookie, urlPath, init) {
  return new Promise((resolve, reject) => {
    const url = new URL(LMTM_API + urlPath);
    const body = init && init.body !== undefined ? JSON.stringify(init.body) : undefined;
    const headers = {
      Cookie: cookie,
      Origin: LMTM_API,
      Referer: LMTM_API + "/",
      Accept: "application/json",
    };
    if (body) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const req = https.request(
      {
        method: (init && init.method) || "GET",
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(text));
            } catch {
              resolve(text);
            }
          } else {
            reject(new Error(`LMTM ${res.statusCode} ${urlPath}\n${text.slice(0, 300)}`));
          }
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function tierFromListCount(n) {
  if (n >= 9) return "enterprise";
  if (n >= 6) return "premium";
  return "standard";
}

async function main() {
  console.log(`fetching ClickUp folders in space ${CLICKUP_CLIENTES_SPACE}...`);
  const foldersData = await clickupFetch(
    `https://api.clickup.com/api/v2/space/${CLICKUP_CLIENTES_SPACE}/folder`,
  );
  const folders = foldersData.folders || [];
  console.log(`  found ${folders.length} folders`);

  console.log("fetching existing Paperclip clients...");
  const cookie = readCookie();
  const existing = await lmtmFetch(cookie, "/api/clients?status=active");
  const existingBySlug = new Map();
  const existingByExternalId = new Map();
  for (const c of existing.clients || []) {
    existingBySlug.set(c.slug, c);
    if (c.planillaExternalId) existingByExternalId.set(c.planillaExternalId, c);
  }
  console.log(`  found ${existingBySlug.size} existing clients`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const changes = [];
  const errors = [];

  for (const folder of folders) {
    const slug = slugify(folder.name);
    const tier = tierFromListCount(folder.lists ? folder.lists.length : 0);
    const listCount = folder.lists ? folder.lists.length : 0;
    const listNames = (folder.lists || []).map((l) => l.name).join(", ");
    const existing =
      existingBySlug.get(slug) || existingByExternalId.get(folder.id);

    if (existing) {
      skipped++;
      changes.push({ folder: folder.name, action: "skip", slug, id: existing.id, tier, listCount });
      continue;
    }

    const body = {
      slug,
      name: folder.name,
      status: "active",
      tier,
      planillaSource: "clickup",
      planillaExternalId: folder.id,
      primaryContactName: null,
      primaryContactEmail: null,
      metadata: {
        clickup_space_id: CLICKUP_CLIENTES_SPACE,
        clickup_folder_id: folder.id,
        clickup_list_count: listCount,
        clickup_lists: listNames,
        synced_at: new Date().toISOString(),
      },
    };

    if (DRY_RUN) {
      changes.push({ folder: folder.name, action: "dry-run-create", slug, tier, listCount });
      created++;
      continue;
    }

    try {
      const row = await lmtmFetch(cookie, "/api/clients", { method: "POST", body });
      created++;
      changes.push({ folder: folder.name, action: "create", slug, id: row.id, tier, listCount });
    } catch (e) {
      errors.push({ folder: folder.name, slug, error: e.message });
    }
  }

  console.log("");
  console.log(`=== sync summary ===`);
  console.log(`  folders seen:  ${folders.length}`);
  console.log(`  created:       ${created}`);
  console.log(`  skipped:       ${skipped}`);
  console.log(`  errors:        ${errors.length}`);
  if (errors.length > 0) {
    console.log("");
    console.log("errors:");
    for (const e of errors) console.log(`  - ${e.folder} (${e.slug}): ${e.error}`);
  }
  console.log("");
  console.log("per-folder outcome:");
  for (const c of changes) {
    console.log(`  [${c.action.padEnd(15)}] ${c.folder.padEnd(35)} slug=${c.slug.padEnd(30)} tier=${c.tier} lists=${c.listCount}`);
  }

  fs.writeFileSync(
    path.join(__dirname, `seed-clients-${Date.now()}.json`),
    JSON.stringify({ summary: { created, updated, skipped, errors: errors.length, total: folders.length }, changes, errors }, null, 2),
  );
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
