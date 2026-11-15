// LMTM-OS: el equipo entra al panel con un código (pedido 16/10: "cerrá el
// registro y pasame la invitación válida para todo el equipo").
//
// - El registro de cuentas queda cerrado: solo se crea una cuenta con el
//   código del equipo o con una invitación de paperclip vigente (guardaRegistro).
// - Con el código (LMTM_INVITACION_EQUIPO), la persona entra directo como
//   operador: ve los clientes, no finanzas ni licitaciones. Las invitaciones de
//   paperclip son de un solo uso y además piden aprobar cada ingreso; para "un
//   link para todo el equipo" no servían.
// - Para revocar el link, se cambia LMTM_INVITACION_EQUIPO en Railway.

import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { companies, invites } from "@paperclipai/db";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { accessService } from "../services/access.js";
import { humanJoinGrantsFromDefaults } from "../services/invite-grants.js";
import { assertInstanceAdmin } from "./authz.js";

/** ¿Es el código del equipo? Comparación en tiempo constante; sin código cargado, nunca. */
export function esCodigoEquipo(dado: unknown, esperado = process.env.LMTM_INVITACION_EQUIPO): boolean {
  if (typeof dado !== "string" || !esperado || dado.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(dado), Buffer.from(esperado));
}

/** ¿Es una invitación de paperclip vigente (ni usada, ni revocada, ni vencida)? */
async function esInvitacionVigente(db: Db, token: string): Promise<boolean> {
  if (!token) return false;
  const hash = createHash("sha256").update(token).digest("hex");
  const [fila] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.tokenHash, hash), isNull(invites.revokedAt), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .limit(1);
  return !!fila;
}

/**
 * Antes del alta de better-auth: sin código del equipo ni invitación vigente
 * (header `x-lmtm-invitacion`), no se crea la cuenta. Hasta el 16/10 cualquiera
 * se registraba y quedaba logueado.
 */
export function guardaRegistro(db: Db) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const codigo = String(req.headers["x-lmtm-invitacion"] ?? "").trim();
    if (esCodigoEquipo(codigo) || (await esInvitacionVigente(db, codigo).catch(() => false))) return next();
    res.status(403).json({ message: "El registro es solo con invitación. Pedile el link al equipo de LMTM.", code: "REGISTRO_CERRADO" });
  };
}

export function equipoRoutes(db: Db): Router {
  const router = Router();
  const access = accessService(db);

  // GET /api/equipo/codigo?c= — ¿el link del equipo es válido? (para la pantalla de alta)
  router.get("/equipo/codigo", (req, res) => {
    res.json({ valido: esCodigoEquipo(String(req.query.c ?? "")) });
  });

  // POST /api/equipo/unirse { codigo } — con sesión: queda como operador de la agencia.
  router.post("/equipo/unirse", async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) return res.status(401).json({ error: "Primero entrá con tu cuenta." });
    if (!esCodigoEquipo(req.body?.codigo)) return res.status(403).json({ error: "El link del equipo no es válido o se cambió." });
    const [empresa] = await db.select({ id: companies.id }).from(companies).orderBy(asc(companies.createdAt)).limit(1);
    if (!empresa) return res.status(500).json({ error: "No hay empresa." });
    const yaEs = (req.actor.memberships ?? []).some((m) => m.companyId === empresa.id && m.status === "active");
    // Un dueño o admin que abre el link no se baja a operador.
    if (!yaEs) {
      await access.ensureMembership(empresa.id, "user", req.actor.userId, "operator", "active");
      await access.setPrincipalGrants(empresa.id, "user", req.actor.userId, humanJoinGrantsFromDefaults(null, "operator"), null);
    }
    res.json({ ok: true, companyId: empresa.id, yaEra: yaEs });
  });

  // ── Links del conector de Claude por persona (15/11) ──────────────────────
  // Solo admins: el link ES el acceso. GET lista con su link; POST agrega; POST revocar saca o renueva.
  router.get("/equipo/conector", async (req, res) => {
    assertInstanceAdmin(req);
    const { personas, codigoDe } = await import("../services/conector-personas.js");
    const { URL_BASE } = await import("../services/guia-contenido.js");
    const { sql } = await import("drizzle-orm");
    const uso = await db.execute(sql`select details->>'persona' persona, count(*) llamadas, max(created_at) ultima
      from activity_log where action = 'conector.herramienta' and created_at > now() - interval '30 days' group by 1`);
    const filasUso = (Array.isArray(uso) ? uso : ((uso as { rows?: unknown[] }).rows ?? [])) as Array<{ persona: string; llamadas: number; ultima: string }>;
    const lista = (await personas(db)).map((p) => {
      const u = filasUso.find((x) => x.persona === p.nombre);
      const c = codigoDe(p);
      return { nombre: p.nombre, alta: p.alta, link: c ? `${URL_BASE()}/mcp-equipo/${c}` : null, llamadas30d: Number(u?.llamadas ?? 0), ultimoUso: u?.ultima ?? null };
    });
    const compartido = filasUso.find((x) => x.persona === "link compartido");
    res.json({ personas: lista, linkCompartido: { activo: !!process.env.LMTM_CONECTOR_EQUIPO, llamadas30d: Number(compartido?.llamadas ?? 0), ultimoUso: compartido?.ultima ?? null } });
  });
  router.post("/equipo/conector", async (req, res) => {
    assertInstanceAdmin(req);
    const { agregarPersona } = await import("../services/conector-personas.js");
    const r = await agregarPersona(db, String(req.body?.nombre ?? ""));
    res.status(r.ok ? 200 : 422).json(r);
  });
  router.post("/equipo/conector/revocar", async (req, res) => {
    assertInstanceAdmin(req);
    const { revocarPersona } = await import("../services/conector-personas.js");
    const r = await revocarPersona(db, String(req.body?.nombre ?? ""), req.body?.nuevo === true);
    res.status(r.ok ? 200 : 422).json(r);
  });

  return router;
}
