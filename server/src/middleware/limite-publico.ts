// LMTM-OS: tope de pedidos por minuto para las rutas sin login (/api/public: dashboards
// de clientes y material de Drive). Auditoría 20/11: un link compartido no tenía techo
// y cada pedido pega en la base. Una ventana fija por IP, en memoria.
// shortcut: por proceso; si algún día corren varias réplicas, el tope se multiplica por ellas.

import type { NextFunction, Request, Response } from "express";

/** Un dashboard abre ~10 pedidos juntos y cambiar el período otros tantos: 240/min sobra para una oficina entera. */
export const TOPE_POR_MINUTO = 240;

/** Puro. La IP del cliente detrás del proxy de Railway: la ÚLTIMA de X-Forwarded-For (la que agrega el proxy; las de antes las escribe quien pide). */
export function ipDe(xff: string | string[] | undefined, socket: string | undefined): string {
  const v = Array.isArray(xff) ? xff.join(",") : xff;
  const ultima = v?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return ultima || socket || "desconocida";
}

/** Contador de ventana fija. `ahora` se inyecta para el test. */
export function crearLimite(tope = TOPE_POR_MINUTO, ventanaMs = 60_000) {
  let inicio = 0;
  const cuenta = new Map<string, number>();
  return (ip: string, ahora = Date.now()): boolean => {
    if (ahora - inicio >= ventanaMs) {
      inicio = ahora;
      cuenta.clear();
    }
    const n = (cuenta.get(ip) ?? 0) + 1;
    cuenta.set(ip, n);
    return n <= tope;
  };
}

export function limitePublico() {
  const pasa = crearLimite();
  return (req: Request, res: Response, next: NextFunction) => {
    if (pasa(ipDe(req.headers["x-forwarded-for"], req.socket.remoteAddress))) return next();
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Demasiados pedidos. Probá de nuevo en un minuto." });
  };
}
