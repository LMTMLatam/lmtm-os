// LMTM-OS: el caché del informe público, separado para que lo puedan borrar
// los que publican y retiran (informes-store) sin importar al que lo arma
// (informe-publico), que a su vez importa al store.
//
// Por qué no el microCache de las demás rutas públicas: ése guarda por URL
// completa, así que cualquier parámetro inventado (?r=1, ?r=2…) era una
// lectura nueva de ~10 métricas sin login, y no había forma de borrar lo
// guardado al retirar un informe: el cliente lo seguía viendo 5 minutos.

const TTL_MS = 5 * 60_000;
const MAXIMO = 500;
const guardado = new Map<string, { at: number; valor: unknown }>();

const clave = (clientId: string, semana: string) => `${clientId}:${semana}`;

export async function conCache<T>(clientId: string, semana: string, armar: () => Promise<T>): Promise<T> {
  const k = clave(clientId, semana);
  const hit = guardado.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.valor as T;
  const valor = await armar();
  if (guardado.size >= MAXIMO) guardado.delete(guardado.keys().next().value as string);
  guardado.set(k, { at: Date.now(), valor });
  return valor;
}

/** Al publicar o retirar: lo que ve el cliente cambia ya, no en 5 minutos. */
export function olvidarInformePublico(clientId: string): void {
  for (const k of guardado.keys()) if (k.startsWith(`${clientId}:`)) guardado.delete(k);
}
