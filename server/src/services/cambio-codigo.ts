// LMTM-OS: cambios de código propuestos por un agente (revisión 12/11, C1).
//
// Esteban (CRM Engineer) recibía arreglos del CRM y del servidor que no podía
// terminar: el CRM vive en un VPS al que no entra y /app/server no es escribible.
// Se pasaba las corridas buscando una llave (169 M de tokens en una semana).
// Naza: «tiene que resolverlas él». Mismo patrón que proponer_cambio_web:
//   leer      → el servidor le muestra el código (lista negra de rutas con claves);
//   proponer  → deja una aprobación `accion_codigo` con el diff completo;
//   aprobar   → SOLO una persona; recién ahí el servidor aplica el diff en el CRM
//               por SSH. La llave vive en CRM_SSH_KEY (la carga Naza) y no está
//               en el entorno de los agentes (entornoHeredable).
// lmtm-os no se modifica a sí mismo en caliente: el diff aprobado lo aplica y
// despliega una persona desde el repo.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { approvals } from "@paperclipai/db";

export const TIPO_ACCION_CODIGO = "accion_codigo";
export type RepoCodigo = "crm" | "lmtm-os";

/** Rutas que nunca se leen ni se tocan: claves, entornos y llaves. */
const RUTA_PROHIBIDA = /(^|\/)(\.env(\.[\w-]+)?|\.ssh|secrets?|id_[a-z0-9]+|[^/]*\.(pem|key|p12|pfx))(\/|$)|(^|\/)\.git\//i;

export function rutaPermitida(ruta: string): boolean {
  const r = ruta.replace(/\\/g, "/").replace(/^\/+/, "");
  return !!r && !r.split("/").includes("..") && !RUTA_PROHIBIDA.test(r);
}

/** Archivos que toca un diff unificado (a/… y b/…, sin /dev/null). Pura. */
export function archivosDelDiff(diff: string): string[] {
  const out = new Set<string>();
  for (const m of diff.matchAll(/^(?:---|\+\+\+) (?:[ab]\/)?(\S+)/gm)) {
    if (m[1] !== "/dev/null") out.add(m[1]);
  }
  return [...out];
}

/** Revisa el diff antes de proponerlo. Devuelve el error o null. Pura. */
export function validarDiff(diff: string): string | null {
  if (!diff.trim()) return "El diff está vacío.";
  if (diff.length > 200_000) return "El diff pesa más de 200 KB: partilo en cambios más chicos.";
  const archivos = archivosDelDiff(diff);
  if (archivos.length === 0) return "No es un diff unificado (faltan las líneas --- a/… y +++ b/…).";
  const malos = archivos.filter((a) => !rutaPermitida(a));
  if (malos.length) return `El diff toca rutas que no se pueden cambiar desde un agente: ${malos.join(", ")}.`;
  return null;
}

// ── dónde vive cada repo ─────────────────────────────────────────────────────

const RAIZ_LMTM_OS = () => process.env.LMTM_OS_SRC?.trim() || "/app";

interface DestinoCrm { host: string; puerto: string; usuario: string; repo: string; reiniciar: string | null }

function destinoCrm(): DestinoCrm | string {
  if (!process.env.CRM_SSH_KEY?.trim()) {
    return "Todavía no hay acceso del servidor al CRM (falta CRM_SSH_KEY en Railway, la carga una persona). Podés proponer el diff igual: queda esperando aprobación y se aplica cuando esté el acceso.";
  }
  return {
    host: process.env.CRM_SSH_HOST?.trim() || "82.29.56.162",
    puerto: process.env.CRM_SSH_PORT?.trim() || "2222",
    usuario: process.env.CRM_SSH_USER?.trim() || "deploy",
    repo: process.env.CRM_REPO_PATH?.trim() || "/home/deploy/atendechat",
    reiniciar: process.env.CRM_RESTART_CMD?.trim() || null,
  };
}

