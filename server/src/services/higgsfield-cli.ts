// LMTM-OS: generación con el PLAN de Higgsfield (CLI `hf`).
//
// El plan Plus se paga aparte y sus créditos SOLO se pueden gastar por la
// cuenta de usuario — la API de plataforma (higgsfield-api.ts) tiene una bolsa
// distinta. Como el plan ya está pagado, esta es la vía por defecto.
//
// EL PROBLEMA QUE RESUELVE EL LOCK
// La CLI autentica con OAuth: el access token dura ~1h, se refresca solo, y el
// refresh_token ROTA en cada uso. Si dos procesos refrescan a la vez, uno rota
// el token y el otro queda con uno muerto → hay que re-loguear A MANO con un
// navegador. Pasó tres veces el 14/8, y la causa fueron los deploys: Railway
// levanta el contenedor nuevo antes de bajar el viejo, así que hay una ventana
// con DOS procesos vivos, cada uno con su propio barrido.
//
// Una cola en memoria no alcanza (es por proceso). El lock va en Postgres, que
// es lo único que los dos contenedores comparten.
//
// POR QUÉ NO pg_advisory_lock (17/8)
// Los advisory locks son de la SESIÓN, y acá se habla con un POOL: tomar y
// liberar caen en conexiones distintas cada tanto. Cuando pasa,
// pg_advisory_unlock devuelve false SIN tirar error — el .catch no salta — y esa
// conexión vuelve al pool con el lock puesto para siempre. Se confirmó hoy: una
// conexión idle, corriendo queries de feedback_exports, tenía tomado el objid.
// Ahora el lock es una fila con vencimiento: no depende de la conexión y se cura
// sola si el proceso muere sin liberarla.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Db } from "@paperclipai/db";
import { sql } from "drizzle-orm";

const run = promisify(execFile);

const HF = process.env.HIGGSFIELD_BIN ?? "hf";
const CREDENCIALES = process.env.HIGGSFIELD_CREDENTIALS_PATH ?? "/data/higgsfield/credentials.json";
const CONFIG = process.env.HIGGSFIELD_CONFIG_PATH ?? "/data/higgsfield/config.json";

/** Cuánto esperar el lock antes de rendirse. Una generación tarda 1-3 min, así
 *  que 6 min cubre a un vecino trabajando sin colgar el request para siempre. */
const ESPERA_LOCK_MS = 6 * 60_000;
/** Vencimiento del lock. Tiene que ser MÁS LARGO que el timeout más grande de la
 *  CLI (15 min) para no soltarlo mientras el proceso dueño sigue generando. */
const LOCK_TTL_MS = 20 * 60_000;
/** Quién lo tomó. Solo para diagnosticar quién dejó el lock colgado. */
const HOLDER = `${process.env.RAILWAY_REPLICA_ID ?? "local"}:${process.pid}`;

/**
 * Modelo de video del plan.
 *
 * Seedance 2.5 (pedido del usuario 18/8). Antes era veo3_1_lite, que el propio
 * catálogo describe como "fast batch / volume" — barato y para volumen, no para
 * la pieza que ve el cliente. Seedance 2.5 tope 720p, que para 9:16 en redes
 * alcanza de sobra.
 */
export const MODELO_VIDEO_PLAN = process.env.HIGGSFIELD_MODELO ?? "seedance_2_5";

/**
 * Modelo de placa según lo que hay en la escena (costos medidos 18/8):
 *
 *   Soul Location      0,12 créditos  — lugares y escenas SIN gente
 *   Soul 2.0           0,12           — gente, lifestyle, UGC
 *   Nano Banana Pro    2              — el único que acepta referencias
 *   GPT Image 2        7
 *
 * Veníamos usando Nano Banana Pro para TODO. El catálogo lo describe para
 * "character, cartoon, stylized, reference-driven" — nada que ver con foto
 * comercial de un taller o un departamento — y encima sale 16 veces más caro
 * que el modelo correcto. Soul Location es best-in-class para escenas sin
 * personas, que es la mitad de nuestras placas.
 *
 * Con referencias cargadas (foto de producto, avatar) gana Nano Banana Pro:
 * Soul Location es prompt-only y no las acepta.
 */
export function modeloImagen(opts: { conReferencias: boolean; conPersonas: boolean }): string {
  if (process.env.HIGGSFIELD_MODELO_IMG) return process.env.HIGGSFIELD_MODELO_IMG;
  if (opts.conReferencias) return "nano_banana_pro";
  return opts.conPersonas ? "text2image_soul_v2" : "soul_location";
}

