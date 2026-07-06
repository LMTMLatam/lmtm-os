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
  } catch {
    // Refresh failed (revoked?). Fall through with the stored token — the
    // API call will surface the real error to the caller.
    return connection;
  }
}
