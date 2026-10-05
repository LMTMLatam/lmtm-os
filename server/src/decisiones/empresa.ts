// LMTM-OS: a qué empresa pertenece un cliente, sin adivinar.
//
// `clients` no tiene company_id (es una tabla de LMTM sobre el esquema de
// paperclip). `resolveCompanyId` de intel-common sirve para lo que fue hecha
// —encontrar dónde colgar un issue— y por eso, sin evidencia, devuelve la
// primera empresa de la tabla. Para AISLAR no sirve: "la primera que haya" le
// daría a un agente de otra empresa acceso a un cliente que no es suyo.
//
// Acá la respuesta es la empresa de sus cuentas de pauta, después la de sus
// filas de pauta, y si no hay ninguna evidencia, la única empresa de la
// instancia (que es el caso de LMTM). Con más de una empresa y sin evidencia,
// null: no se sabe, y el que llama decide negar.

import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsInsights, companies } from "@paperclipai/db";
import { eq } from "drizzle-orm";

export async function empresaDelCliente(db: Db, clientId: string): Promise<string | null> {
  const [m] = await db.select({ c: adsAccountMappings.companyId }).from(adsAccountMappings).where(eq(adsAccountMappings.clientId, clientId)).limit(1);
  if (m?.c) return m.c;
  const [i] = await db.select({ c: adsInsights.companyId }).from(adsInsights).where(eq(adsInsights.clientId, clientId)).limit(1);
  if (i?.c) return i.c;
  const unicas = await db.select({ id: companies.id }).from(companies).limit(2);
  return unicas.length === 1 ? unicas[0].id : null;
}