export const SESION_VENCIDA = /session expired|not authenticated|hf auth login/i;

/** Qué refresh_token de las VARIABLES sembró el archivo del volumen. */
const SEMILLA = `${dirname(CREDENCIALES)}/seed.txt`;

/**
 * Materializa las credenciales en el volumen persistente.
 *
 * POR QUÉ NO SE COMPARA CONTRA EL ARCHIVO (18/8)
 * Antes se pisaba el archivo cuando su refresh_token no coincidía con el de las
 * variables, asumiendo que esa diferencia significaba "alguien re-autenticó a
 * mano". Pero el refresh_token ROTA EN CADA USO y la CLI lo reescribe en el
 * archivo: apenas se genera algo, archivo y variable ya son distintos. Entonces
 * el SIGUIENTE arranque —o sea, cada deploy— pisaba el token fresco con el de la
 * variable, que ya estaba consumido y muerto. Esa es la razón real por la que la
 * sesión se caía sola una y otra vez, y por la que caía "después de un rato":
 * el rato era el próximo deploy.
 *
 * Ahora se guarda aparte QUÉ token de la variable sembró el archivo. Si sigue
 * siendo el mismo, el archivo es nuestro y está rotado hacia adelante: no se
 * toca. Solo se repone cuando la variable cambió de verdad.
 */
export function prepararCredenciales(): boolean {
  const access = process.env.HIGGSFIELD_ACCESS_TOKEN;
  const refresh = process.env.HIGGSFIELD_REFRESH_TOKEN;
  if (!access || !refresh) return false;
  if (existsSync(CREDENCIALES)) {
    try {
      const sembrado = existsSync(SEMILLA) ? readFileSync(SEMILLA, "utf8").trim() : null;
      if (sembrado === refresh) return true; // el archivo salió de esta misma variable: puede estar rotado, se respeta
      const actual = JSON.parse(readFileSync(CREDENCIALES, "utf8")) as { refresh_token?: string };
      if (actual.refresh_token === refresh) {
        // Archivo sin sembrar (viene de antes de este cambio) pero coincide:
        // se anota la semilla para no volver a pisarlo nunca más.
        try { writeFileSync(SEMILLA, refresh, "utf8"); } catch { /* nada */ }
        return true;
      }
      console.log("[higgsfield] cambió el refresh token de las variables — repongo las credenciales del volumen.");
    } catch { /* archivo ilegible: se reescribe */ }
  }
  try {
    mkdirSync(dirname(CREDENCIALES), { recursive: true });
    writeFileSync(CREDENCIALES, JSON.stringify({
      auth_version: 2,
      access_token: access,
      refresh_token: refresh,
      // El vencimiento REAL del access token, no uno inventado.
      //
      // Se ponía siempre now+3600 y el access token de Higgsfield dura ~24h: a
      // la hora la CLI lo daba por vencido y refrescaba sin necesidad, y cada
      // refresh ROTA el refresh_token. O sea que un login recién hecho se
      // consumía solo en una hora, sin haber generado nada (18/8). Con el
      // expires_at verdadero se ahorran ~23 rotaciones por día.
      expires_at: Number(process.env.HIGGSFIELD_EXPIRES_AT) || Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      scope: "email profile openid offline_access",
    }), "utf8");
    writeFileSync(SEMILLA, refresh, "utf8");
    const ws = process.env.HIGGSFIELD_WORKSPACE_ID;
    if (ws) {
      mkdirSync(dirname(CONFIG), { recursive: true });
      writeFileSync(CONFIG, JSON.stringify({ workspace_id: ws }), "utf8");
    }
    return true;
  } catch (e) {
    console.warn("[higgsfield] no se pudieron escribir las credenciales:", e instanceof Error ? e.message : e);
    return false;
  }
}

export const hayPlan = (): boolean =>
  !!process.env.HIGGSFIELD_ACCESS_TOKEN && !!process.env.HIGGSFIELD_REFRESH_TOKEN;

function entorno(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HIGGSFIELD_CREDENTIALS_PATH: CREDENCIALES,
    HIGGSFIELD_CONFIG_PATH: CONFIG,
    HIGGSFIELD_DISABLE_TELEMETRY: "1",
  };
}

