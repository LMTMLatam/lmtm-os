import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { notFound } from "../errors.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

export type RunLogStoreType = "local_file";

export interface RunLogHandle {
  store: RunLogStoreType;
  logRef: string;
}

export interface RunLogReadOptions {
  offset?: number;
  limitBytes?: number;
}

export interface RunLogReadResult {
  content: string;
  nextOffset?: number;
}

export interface RunLogFinalizeSummary {
  bytes: number;
  sha256?: string;
  compressed: boolean;
}

export interface RunLogStore {
  begin(input: { companyId: string; agentId: string; runId: string }): Promise<RunLogHandle>;
  append(
    handle: RunLogHandle,
    event: { stream: "stdout" | "stderr" | "system"; chunk: string; ts: string },
  ): Promise<number>;
  finalize(handle: RunLogHandle): Promise<RunLogFinalizeSummary>;
  read(handle: RunLogHandle, opts?: RunLogReadOptions): Promise<RunLogReadResult>;
}

function safeSegments(...segments: string[]) {
  return segments.map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, "_"));
}

function resolveWithin(basePath: string, relativePath: string) {
  const resolved = path.resolve(basePath, relativePath);
  const base = path.resolve(basePath) + path.sep;
  if (!resolved.startsWith(base) && resolved !== path.resolve(basePath)) {
    throw new Error("Invalid log path");
  }
  return resolved;
}

// LMTM 08/11: el log de una corrida se escribe en el disco del contenedor (rápido,
// pero se borra en cada deploy: se perdían 133 de 152). Al terminar la corrida se
// comprime (~7x) y se archiva en el volumen persistente, con 14 días de retención y
// sin archivar si el volumen queda con menos de 300 MB libres (estaba al 87%).
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
export const RETENCION_LOGS_MS = 14 * 86_400_000;
export const LIBRE_MINIMO_BYTES = 300 * 1024 * 1024;

export interface ArchivoLogs {
  dir: string;
  ahora?: () => number;
  libreBytes?: (dir: string) => Promise<number>;
}

async function libreEnDisco(dir: string) {
  const s = await fs.statfs(dir);
  return Number(s.bavail) * Number(s.bsize);
}

/** Borra los .gz archivados más viejos que la retención. Devuelve cuántos borró. */
export async function limpiarArchivo(dir: string, ahora = Date.now()) {
  let borrados = 0;
  async function recorrer(d: string) {
    const entradas = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of entradas) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await recorrer(p);
      else if (e.name.endsWith(".gz")) {
        const st = await fs.stat(p).catch(() => null);
        if (st && ahora - st.mtimeMs > RETENCION_LOGS_MS) {
          await fs.rm(p, { force: true });
          borrados++;
        }
      }
    }
  }
  await recorrer(dir);
  return borrados;
}

export function createLocalFileRunLogStore(basePath: string, archivo?: ArchivoLogs): RunLogStore {
  const ahora = archivo?.ahora ?? Date.now;
  let ultimaLimpieza = 0;
  async function ensureDir(relativeDir: string) {
    const dir = resolveWithin(basePath, relativeDir);
    await fs.mkdir(dir, { recursive: true });
  }

  async function readFileRange(filePath: string, offset: number, limitBytes: number): Promise<RunLogReadResult> {
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) throw notFound("Run log not found");

    const start = Math.max(0, Math.min(offset, stat.size));
    const end = Math.max(start, Math.min(start + limitBytes - 1, stat.size - 1));

    if (start > end) {
      return { content: "", nextOffset: start };
    }

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath, { start, end });
      stream.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on("error", reject);
      stream.on("end", () => resolve());
    });

    const content = Buffer.concat(chunks).toString("utf8");
    const nextOffset = end + 1 < stat.size ? end + 1 : undefined;
    return { content, nextOffset };
  }

  async function sha256File(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(hash.digest("hex")));
    });
  }

  return {
    async begin(input) {
      const [companyId, agentId] = safeSegments(input.companyId, input.agentId);
      const runId = safeSegments(input.runId)[0]!;
      const relDir = path.join(companyId, agentId);
      const relPath = path.join(relDir, `${runId}.ndjson`);
      await ensureDir(relDir);

      const absPath = resolveWithin(basePath, relPath);
      await fs.writeFile(absPath, "", "utf8");

      return { store: "local_file", logRef: relPath };
    },

    async append(handle, event) {
      if (handle.store !== "local_file") return 0;
      const absPath = resolveWithin(basePath, handle.logRef);
      const line = JSON.stringify({
        ts: event.ts,
        stream: event.stream,
        chunk: event.chunk,
      });
      const persisted = `${line}\n`;
      await fs.appendFile(absPath, persisted, "utf8");
      return Buffer.byteLength(persisted, "utf8");
    },

    async finalize(handle) {
      if (handle.store !== "local_file") {
        return { bytes: 0, compressed: false };
      }
      const absPath = resolveWithin(basePath, handle.logRef);
      const stat = await fs.stat(absPath).catch(() => null);
      if (!stat) throw notFound("Run log not found");

      const hash = await sha256File(absPath);
      if (archivo) {
        try {
          if (ahora() - ultimaLimpieza > 86_400_000) {
            ultimaLimpieza = ahora();
            await fs.mkdir(archivo.dir, { recursive: true });
            await limpiarArchivo(archivo.dir, ahora());
          }
          await fs.mkdir(archivo.dir, { recursive: true });
          const libre = await (archivo.libreBytes ?? libreEnDisco)(archivo.dir);
          if (libre > LIBRE_MINIMO_BYTES + stat.size) {
            const destino = resolveWithin(archivo.dir, handle.logRef + ".gz");
            await fs.mkdir(path.dirname(destino), { recursive: true });
            await fs.writeFile(destino, await gzipAsync(await fs.readFile(absPath)));
            await fs.rm(absPath, { force: true });
            return { bytes: stat.size, sha256: hash, compressed: true };
          }
        } catch (err) {
          // Archivar es un extra: si falla, el log queda donde estaba.
          console.warn("[run-log] no se pudo archivar", handle.logRef, err instanceof Error ? err.message : err);
        }
      }
      return {
        bytes: stat.size,
        sha256: hash,
        compressed: false,
      };
    },

    async read(handle, opts) {
      if (handle.store !== "local_file") {
        throw notFound("Run log not found");
      }
      const absPath = resolveWithin(basePath, handle.logRef);
      const offset = opts?.offset ?? 0;
      const limitBytes = opts?.limitBytes ?? 256_000;
      if (archivo) {
        const gz = await fs.readFile(resolveWithin(archivo.dir, handle.logRef + ".gz")).catch(() => null);
        if (gz) {
          const todo = await gunzipAsync(gz);
          const start = Math.max(0, Math.min(offset, todo.length));
          const end = Math.min(start + limitBytes, todo.length);
          return { content: todo.subarray(start, end).toString("utf8"), nextOffset: end < todo.length ? end : undefined };
        }
      }
      return readFileRange(absPath, offset, limitBytes);
    },
  };
}

let cachedStore: RunLogStore | null = null;

export function getRunLogStore() {
  if (cachedStore) return cachedStore;
  const basePath = process.env.RUN_LOG_BASE_PATH ?? path.resolve(resolvePaperclipInstanceRoot(), "data", "run-logs");
  // RUN_LOG_ARCHIVE_PATH lo pone start.sh cuando hay volumen (/data/run-logs).
  const dirArchivo = process.env.RUN_LOG_ARCHIVE_PATH?.trim();
  cachedStore = createLocalFileRunLogStore(basePath, dirArchivo ? { dir: dirArchivo } : undefined);
  return cachedStore;
}
