// scripts/register-lmtm-skills.mjs
// Registers all bundled minimax-local skills into the LMTM company's
// `company_skills` library so the UI's "missing from the company
// library" warning goes away. Idempotent: re-runs are safe (ON CONFLICT
// updates markdown in place so edits from CI/CD land).
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/register-lmtm-skills.mjs
//
// Or with the Supabase pooler URL in env.

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import postgres from "../packages/db/node_modules/postgres/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = resolve(__dirname, "../packages/adapters/minimax-local/skills");
const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const ORG_NAMESPACE = "paperclipai/paperclip";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL env var is required");
  process.exit(1);
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return { name: null, description: null };
  const block = match[1];
  const fields = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (m) fields[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { name: fields.name ?? null, description: fields.description ?? null };
}

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });

  const dirs = (await readdir(SKILLS_ROOT, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  console.log(`Found ${dirs.length} skill directories`);

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const slug of dirs) {
    const skillFile = resolve(SKILLS_ROOT, slug, "SKILL.md");
    let markdown;
    try {
      markdown = await readFile(skillFile, "utf8");
    } catch (e) {
      console.error(`  [skip] ${slug}: cannot read SKILL.md (${e.message})`);
      failed++;
      continue;
    }
    const { name, description } = parseFrontmatter(markdown);
    if (!name) {
      console.error(`  [skip] ${slug}: frontmatter missing "name"`);
      failed++;
      continue;
    }

    const key = `${ORG_NAMESPACE}/${slug}`;
    const sourceLocator = `bundled://adapters/minimax-local/skills/${slug}`;

    try {
      const result = await sql`
        INSERT INTO company_skills (
          company_id, key, slug, name, description, markdown,
          source_type, source_locator, source_ref,
          trust_level, compatibility, file_inventory, metadata
        ) VALUES (
          ${COMPANY_ID}, ${key}, ${slug}, ${name}, ${description ?? null},
          ${markdown}, 'local_path', ${sourceLocator}, NULL,
          'markdown_only', 'compatible',
          ${sql.json([{ path: "SKILL.md", kind: "skill" }])},
          ${sql.json({ sourceKind: "bundled_adapter", adapter: "minimax_local" })}
        )
        ON CONFLICT (company_id, key) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          markdown = EXCLUDED.markdown,
          source_locator = EXCLUDED.source_locator,
          file_inventory = EXCLUDED.file_inventory,
          metadata = EXCLUDED.metadata,
          updated_at = now()
        RETURNING (xmax = 0) AS was_inserted
      `;
      const wasInserted = result[0]?.was_inserted === true;
      if (wasInserted) inserted++;
      else updated++;
      console.log(`  [${wasInserted ? "insert" : "update"}] ${slug}`);
    } catch (e) {
      console.error(`  [fail] ${slug}: ${e.message}`);
      failed++;
    }
  }

  console.log("");
  console.log(`Done. inserted=${inserted} updated=${updated} failed=${failed} (total=${dirs.length})`);

  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM company_skills WHERE company_id = ${COMPANY_ID}
  `;
  console.log(`company_skills rows for LMTM company: ${count}`);

  await sql.end();
  if (failed > 0) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