/**
 * Corre `fn` con el lock global tomado: NINGÚN otro proceso puede estar
 * hablando con Higgsfield al mismo tiempo, ni siquiera durante un deploy.
 *
 * El lock es la fila de `higgsfield_lock`. Se toma con un UPDATE condicional:
 * solo gana quien encuentra el vencimiento pasado, y eso es atómico en una sola
 * sentencia, así que no hay carrera aunque dos contenedores pregunten a la vez.
 */
async function conLock<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  const limite = Date.now() + ESPERA_LOCK_MS;
  let tomado = false;
  while (Date.now() < limite) {
    const res = await db.execute(sql`
      UPDATE higgsfield_lock
         SET holder = ${HOLDER}, taken_at = now(),
             expires_at = now() + ${`${Math.round(LOCK_TTL_MS / 1000)} seconds`}::interval
       WHERE id AND expires_at < now()
      RETURNING holder`);
    const filas = (Array.isArray(res) ? res : (res as { rows?: unknown[] })?.rows) ?? [];
    if (filas.length > 0) { tomado = true; break; }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  if (!tomado) throw new Error("otro proceso está usando Higgsfield y no se liberó a tiempo");
  try {
    return await fn();
  } finally {
    // Vencerlo (no borrar la fila) libera el lock. Si esto falla, se cae solo al
    // cumplirse el TTL — antes un unlock fallido lo dejaba tomado para siempre.
    await db.execute(sql`UPDATE higgsfield_lock SET holder = NULL, expires_at = now() WHERE id AND holder = ${HOLDER}`)
      .catch((e) => console.error("[higgsfield] no se pudo liberar el lock (se libera solo al vencer):", e instanceof Error ? e.message : e));
  }
}

