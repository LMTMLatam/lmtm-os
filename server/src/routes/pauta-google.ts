// LMTM-OS: Google Ads, cuenta por cuenta (pedido 13/10: "tema Google Ads, en
// qué estamos, no veo nada de eso").
//
// El panel mezclaba Google con Meta en el semáforo y en la ficha, y lo único
// propio de Google que aparecía en Hoy eran algunos saldos. Esto muestra los
// clientes con Google conectado: si se lo ve (salud de la fuente), cuánto gastó,
// los leads y su costo, las campañas, y lo que está pendiente en Hoy. Solo
// lectura. Los números salen de los mismos módulos que el resto del panel.

import { Router } from "express";
import { assertMiembro } from "./authz.js";
import type { Db } from "@paperclipai/db";
import { adsAccountMappings, clients, decisiones } from "@paperclipai/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { saludFuentes } from "../ingest/salud.js";
import { metricasCliente } from "../metricas/index.js";
import { esActiva, metricasCampanas, type MetricasCampana } from "../metricas/campanas.js";

/** Las campañas como se muestran: activas primero, después las que más gastaron. Puro. */
export function resumenCampanas(cs: MetricasCampana[] | null) {
  if (!cs) return null;
  const lista = [...cs].sort((a, b) => Number(esActiva(b.estado)) - Number(esActiva(a.estado)) || b.inversion - a.inversion);
  return {
    activas: cs.filter((c) => esActiva(c.estado)).length,
    activasSinGasto: cs.filter((c) => esActiva(c.estado) && c.inversion === 0).length,
    lista: lista.slice(0, 8).map((c) => ({
      id: c.campaignId, nombre: c.nombre, estado: c.estado, activa: esActiva(c.estado),
      inversion: c.inversion, leads: c.leads, cpl: c.cpl, leadsDudosos: c.leadsDudosos,
      ultimoDiaConGasto: c.ultimoDiaConGasto,
    })),
  };
}

const dia = (msAtras: number) => new Date(Date.now() - msAtras).toISOString().slice(0, 10);

let cache: { at: number; data: unknown } | null = null;

export function pautaGoogleRoutes(db: Db): Router {
  const router = Router();
  // Sin sesión, nada (14/10): respondía a cualquiera con el gasto y los leads de cada cliente.
  router.use(["/pauta/google"], (req, _res, next) => { assertMiembro(req); next(); });

  // GET /api/pauta/google — ?fresco=1 vuelve a calcular (si no, 10 min de cache).
  router.get("/pauta/google", async (req, res) => {
    try {
      if (cache && Date.now() - cache.at < 10 * 60_000 && req.query.fresco !== "1") return res.json(cache.data);
      const salud = (await saludFuentes(db)).filter((s) => s.fuente === "google_ads" && s.estado !== "sin_conexion");
      const ids = salud.map((s) => s.clientId);
      if (ids.length === 0) return res.json({ generadoAt: new Date().toISOString(), clientes: [] });

      const [slugs, monedas, pendientes] = await Promise.all([
        db.select({ id: clients.id, slug: clients.slug }).from(clients).where(inArray(clients.id, ids)),
        db.select({ clientId: adsAccountMappings.clientId, moneda: adsAccountMappings.currency })
          .from(adsAccountMappings).where(and(eq(adsAccountMappings.platform, "google"), inArray(adsAccountMappings.clientId, ids))),
        db.select({ clientId: decisiones.clientId, que: decisiones.que, tipo: decisiones.tipo })
          .from(decisiones)
          .where(and(
            inArray(decisiones.estado, ["abierta", "aprobada"]),
            inArray(decisiones.clientId, ids),
            or(sql`${decisiones.clave} ilike '%google%'`, sql`${decisiones.que} ilike '%google%'`),
          )),
      ]);
      const slugDe = new Map(slugs.map((s) => [s.id, s.slug]));
      const monedaDe = new Map(monedas.map((m) => [m.clientId, m.moneda]));

      // Ventanas que terminan AYER: el día de hoy está a medio sincronizar.
      const ayer = dia(86_400_000);
      const v7 = { desde: dia(7 * 86_400_000), hasta: ayer, plataforma: "google" as const };
      const v30 = { desde: dia(30 * 86_400_000), hasta: ayer, plataforma: "google" as const };

      const filas = [];
      for (const s of salud) {
        const [m7, m30, camps] = await Promise.all([
          metricasCliente(db, s.clientId, v7),
          metricasCliente(db, s.clientId, v30),
          metricasCampanas(db, s.clientId, v30).catch(() => null),
        ]);
        filas.push({
          clientId: s.clientId, cliente: s.cliente, slug: slugDe.get(s.clientId) ?? null,
          estado: s.estado, detalle: s.detalle, ultimoDato: s.ultimoDato,
          moneda: monedaDe.get(s.clientId) ?? null,
          gasto7: m7.inversion, gasto30: m30.inversion, leads30: m30.leads, cpl30: m30.cpl,
          clics30: m30.clics, leadsDudosos: m30.leadsDudosos.includes("google"),
          campanas: resumenCampanas(camps),
          pendientes: pendientes.filter((p) => p.clientId === s.clientId).map((p) => p.que),
        });
      }
      // Lo que hay que mirar primero: sin acceso, después lo que gasta (de más a menos), después lo apagado.
      const orden = { fallando: 0, atrasada: 1, ok: 2, sin_entrega: 3, sin_conexion: 4 } as const;
      filas.sort((a, b) => orden[a.estado] - orden[b.estado] || (b.gasto30 ?? 0) - (a.gasto30 ?? 0));
      const data = { generadoAt: new Date().toISOString(), desde30: v30.desde, hasta: ayer, clientes: filas };
      cache = { at: Date.now(), data };
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  return router;
}
