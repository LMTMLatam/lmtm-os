// LMTM-OS: qué hace un agente solo y qué espera a una persona.
//
// 20/11 (Naza): «las optimizaciones de Google Ads no tienen que esperar a ser aprobadas, se tienen que hacer; mismo
// optimizaciones de SEO, web y Meta. Siempre y cuando nada sea apagar o deshabilitar campaña». Antes TODO lo que
// tocaba una cuenta o una web quedaba como propuesta (firma humana, 20/10).
//
// En el momento (esta función): Google Ads (agregar negativas, sumar keywords que ya convierten) y, en las webs, lo
// que arregla sin apagar nada: spam, textos, redirecciones, SSL/https, cache y actualizaciones menores.
// Meta (subir, bajar o mover presupuesto, duplicar un ganador) NO va acá: queda como propuesta y el departamento la
// ejecuta solo cada hora (services/pauta-optimiza-sola.ts), porque ahí se revalida con los números del día, hay topes
// por cliente y a las 72 h deshace lo que empeoró.
// Sigue esperando a una persona: todo lo que APAGA o DESHABILITA (pausar campañas, conjuntos o keywords, desactivar
// un plugin, sacarle el rol a un administrador) y lo que puede tirar una web entera o tocar el sistema (WordPress
// mayor, versión de PHP, cambios de código). Puro.

const PAUTA_SOLA = new Set(["add_negative_keywords", "add_keywords_google"]);
const WEB_SOLA = new Set(["quitar_spam", "reemplazar_texto", "crear_redireccion", "instalar_ssl", "forzar_https", "purgar_cache", "actualizar_plugins", "actualizar_temas"]);

export function seHaceSola(tool: string, params: Record<string, unknown>): boolean {
  if (PAUTA_SOLA.has(tool)) return true;
  if (tool === "proponer_cambio_web") {
    const accion = typeof params.accion === "string" ? params.accion : "";
    if (accion === "actualizar_wordpress") return params.soloMenor !== false;
    return WEB_SOLA.has(accion);
  }
  return false;
}