/** Ejecuta la CLI bajo el lock, con un reintento si el token acaba de rotar. */
async function hf(db: Db, args: string[], timeoutMs = 15 * 60_000): Promise<string> {
  return conLock(db, async () => {
    const intentar = async () => {
      try {
        const { stdout } = await run(HF, args, { env: entorno(), timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
        return { ok: true as const, stdout };
      } catch (e) {
        const err = e as { stderr?: string; stdout?: string; message?: string };
        return { ok: false as const, msg: (err.stderr || err.stdout || err.message || String(e)).toString().trim().slice(0, 500) };
      }
    };
    const primero = await intentar();
    if (primero.ok) return primero.stdout;
    // Si otro proceso refrescó justo antes de que tomáramos el lock, el archivo
    // del volumen ya tiene el token nuevo: la CLI lo relee en cada invocación.
    if (SESION_VENCIDA.test(primero.msg)) {
      await new Promise((r) => setTimeout(r, 3_000));
      const segundo = await intentar();
      if (segundo.ok) {
        console.log("[higgsfield] sesión recuperada releyendo el token del volumen.");
        return segundo.stdout;
      }
      throw new Error(segundo.msg);
    }
    throw new Error(primero.msg);
  });
}

/**
 * Créditos del plan, o null si no se pudo leer.
 *
 * Devuelve TAMBIÉN el error: tragárselo dejaba al panel diciendo siempre
 * "la sesión del plan está caída", que es una causa entre varias (lock tomado,
 * la CLI colgada, el token rotado). Sin el texto real hay que ir a los logs de
 * Railway para saber cuál de las tres fue.
 */
let saldoCacheado: { hasta: number; valor: { creditos: number | null; error: string | null } } | null = null;
const CACHE_SALDO_MS = 5 * 60_000;

export async function creditosPlan(db: Db): Promise<{ creditos: number | null; error: string | null }> {
  // El panel pide el estado cada 60s y con la sesión caída la CLI tarda 60s en
  // rendirse, TODO ese rato con el lock tomado: con la pantalla abierta el
  // barrido no conseguía generar nunca. Se cachea el resultado unos minutos.
  if (saldoCacheado && Date.now() < saldoCacheado.hasta) return saldoCacheado.valor;
  try {
    const out = await hf(db, ["account", "status"], 60_000);
    const m = out.match(/([\d.,]+)\s*credits/i);
    const valor = m
      ? { creditos: Number(m[1].replace(/[.,](?=\d{3}\b)/g, "")), error: null }
      : { creditos: null, error: `la CLI respondió sin créditos: ${out.trim().slice(0, 200)}` };
    saldoCacheado = { hasta: Date.now() + CACHE_SALDO_MS, valor };
    return valor;
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).trim().slice(0, 200);
    console.warn("[higgsfield] no se pudo leer el saldo del plan:", msg);
    const valor = { creditos: null as number | null, error: msg };
    saldoCacheado = { hasta: Date.now() + CACHE_SALDO_MS, valor };
    return valor;
  }
}

/** Catálogo del plan. Solo lectura, no gasta un crédito: sirve para elegir el
 *  modelo con datos y no de memoria. */
export async function modelosPlan(db: Db): Promise<string> {
  return hf(db, ["model", "list", "--json"], 60_000);
}

/** Qué sale generar con un modelo, ANTES de generar. Cambiar de modelo sin
 *  mirar esto es cómo se vacía la bolsa sin darse cuenta. */
export async function costoPlan(db: Db, modelo: string, extra: string[] = []): Promise<string> {
  return hf(db, ["generate", "cost", modelo, "--prompt", "test scene, soft daylight, 35mm", ...extra, "--json"], 60_000);
}

function urlDeSalida(stdout: string): { url: string; jobId?: string } {
  const jobs = JSON.parse(stdout.slice(stdout.indexOf("["))) as Array<{ id?: string; result_url?: string | null; status?: string }>;
  const job = jobs.find((j) => j.result_url) ?? jobs[0];
  if (!job?.result_url) throw new Error(`terminó sin archivo (status: ${job?.status ?? "?"})`);
  return { url: job.result_url, jobId: job.id };
}

/** Esquema del modelo, para saber qué flags acepta antes de mandarle nada.
 *  Solo lectura, sin costo. */
export async function esquemaModelo(db: Db, modelo: string): Promise<string> {
  return hf(db, ["model", "get", modelo, "--json"], 60_000);
}

/**
 * Video vertical de 8s con los créditos del plan.
 *
 * Seedance 2.5 tiene modos: `t2v` para texto puro y `omni_reference` cuando hay
 * una imagen de partida (la pieza del diseñador). Mandar una imagen en modo t2v
 * la ignora, que es peor que no mandarla — el video sale sin la identidad de la
 * marca creyendo uno que sí la lleva.
 */
export async function generarVideoPlan(
  db: Db,
  prompt: string,
  opts: { imagenUrl?: string | null } = {},
): Promise<{ url: string; jobId?: string }> {
  const args = ["generate", "create", MODELO_VIDEO_PLAN, "--prompt", prompt,
    "--aspect-ratio", "9:16", "--wait", "--wait-timeout", "12m", "--json"];
  if (/seedance_2/.test(MODELO_VIDEO_PLAN)) {
    args.push("--duration", "8", "--resolution", "720p");
    if (/seedance_2_5/.test(MODELO_VIDEO_PLAN)) args.push("--mode", opts.imagenUrl ? "omni_reference" : "t2v");
  }
  if (opts.imagenUrl) args.push("--start-image", opts.imagenUrl);
  return urlDeSalida(await hf(db, args));
}

/** ¿La escena tiene personas? Decide entre Soul 2.0 y Soul Location. */
export const HAY_PERSONAS = /\b(person|people|man|men|woman|women|child|children|kid|boy|girl|family|couple|mechanic|technician|worker|hands?|client|customer|team|crowd|portrait|someone)\b/i;

/**
 * Placa vertical con los créditos del plan.
 *
 * 3:4, no 4:5: Soul y GPT Image 2 no aceptan 4:5 (verificado contra el esquema
 * 18/8, "allowed: 1:1,16:9,9:16,4:3,3:4,3:2,2:3"). 3:4 es la vertical más
 * cercana y la que ya usaba la vía del API.
 */
export async function generarImagenPlan(
  db: Db,
  prompt: string,
  opts: { referencias?: string[]; aspect?: string } = {},
): Promise<{ url: string; jobId?: string }> {
  const refs = opts.referencias ?? [];
  const modelo = modeloImagen({ conReferencias: refs.length > 0, conPersonas: HAY_PERSONAS.test(prompt) });
  const args = ["generate", "create", modelo, "--prompt", prompt,
    "--aspect-ratio", opts.aspect ?? "3:4", "--wait", "--wait-timeout", "10m", "--json"];
  // Soul cobra igual 1.5k que 2k (0,12 en los dos): se pide siempre la mejor.
  if (/soul/.test(modelo) && modelo !== "soul_location") args.push("--quality", "2k");
  for (const r of refs) args.push("--image", r);
  return urlDeSalida(await hf(db, args));
}
