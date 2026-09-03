import postgres from 'postgres';
const sql = postgres(process.env.DB_URL, { ssl: false, max: 3 });

// 1. Retag de tendencias existentes: alias → canónico, 'transversal' fuera,
//    y las universales de IA/tools → agencia-marketing.
const ALIAS = { hoteleria: 'turismo-hoteleria', turismo: 'turismo-hoteleria', retail: 'retail-consumo', consumo: 'retail-consumo', inmobiliario: 'inmobiliaria', automotriz: 'automotor-autopartes', autopartes: 'automotor-autopartes', construccion: 'construccion-materiales', materiales: 'construccion-materiales', marketing: 'agencia-marketing', eventos: 'entretenimiento-eventos', finanzas: 'finanzas-servicios', b2b: 'industria-b2b', industria: 'industria-b2b' };
const rows = await sql`select id, title, summary, niches from trends where created_at > now() - interval '30 days'`;
let retagged = 0, aiTagged = 0;
const AI_RE = /\b(ia|ai|chatgpt|claude|gemini|openai|anthropic|copilot|bing|cloudflare|product ?hunt|saas|seo|llm|creador|creator)\b/i;
for (const t of rows) {
  const orig = t.niches || [];
  let n = orig.map((x) => ALIAS[String(x).toLowerCase()] ?? String(x).toLowerCase()).filter((x) => x !== 'transversal' && x !== 'general');
  n = [...new Set(n)];
  if (n.length === 0 && AI_RE.test(`${t.title} ${t.summary ?? ''}`)) { n = ['agencia-marketing']; aiTagged++; }
  if (JSON.stringify(n) !== JSON.stringify(orig)) {
    await sql`update trends set niches=${JSON.stringify(n)}::jsonb where id=${t.id}`;
    retagged++;
  }
}
console.log(`tendencias retageadas: ${retagged} (de las cuales ${aiTagged} universales-IA → agencia-marketing)`);

// 2. Rutina "Tendencias diarias": reescribir instrucciones con puntería por rubro
const RUBROS = ['inmobiliaria','turismo-hoteleria','industria-b2b','automotor-autopartes','construccion-materiales','entretenimiento-eventos','agencia-marketing','retail-consumo','desarrollador','tecnologia','finanzas-servicios','deporte','loteos','gomeria','insumo-medico','insumo-industrial','servicios-profesionales','empresa'];
const tendDesc = `Todos los días a la mañana, miná tendencias con potencial de contenido y cargalas al panel. NO mandes WhatsApp ni notificaciones: el destino es SOLO el panel (lmtmSaveTrend).

PRIORIDAD 1 — TENDENCIAS POR RUBRO (el corazón de la rutina): elegí cada día 4-6 rubros de la lista canónica (rotá para cubrir todos en la semana) y buscá para cada uno 1-2 tendencias ESPECÍFICAS DEL SECTOR: noticias del rubro en Argentina (mercado inmobiliario, turismo, construcción, autopartes...), datos/movimientos que den para un posteo, y formatos/ángulos que estén rindiendo en ese rubro en IG/TikTok. Fuentes: medios del sector (ej. Reporte Inmobiliario, La Nación Propiedades, Hostelería y Turismo, InfoNegocios, medios locales de Rosario/Santa Fe), búsquedas web del rubro, cuentas grandes del sector.

RUBROS CANÓNICOS (usá EXACTAMENTE estos slugs en niches — el panel de cada cliente filtra por su rubro y cualquier otro slug NO le llega a nadie): ${RUBROS.join(', ')}.

PRIORIDAD 2 — plataforma y marketing (acotado): máximo 2 por día de novedades de plataformas/ads/IA. Cambios de PLATAFORMA que afectan a todos (algoritmo de IG, features de Meta/TikTok/WhatsApp) → niches=[]. Noticias de IA/herramientas/marketing → niches=['agencia-marketing'] SIEMPRE (el sistema rechaza guardarlas como universales).

PASOS:
1. Barré fuentes del rubro primero, plataformas después (lo NUEVO de 24-48hs).
2. Filtrá por lo que sirve para CONTENIDO de clientes PYME argentinos.
3. Guardá con lmtmSaveTrend las 6-12 mejores: title corto, url, source, summary de 1-2 frases (qué es y QUÉ POSTEO saldría), tag honesto (potencial-de-gancho solo si da para un posteo concreto), niches con los slugs canónicos.
4. No dupliques (si ya está de días anteriores, salteala).
5. Cerrá el issue con 2 líneas: cuántas guardaste, qué rubros cubriste y la más fuerte del día.`;
await sql`update routines set description=${tendDesc}, updated_at=now() where id='42f6fa76-e05b-4bcf-aa29-8348dc10f9c0'`;
console.log('rutina Tendencias actualizada ✓');

