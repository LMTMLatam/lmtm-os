// Números del encabezado de la ficha (rediseño 20/11). Puros: se testean sin pantalla.
import type { Client, ClientAdsSummary } from "../../api/clients";

/**
 * Días que dura el saldo de Meta al ritmo de gasto de la ventana del resumen.
 * null = no se puede decir (sin saldo informado, sin gasto o sin días): nunca un 0 inventado.
 */
export function diasDeSaldo(ads: Pick<ClientAdsSummary, "accountHealth" | "insights"> | undefined): number | null {
  const restante = ads?.accountHealth?.remaining;
  const meta = Object.values(ads?.insights.byPlatform ?? {}).find((p) => p.platform === "meta");
  if (restante == null || !meta || meta.days <= 0 || meta.spend <= 0) return null;
  return Math.max(0, Math.floor(restante / (meta.spend / meta.days)));
}

/** Los recursos de afuera del cliente: los configurados abren; los demás se dicen. */
export function recursosDe(c: Pick<Client, "clickupFolderId" | "sheetsSpreadsheetId" | "websiteUrl" | "metadata">): Array<{ nombre: string; url: string | null }> {
  const meta = (c.metadata ?? {}) as Record<string, unknown>;
  const teamId = (meta.clickupTeamId as string | undefined) || "9013352440";
  const s = (k: string) => (typeof meta[k] === "string" && meta[k] ? (meta[k] as string) : null);
  return [
    { nombre: "ClickUp", url: c.clickupFolderId ? `https://app.clickup.com/${teamId}/v/f/${c.clickupFolderId}` : null },
    { nombre: "Sheet de redes", url: c.sheetsSpreadsheetId ? `https://docs.google.com/spreadsheets/d/${c.sheetsSpreadsheetId}/edit` : null },
    { nombre: "Producción de video", url: s("produccionSheetId") && `https://docs.google.com/spreadsheets/d/${s("produccionSheetId")}/edit` },
    { nombre: "Script de redes", url: s("redesScriptId") && `https://script.google.com/d/${s("redesScriptId")}/edit` },
    { nombre: "Web", url: c.websiteUrl ?? null },
  ];
}
