import postgres from 'postgres';
const sql = postgres(process.env.DB_URL, { ssl: false, max: 3 });
const COMPANY = '00000000-0000-4000-8000-000000000001';

// 1. rutina semanal "Radar de nichos" para Carlos
const [carlos] = await sql`select id from agents where name like 'Carlos%'`;
const desc = `Cada semana, producí el RADAR DE NICHO: el informe accionable que el equipo ve en el panel de Nichos. Trabajá por TANDAS de 2-3 rubros por corrida (rotá hasta cubrir todos los rubros con clientes activos en el mes; guardá en tu memoria cuáles ya hiciste este ciclo).

Para CADA rubro de la tanda:

1. ANÁLISIS CRUZADO de nuestros clientes: lmtmGetNicheIntel(rubro) + lmtmGetClientContentMatrix de 2-3 clientes representativos. Resumí en 3-4 frases QUÉ está funcionando y qué no: en ORGÁNICO (formatos, ganchos, cadencia, quién del rubro lo hace mejor) y en PAUTA por separado (CTR/CPL reales vs benchmark, campañas ganadoras). Con números, pero la conclusión en criollo.

2. REFERENTES EXTERNOS (el corazón del pedido): buscá con el browser 2-4 cuentas TENDENCIA del rubro que NO sean clientes nuestros — de Buenos Aires, de otra provincia o de otro país (México, España, Brasil...). Fuentes: TikTok (búsqueda por rubro + Creative Center), Instagram (explorar hashtags del rubro), y la Ads Library de Meta para ver QUÉ PAUTAN. Para cada referente: nombre, @cuenta, plataforma, ubicación, qué hacen que funciona (orgánico y pauta), urlPerfil y urlEjemplo (link REAL a un post/reel/anuncio concreto — verificá que abra).

3. IDEAS CON REFERENCIA: 3-5 ideas concretas adaptables a nuestros clientes del rubro. Cada una: titulo + detalle (qué es, por qué funciona, cómo la adaptamos) + url del post/reel/anuncio de donde la sacaste + fuente. REGLA DURA: si la idea salió de redes porque funciona, el link es OBLIGATORIO (el sistema rechaza el guardado si citás una red sin url).

4. PLAN POR CLIENTE (para dónde ir, no datos): para CADA cliente activo del rubro, 2-3 movidas concretas cruzando su realidad (matriz de contenido, pauta, brain) con lo que viste en los referentes. Ej: "pasar de placas estáticas a reels de recorrido como hace X", "activar pauta de formulario con el ángulo Y", "replicar la serie de tips de Z adaptada a su voz de marca".

5. GUARDAR con lmtmSaveNicheReport(niche=slug canónico del rubro, analisisCruzado, referentes, ideas, planPorCliente). Un solo guardado por rubro (upsert semanal).

REGLAS: nada inventado — links reales verificados, números de nuestras tools. No interactúes con las cuentas externas. Si un rubro tiene 1 solo cliente, el análisis cruzado compara contra el benchmark y los referentes. Al cerrar el issue, comentá: rubros cubiertos, referentes encontrados y la idea más fuerte de la semana.`;

const exists = await sql`select id from routines where title = 'Radar de nichos (informe accionable)'`;
let routineId;
if (exists.length) {
  routineId = exists[0].id;
  await sql`update routines set description=${desc}, assignee_agent_id=${carlos.id}, updated_at=now() where id=${routineId}`;
  console.log('rutina actualizada:', routineId);
} else {
  const [r] = await sql`
    insert into routines (company_id, title, description, assignee_agent_id, priority, status, concurrency_policy, catch_up_policy)
    select company_id, 'Radar de nichos (informe accionable)', ${desc}, ${carlos.id}, priority, status, concurrency_policy, catch_up_policy
    from routines where id='a9f7537c-d5db-4031-b660-68f1b12142f1'
    returning id`;
  routineId = r.id;
  console.log('rutina creada:', routineId);
}

// 2. trigger semanal (miércoles 10am ART) clonando uno schedule existente
const trigCols = await sql`select column_name from information_schema.columns where table_name='routine_triggers' order by ordinal_position`;
console.log('trigger cols:', trigCols.map(c=>c.column_name).join(','));
const [sample] = await sql`select * from routine_triggers where kind='schedule' limit 1`;
if (!sample) { console.log('SIN TRIGGER SAMPLE'); }
else {
  const existsT = await sql`select id from routine_triggers where routine_id=${routineId}`;
  if (!existsT.length) {
    await sql`
      insert into routine_triggers (company_id, routine_id, kind, enabled, cron_expression, timezone, next_run_at)
      values (${COMPANY}, ${routineId}, 'schedule', true, '0 10 * * 3', ${sample.timezone || 'America/Argentina/Buenos_Aires'}, now() + interval '10 minutes')`;
    console.log('trigger creado: miércoles 10am ART (primer disparo en ~10 min para sembrar el panel)');
  } else {
    await sql`update routine_triggers set next_run_at = now() + interval '10 minutes', enabled=true where routine_id=${routineId}`;
    console.log('trigger existente re-armado para disparar en ~10 min');
  }
}

// 3. allowlist: lmtmSaveNicheReport + lmtmGetNicheIntel a los 14
const agents = await sql`select id, name, adapter_config from agents`;
for (const a of agents) {
  const cfg = a.adapter_config || {}; const env = cfg.env || {};
  let tools = env.PAPERCLIP_MCP_TOOLS || '';
  if (!tools) continue;
  let changed = false;
  for (const t of ['lmtmSaveNicheReport','lmtmGetNicheIntel','lmtmGetClientContentMatrix']) {
    if (!tools.includes(t)) { tools += ',' + t; changed = true; }
  }
  if (changed) { env.PAPERCLIP_MCP_TOOLS = tools; cfg.env = env; await sql`update agents set adapter_config=${cfg} where id=${a.id}`; }
}
console.log('allowlist ok');
await sql.end();
