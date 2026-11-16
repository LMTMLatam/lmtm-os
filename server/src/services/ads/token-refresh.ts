// LMTM-OS: per-call access-token freshness for OAuth-expiring platforms.
//
// Meta issues long-lived tokens, so passing the stored access_token around
// works. Google Ads access tokens die after ~1h — every code path that read
// conn.accessToken straight from the row started 401ing an hour after the
// OAuth dance. This helper refreshes via the stored refresh token (and
// persists the new access token) so the connect-flow routes and the sync
// always hit the API with a live credential. Passthrough for platforms whose
// tokens don't expire this way.

import type { Db, AdsConnection } from "@paperclipai/db";
import { adsConnections } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { getAdsProvider, isKnownAdsPlatform } from "./registry.js";

/** ¿El error del refresh dice que el token ya no vale (hay que reconectar), o es una falla pasajera? Puro. */
export function esRevocacion(motivo: string): boolean {
  return /invalid_grant|unauthorized_client|invalid_client|revoked|expired|deleted_client|access_denied/i.test(motivo);
}

export async function withFreshAccessToken(db: Db, connection: AdsConnection): Promise<AdsConnection> {
  if (connection.platform !== "google") return connection;
  if (!connection.refreshToken) return connection; // nothing to refresh with
  if (!isKnownAdsPlatform(connection.platform)) return connection;
  const provider = getAdsProvider(connection.platform);
  try {
    const set = await provider.refreshToken(connection.refreshToken);
    // 16/11: si estaba marcada en error y el refresh anduvo, vuelve a activa. Antes quedaba «caída» para
    // siempre aunque Google ya respondiera, y bloqueaba la auditoría hasta que alguien reconectara.
    const reactivar = connection.status === "error" ? { status: "active", lastError: null, lastCheckAt: new Date() } : {};
    if (!set.accessToken || set.accessToken === connection.accessToken) {
      if (connection.status === "error") await db.update(adsConnections).set(reactivar).where(eq(adsConnections.id, connection.id)).catch(() => undefined);
      return connection.status === "error" ? { ...connection, status: "active", lastError: null } : connection;
    }
    try {
      await db
        .update(adsConnections)
        .set({ accessToken: set.accessToken, expiresAt: set.expiresAt ?? null, updatedAt: new Date(), ...reactivar })
        .where(eq(adsConnections.id, connection.id));
    } catch { /* persisting is best-effort; the fresh token still gets used */ }
    return { ...connection, accessToken: set.accessToken, ...(connection.status === "error" ? { status: "active", lastError: null } : {}) };
  } catch (e) {
    // El refresh falló (revocado, invalid_grant, app sin verificar…). Antes se
    // seguía en silencio con el token viejo y el caller recibía un 401 crudo de
    // searchStream, que NO dice la causa: parecía un problema de permisos de la
    // cuenta cuando en realidad la conexión entera está muerta y hay que volver
    // a autorizar. Costó 3 días de sync caído sin que nadie supiera por qué
    // (18-21/8: 84 syncs fallados, 0 completados).
    const motivo = e instanceof Error ? e.message : String(e);
    console.warn(`[ads] no se pudo refrescar el token de ${connection.platform} (${connection.id}): ${motivo.slice(0, 200)}`);
    // 16/11: solo una revocación real marca la conexión caída. `internal_failure`, un 5xx o un corte de red
    // son de Google y pasan solos: marcarlas como «hay que reconectar» bloqueaba todo Google sin motivo.
    if (!esRevocacion(motivo)) {
      await db.update(adsConnections)
        .set({ lastError: `Google no respondió al renovar el acceso (pasajero, se reintenta solo): ${motivo.slice(0, 300)}`, lastCheckAt: new Date() })
        .where(eq(adsConnections.id, connection.id)).catch(() => undefined);
      return connection;
    }
    try {
      await db
        .update(adsConnections)
        .set({
          status: "error",
          lastError: `El refresh token ya no sirve — hay que reconectar la cuenta. Detalle: ${motivo.slice(0, 400)}`,
          lastCheckAt: new Date(),
        })
        .where(eq(adsConnections.id, connection.id));
    } catch { /* marcar es best-effort */ }
    return connection;
  }
}