// 3. Rutina "Rastreador de competencia": + cobertura de clientes sin competidores + análisis de rubro
const compDesc = `Cada domingo, ampliá la cobertura de competidores y cosechá ganchos de la competencia para el Baúl de Ganchos.

FASE 0 — COBERTURA (nuevo, prioridad): lmtmListClients y detectá clientes activos SIN competidores cargados (lmtmGetClientCompetitors vacío). Elegí hasta 5 por domingo (rotá hasta cubrir todos) y para cada uno descubrí 3-5 competidores REALES y EXTERNOS del mismo rubro y zona (browser + búsqueda web + IG; NUNCA otro cliente de la agencia — el sistema lo rechaza). Cargalos con lmtmAddClientCompetitor (name + igHandle/fbPageUrl/website + notes con por qué es relevante).

FASE 1 — GANCHOS (como siempre): para cada cliente con competidores, entrá a los perfiles de IG y mirá los reels recientes. De los 2-3 con más reproducciones de la última semana, transcribí el GANCHO (primera línea hablada o texto en pantalla de los primeros 3 seg) y guardalo con lmtmSaveHook (text, clientId, sourceKind=competidor, sourceRef=@cuenta+URL, format=reel, views). Si sirve a todo el rubro: sin clientId, con niche=rubro canónico. Calidad sobre cantidad (3-5 buenos por cliente). Antes de guardar, lmtmSearchHooks para no duplicar.

FASE 2 — LECTURA DEL RUBRO (nuevo): por cada rubro que hayas tocado, si detectaste un patrón claro entre competidores (un formato que todos están usando, un ángulo que rinde, una oferta que se repite), guardalo como tendencia de CONTENIDO con lmtmSaveTrend: title tipo "Los competidores de <rubro> están ganando con <formato/ángulo>", summary con el porqué y qué posteo saldría, niches=[rubro canónico], source="analisis-competencia".

REGLAS: nada de inventar vistas ni transcripciones — si un perfil está privado/bloqueado, decilo y seguí. No interactúes con las cuentas (no like, no follow, no comentar). Al cerrar, comentá el resumen: competidores nuevos cargados (y para qué clientes), ganchos guardados, y la lectura de rubro más fuerte.`;
await sql`update routines set description=${compDesc}, updated_at=now() where id='a9f7537c-d5db-4031-b660-68f1b12142f1'`;
console.log('rutina Rastreador actualizada ✓');

// 4. allowlist: agregar lmtmAddClientCompetitor a los 14
const agents = await sql`select id, name, adapter_config from agents`;
for (const a of agents) {
  const cfg = a.adapter_config || {}; const env = cfg.env || {};
  const tools = env.PAPERCLIP_MCP_TOOLS || '';
  if (!tools || tools.includes('lmtmAddClientCompetitor')) continue;
  env.PAPERCLIP_MCP_TOOLS = tools + ',lmtmAddClientCompetitor';
  cfg.env = env;
  await sql`update agents set adapter_config=${cfg} where id=${a.id}`;
}
console.log('allowlist actualizada en los 14 ✓');

await sql.end();