function correr(cmd: string, args: string[], opts: { cwd?: string; entrada?: string; segundos?: number } = {}): Promise<{ codigo: number; salida: string }> {
  return new Promise((resolve) => {
    const hijo = spawn(cmd, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
    let salida = "";
    const t = setTimeout(() => hijo.kill("SIGKILL"), (opts.segundos ?? 60) * 1000);
    hijo.stdout.on("data", (d) => { salida += d; });
    hijo.stderr.on("data", (d) => { salida += d; });
    hijo.on("error", (e) => { clearTimeout(t); resolve({ codigo: 127, salida: e.message }); });
    hijo.on("close", (c) => { clearTimeout(t); resolve({ codigo: c ?? 1, salida: salida.slice(-8000) }); });
    hijo.stdin.end(opts.entrada ?? "");
  });
}

/** Corre un comando en el VPS del CRM con la llave del servidor (archivo temporal 600). */
async function enCrm(d: DestinoCrm, comando: string, entrada?: string, segundos = 90) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-"));
  const llave = path.join(dir, "k");
  try {
    fs.writeFileSync(llave, `${process.env.CRM_SSH_KEY!.trim()}\n`, { mode: 0o600 });
    return await correr("ssh", [
      "-i", llave, "-p", d.puerto, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
      "-o", `UserKnownHostsFile=${path.join(dir, "kh")}`, "-o", "ConnectTimeout=15",
      `${d.usuario}@${d.host}`, comando,
    ], { entrada, segundos });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const comillas = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

// ── leer ─────────────────────────────────────────────────────────────────────

/** Lee un archivo (con `desde`/`lineas`) o busca un texto en el repo. Solo lectura. */
export async function leerCodigo(repo: RepoCodigo, p: { ruta?: string; buscar?: string; desde?: number; lineas?: number }): Promise<{ ok: boolean; texto: string }> {
  const ruta = (p.ruta ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (ruta && !rutaPermitida(ruta)) return { ok: false, texto: "Esa ruta no se puede leer desde un agente (claves, entornos o llaves)." };
  const desde = Math.max(1, Math.floor(p.desde ?? 1));
  const lineas = Math.min(400, Math.max(1, Math.floor(p.lineas ?? 200)));
  const buscar = (p.buscar ?? "").slice(0, 200);
  const excluir = ["--exclude-dir=.git", "--exclude-dir=node_modules", "--exclude-dir=.ssh", "--exclude=.env*", "--exclude=*.pem", "--exclude=*.key"];

  if (repo === "lmtm-os") {
    const raiz = RAIZ_LMTM_OS();
    if (buscar) {
      const r = await correr("grep", ["-rnI", "-m", "5", ...excluir, "--", buscar, ruta || "."], { cwd: raiz, segundos: 30 });
      return { ok: r.codigo <= 1, texto: (r.salida || "Sin resultados.").split("\n").slice(0, 120).join("\n") };
    }
    if (!ruta) return { ok: false, texto: "Pasá `ruta` (archivo o carpeta) o `buscar`." };
    const abs = path.join(raiz, ruta);
    if (!abs.startsWith(raiz)) return { ok: false, texto: "Ruta inválida." };
    if (!fs.existsSync(abs)) return { ok: false, texto: `No existe ${ruta}.` };
    if (fs.statSync(abs).isDirectory()) {
      return { ok: true, texto: fs.readdirSync(abs).filter((n) => rutaPermitida(path.posix.join(ruta, n))).sort().join("\n") };
    }
    const todo = fs.readFileSync(abs, "utf8").split("\n");
    const tramo = todo.slice(desde - 1, desde - 1 + lineas).map((l, i) => `${desde + i}\t${l}`).join("\n");
    return { ok: true, texto: `${ruta} (${todo.length} líneas)\n${tramo}` };
  }

  const d = destinoCrm();
  if (typeof d === "string") return { ok: false, texto: d };
  const cmd = buscar
    ? `cd ${comillas(d.repo)} && grep -rnI -m 5 ${excluir.map(comillas).join(" ")} -- ${comillas(buscar)} ${comillas(ruta || ".")} | head -120`
    : ruta
      ? `cd ${comillas(d.repo)} && if [ -d ${comillas(ruta)} ]; then ls -1 ${comillas(ruta)}; else wc -l < ${comillas(ruta)} && sed -n '${desde},${desde + lineas - 1}p' ${comillas(ruta)} | nl -ba -v ${desde}; fi`
      : "";
  if (!cmd) return { ok: false, texto: "Pasá `ruta` (archivo o carpeta) o `buscar`." };
  const r = await enCrm(d, cmd);
  return { ok: r.codigo <= 1, texto: r.salida || "Sin resultados." };
}

// ── proponer ─────────────────────────────────────────────────────────────────

export interface PayloadAccionCodigo {
  repo: RepoCodigo;
  diff: string;
  archivos: string[];
  justificacion: string;
  prueba: string | null;
  revertir: string;
  issueId: string | null;
  resumen: string;
  chequeo: string;
  resultado?: { ok: boolean; detalle: string; ejecutadoAt: string };
}

export function esAccionCodigo(payload: unknown): payload is PayloadAccionCodigo {
  const p = payload as Partial<PayloadAccionCodigo> | null;
  return !!p && (p.repo === "crm" || p.repo === "lmtm-os") && typeof p.diff === "string" && typeof p.justificacion === "string";
}

async function chequearDiff(repo: RepoCodigo, diff: string): Promise<{ ok: boolean | null; detalle: string }> {
  if (repo === "lmtm-os") {
    const r = await correr("git", ["apply", "--check", "-"], { cwd: RAIZ_LMTM_OS(), entrada: diff, segundos: 30 });
    if (r.codigo === 127) return { ok: null, detalle: "no se pudo probar (falta git en el servidor)" };
    return r.codigo === 0 ? { ok: true, detalle: "aplica en limpio" } : { ok: false, detalle: r.salida.slice(0, 1500) };
  }
  const d = destinoCrm();
  if (typeof d === "string") return { ok: null, detalle: "sin acceso al CRM todavía: se prueba al aprobar" };
  const r = await enCrm(d, `cd ${comillas(d.repo)} && git apply --check -`, diff);
  return r.codigo === 0 ? { ok: true, detalle: "aplica en limpio" } : { ok: false, detalle: r.salida.slice(0, 1500) };
}

export async function proponerCambioCodigo(
  db: Db,
  input: { companyId: string; agentId: string | null; issueId: string | null; repo: RepoCodigo; diff: string; justificacion: string; prueba?: string; revertir?: string },
): Promise<{ ok: boolean; mensaje: string }> {
  const error = validarDiff(input.diff);
  if (error) return { ok: false, mensaje: error };
  if (input.justificacion.trim().length < 20) return { ok: false, mensaje: "Falta `justificacion`: qué arregla, por qué y qué riesgo tiene. Es lo que lee quien aprueba." };
  const chequeo = await chequearDiff(input.repo, input.diff);
  if (chequeo.ok === false) return { ok: false, mensaje: `El diff no aplica sobre el código actual de ${input.repo}:\n${chequeo.detalle}\nLeé de nuevo los archivos con leer y rehacé el diff.` };
  const archivos = archivosDelDiff(input.diff);
  const payload: PayloadAccionCodigo = {
    repo: input.repo,
    diff: input.diff,
    archivos,
    justificacion: input.justificacion.trim().slice(0, 4000),
    prueba: input.prueba?.trim().slice(0, 500) || null,
    revertir: input.revertir?.trim().slice(0, 1000) || "git apply -R con el mismo diff",
    issueId: input.issueId,
    resumen: `${input.repo}: ${archivos.slice(0, 4).join(", ")}${archivos.length > 4 ? ` y ${archivos.length - 4} más` : ""}`,
    chequeo: chequeo.detalle,
  };
  const pendiente = await db.select({ id: approvals.id }).from(approvals).where(and(
    eq(approvals.type, TIPO_ACCION_CODIGO),
    eq(approvals.status, "pending"),
    sql`${approvals.payload}->>'diff' = ${input.diff}`,
  )).limit(1);
  if (pendiente[0]) return { ok: true, mensaje: `Ese mismo diff ya espera aprobación (${pendiente[0].id}). No lo vuelvas a proponer.` };
  const [fila] = await db.insert(approvals).values({
    companyId: input.companyId,
    type: TIPO_ACCION_CODIGO,
    requestedByAgentId: input.agentId,
    status: "pending",
    payload: payload as unknown as Record<string, unknown>,
  }).returning({ id: approvals.id });
  const despues = input.repo === "crm"
    ? "Cuando una persona la apruebe, el servidor aplica el diff en el CRM" + (payload.prueba ? ", corre la prueba" : "") + " y reinicia el servicio si está configurado."
    : "Cuando una persona la apruebe, lo aplica y despliega una persona desde el repo (el servidor no se modifica a sí mismo).";
  return { ok: true, mensaje: `Cambio propuesto: aprobación ${fila.id} — ${payload.resumen} (${chequeo.detalle}). ${despues} Nombrá la aprobación en la tarea, pasala a in_review y pará: no vuelvas a llamar la herramienta.` };
}

// ── ejecutar (solo desde approvals.approve) ──────────────────────────────────

export async function ejecutarCambioCodigo(p: PayloadAccionCodigo): Promise<{ ok: boolean; detalle: string }> {
  const error = validarDiff(p.diff);
  if (error) return { ok: false, detalle: error };
  if (p.repo === "lmtm-os") {
    return { ok: true, detalle: "Aprobado. lmtm-os no se modifica en caliente: aplicá el diff del payload en el repo (git apply), probá y desplegá." };
  }
  const d = destinoCrm();
  if (typeof d === "string") return { ok: false, detalle: d };
  const aplicar = await enCrm(d, `cd ${comillas(d.repo)} && f=$(mktemp) && cat > "$f" && git apply --check "$f" && git apply "$f"; rc=$?; rm -f "$f"; exit $rc`, p.diff);
  if (aplicar.codigo !== 0) return { ok: false, detalle: `No se aplicó: ${aplicar.salida.slice(0, 1500)}` };
  const partes = [`Aplicado en ${d.repo}.`];
  if (p.prueba) {
    const prueba = await enCrm(d, `cd ${comillas(d.repo)} && ${p.prueba}`, undefined, 300);
    if (prueba.codigo !== 0) {
      const vuelta = await enCrm(d, `cd ${comillas(d.repo)} && git apply -R -`, p.diff);
      return { ok: false, detalle: `La prueba falló y se revirtió${vuelta.codigo === 0 ? "" : " (OJO: la reversión también falló)"}:\n${prueba.salida.slice(0, 1500)}` };
    }
    partes.push("Prueba OK.");
  }
  if (d.reiniciar) {
    const r = await enCrm(d, d.reiniciar, undefined, 120);
    partes.push(r.codigo === 0 ? "Servicio reiniciado." : `El reinicio falló: ${r.salida.slice(0, 500)}`);
    if (r.codigo !== 0) return { ok: false, detalle: partes.join(" ") };
  }
  return { ok: true, detalle: partes.join(" ") };
}
