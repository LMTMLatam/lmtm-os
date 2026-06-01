// LMTM-OS: minimax_local skill materialization.
// MiniMax M3 doesn't have a native skills concept (no `~/.claude/skills`).
// Instead, we materialize skills into a directory the agent can read by
// adding their content to the system prompt at run time. The directory
// exists so external tools (file watchers, prompt templating, etc.) can
// also discover the skills.

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type {
  AdapterSkillContext,
  AdapterSkillEntry,
  AdapterSkillSnapshot,
} from "@paperclipai/adapter-utils";
import {
  readPaperclipRuntimeSkillEntries,
  readInstalledSkillTargets,
  resolvePaperclipDesiredSkillNames,
} from "@paperclipai/adapter-utils/server-utils";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolveSkillHome(config: Record<string, unknown>): string {
  const configured = asString(config.skillDirectory);
  if (configured) return path.resolve(configured);
  const env =
    typeof config.env === "object" && config.env !== null && !Array.isArray(config.env)
      ? (config.env as Record<string, unknown>)
      : {};
  const envHome = asString(env.HOME);
  const home = envHome ? path.resolve(envHome) : os.homedir();
  return path.join(home, ".minimax", "skills");
}

async function buildSkillSnapshot(config: Record<string, unknown>): Promise<AdapterSkillSnapshot> {
  const availableEntries = await readPaperclipRuntimeSkillEntries(config, __moduleDir);
  const availableByKey = new Map(availableEntries.map((entry) => [entry.key, entry]));
  const desiredSkills = resolvePaperclipDesiredSkillNames(config, availableEntries);
  const desiredSet = new Set(desiredSkills);
  const skillsHome = resolveSkillHome(config);
  const installed = await readInstalledSkillTargets(skillsHome);
  const entries: AdapterSkillEntry[] = availableEntries.map((entry) => ({
    key: entry.key,
    runtimeName: entry.runtimeName,
    desired: desiredSet.has(entry.key),
    managed: true,
    state: desiredSet.has(entry.key) ? "configured" : "available",
    origin: entry.required ? "paperclip_required" : "company_managed",
    originLabel: entry.required ? "Required by Paperclip" : "Managed by Paperclip",
    readOnly: false,
    sourcePath: entry.source,
    targetPath: null,
    detail: desiredSet.has(entry.key)
      ? `Will be injected into the MiniMax system prompt on the next run (materialized at ${skillsHome}).`
      : null,
    required: Boolean(entry.required),
    requiredReason: entry.requiredReason ?? null,
  }));
  const warnings: string[] = [];

  for (const desiredSkill of desiredSkills) {
    if (availableByKey.has(desiredSkill)) continue;
    warnings.push(`Desired skill "${desiredSkill}" is not available from the Paperclip skills directory.`);
    entries.push({
      key: desiredSkill,
      runtimeName: null,
      desired: true,
      managed: true,
      state: "missing",
      origin: "external_unknown",
      originLabel: "External or unavailable",
      readOnly: false,
      sourcePath: undefined,
      targetPath: undefined,
      detail: "Paperclip cannot find this skill in the local runtime skills directory.",
    });
  }

  for (const [name, installedEntry] of installed.entries()) {
    if (availableEntries.some((entry) => entry.runtimeName === name)) continue;
    entries.push({
      key: name,
      runtimeName: name,
      desired: false,
      managed: false,
      state: "external",
      origin: "user_installed",
      originLabel: "User-installed",
      locationLabel: skillsHome,
      readOnly: true,
      sourcePath: null,
      targetPath: installedEntry.targetPath ?? path.join(skillsHome, name),
      detail: "Installed outside Paperclip management in the MiniMax skills home.",
    });
  }

  entries.sort((left, right) => left.key.localeCompare(right.key));

  return {
    adapterType: "minimax_local",
    supported: true,
    mode: "ephemeral",
    desiredSkills,
    entries,
    warnings,
  };
}

export async function listMinimaxSkills(ctx: AdapterSkillContext): Promise<AdapterSkillSnapshot> {
  return buildSkillSnapshot(ctx.config);
}

export async function syncMinimaxSkills(
  ctx: AdapterSkillContext,
  _desiredSkills: string[],
): Promise<AdapterSkillSnapshot> {
  const snapshot = await buildSkillSnapshot(ctx.config);
  // Eagerly materialize the configured skills into the skills home so
  // external tools (file watchers, the `minimax` CLI if the team uses
  // one, etc.) can discover them. M3 itself reads the skills from the
  // system prompt at execute() time, but having them on disk keeps the
  // "skills home" convention consistent with claude_local / opencode_local.
  if (snapshot.supported) {
    const skillsHome = resolveSkillHome(ctx.config);
    await fs.mkdir(skillsHome, { recursive: true });
    for (const entry of snapshot.entries) {
      if (entry.state !== "configured" || !entry.sourcePath) continue;
      const target = path.join(skillsHome, entry.runtimeName ?? entry.key);
      try {
        await fs.mkdir(target, { recursive: true });
        await fs.writeFile(
          path.join(target, "SKILL.md"),
          `# ${entry.key}\n\nMaterialized by Paperclip from ${entry.sourcePath}\n`,
          "utf8",
        );
      } catch {
        // Best-effort; the run can still proceed without disk materialization.
      }
    }
  }
  return snapshot;
}
