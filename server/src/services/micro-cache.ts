// LMTM-OS: micro-cache TTL para los endpoints de lectura pesados del panel
// (pedido 27/7: "lo que se abrió/sincronizó hace poco no se recalcula hasta
// después de un tiempo"). En memoria, acotado, keyed por URL completa (incluye
// query string, así cada cliente+rango+plataforma cachea aparte).
//
// Uso: router.get(path, microCache(3 * 60_000), handler). El middleware captura
// el res.json de respuestas 200 y las sirve directo dentro del TTL. Tras un
// sync real de un cliente, invalidar con invalidateMicroCache(slug).

import type { NextFunction, Request, Response } from "express";

interface Entry {
  at: number;
  value: unknown;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 800;

function evictOldest() {
  let oldestKey: string | null = null;
  let oldestAt = Infinity;
  for (const [k, e] of store) {
    if (e.at < oldestAt) {
      oldestAt = e.at;
      oldestKey = k;
    }
  }
  if (oldestKey) store.delete(oldestKey);
}

// Tipado laxo a propósito: si el middleware expone su RequestHandler genérico,
// TS re-infiere los params de las rutas como string|string[] y rompe handlers
// existentes. Con `any` la ruta conserva la inferencia normal de sus params.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function microCache(ttlMs: number): any {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") return next();
    const key = req.originalUrl;
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) {
      res.setHeader("x-lmtm-cache", "hit");
      res.json(hit.value);
      return;
    }
    const original = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode === 200) {
        store.set(key, { at: Date.now(), value: body });
        if (store.size > MAX_ENTRIES) evictOldest();
      }
      return original(body);
    }) as Response["json"];
    next();
  };
}

/** Drop every cached response whose URL contains the substring (e.g. a client slug/id). */
export function invalidateMicroCache(substr: string): number {
  let n = 0;
  for (const k of store.keys()) {
    if (k.includes(substr)) {
      store.delete(k);
      n += 1;
    }
  }
  return n;
}
