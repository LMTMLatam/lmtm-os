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

export async function withFreshAccessToken(db: Db, connection: AdsConnection): Promise<AdsConnection> {
  if (connection.platform !== "google") return connection;
  if (!connection.refreshToken) return connection; // nothing to refresh with
  if (!isKnownAdsPlatform(connection.platform)) return connection;
  const provider = getAdsProvider(connection.platform);
  try {
    const set = await provider.refreshToken(connection.refreshToken);
    if (!set.accessToken || set.accessToken === connection.accessToken) return connection;
    try {
      await db
        .update(adsConnections)
        .set({ accessToken: set.accessToken, expiresAt: set.expiresAt ?? null, updatedAt: new Date() })
        .where(eq(adsConnections.id, connection.id));
    } catch { /* persisting is best-effort; the fresh token still gets used */ }
    return { ...connection, accessToken: set.accessToken };
  } catch (e) {
    // El refresh falló (revocado, invalid_grant, app sin verificar…). Antes se
    // seguía en silencio con el token viejo y el caller recibía un 401 crudo de
    // searchStream, que NO dice la causa: parecía un problema de permisos de la
    // cuenta cuando en realidad la conexión entera está muerta y hay que volver
    // a autorizar. Costó 3 días de sync caído sin que nadie supiera por qué
    // (18-21/8: 84 syncs fallados, 0 completados).
    const motivo = e instanceof Error ? e.message : String(e);
    console.warn(`[ads] no se pudo refrescar el token de ${connection.platform} (${connection.id}): ${motivo.slice(0, 200)}`);
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
