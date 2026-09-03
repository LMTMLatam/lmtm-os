import postgres from 'postgres';
import { createHash, randomBytes } from 'crypto';
const sql = postgres(process.env.DB_URL, { ssl: false, max: 3 });
const COMPANY = '00000000-0000-4000-8000-000000000001';
const API = 'https://lmtm-os-production.up.railway.app/api';

// lecciones de equipo
const lessons = [
  { key: 'playbook-produccion', pattern: 'Al producir GUIONES de video, COPYS, voz en off, piezas visuales IA o briefs UGC: cargar la skill lmtm-playbook-produccion — tiene los formatos canónicos del equipo destilados de su historia real de trabajo (652 conversaciones, may25-ene26): estructura de guion (idea general → hook visual+narrativo → tomas → cierre), copy inmobiliario, SSML/ElevenLabs, prompts Veo/Kling en inglés sin negativos, briefs de atletas. Producir con esos formatos desde el primer intento.', evidence: 'Minería del corpus ChatGPT sin-cliente 15/07: los mismos formatos y correcciones se repiten en decenas de conversaciones del equipo.' },
  { key: 'copy-con-referencia', pattern: 'NUNCA escribir un copy o guion de cliente sin una pieza de REFERENCIA de ese cliente: el equipo siempre trabaja clonando estructura y tono de un ejemplo previo ("con una estructura similar a esta"). Buscarla en el brain (memorias voz-de-marca*, briefs-recurrentes*) o pedirla en el issue antes de producir. Un copy sin referencia sale genérico y lo devuelven.', evidence: 'Minería corpus ChatGPT 15/07: el patrón "te paso una referencia y adaptás" aparece en la gran mayoría de los pedidos de copy del equipo.' },
];
for (const l of lessons) {
  const exists = await sql`select 1 from learnings where scope='team' and scope_key=${l.key}`;
  if (exists.length) { console.log('ya existe:', l.key); continue; }
  await sql`insert into learnings (company_id, scope, scope_key, pattern, evidence, confidence, occurrences, last_seen_at)
    values (${COMPANY}, 'team', ${l.key}, ${l.pattern}, ${l.evidence}, 0.9, 1, now())`;
  console.log('lección plantada:', l.key);
}

// features al backlog
const token = 'brd_' + randomBytes(24).toString('hex');
const hash = createHash('sha256').update(token).digest('hex');
const [user] = await sql`select user_id from instance_user_roles limit 1`;
await sql`insert into board_api_keys (user_id, name, key_hash, expires_at) values (${user.user_id}, 'tmp-mine-features', ${hash}, now() + interval '1 hour')`;

const features = [
  { title: '[FEATURE minada del corpus] Efemérides 2026 por rubro → calendario de contenido',
    description: `**Origen**: el 30/12/2025 el equipo le pidió a ChatGPT agrupar TODAS las efemérides argentinas 2026 por rubro (inmobiliarias/constructoras, materiales, logística, hoteles, suplementos deportivos, estética) para armar contenido de redes por grupo de clientes.\n\n**Propuesta**: precargar ese calendario de efemérides por rubro en LMTM-OS (la clasificación por rubro de los clientes YA existe en la DB) y que los agentes de contenido propongan piezas con 2-3 semanas de anticipación por cliente según su rubro. Regla vigente: efeméride vencida se cancela, no se arrastra.\n\n**Valor**: es un workflow que el equipo ya hacía a mano; automatizado evita los 43 issues zombie de "Día de la Independencia" que limpiamos el 15/07 (la planificación llegaría a tiempo).\n\nDecisión del usuario: aprobar y definir alcance.` },
  { title: '[FEATURE minada del corpus] Guion aprobado → SSML de ElevenLabs automático',
    description: `**Origen**: decenas de conversaciones del equipo convirtiendo guiones a SSML para ElevenLabs a mano (énfasis, pausas, alargues, corrección de pronunciaciones — "namba" por "no", acentos que se van a mexicano — y versiones en portugués para Brasil).\n\n**Propuesta**: cuando una pieza de video con voz en off queda aprobada en el flujo de contenido, generar automáticamente el SSML listo para pegar en ElevenLabs (con las reglas del equipo: énfasis marcados, fonética corregida, montos/nombres adaptados si es para Brasil). Podría ser un botón en el composer o parte del entregable del agente.\n\n**Valor**: paso manual repetitivo que hoy consume tiempo del equipo en cada video.\n\nDecisión del usuario: aprobar y definir alcance.` },
  { title: '[FEATURE minada del corpus] Prompt-builder de video/imagen IA (Veo/Kling)',
    description: `**Origen**: el equipo arma prompts para Veo 3 / Kling 2.1 / Sora / Envato constantemente, siempre con las mismas reglas aprendidas: prompt en inglés, SIN prompt negativo, generar first frame desde la foto real, poco movimiento, movimientos de cámara específicos (zoom out leve, traveling contrapicado, drone alejándose).\n\n**Propuesta**: herramienta/tool de agente que reciba la foto + el movimiento deseado + el concepto y devuelva el prompt EN listo (y el first frame si aplica), codificando esas reglas. Integrable al flujo Freepik/Drive del roadmap de contenido automático.\n\n**Valor**: estandariza un know-how que hoy vive en la cabeza del equipo; los agentes podrían proponer piezas de video IA correctas de una.\n\nDecisión del usuario: aprobar y definir alcance.` },
];
for (const f of features) {
  const r = await fetch(`${API}/companies/${COMPANY}/issues`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: f.title, description: f.description, status: 'backlog', priority: 'medium' }),
  });
  const b = await r.json().catch(()=>({}));
  console.log('feature:', r.status, b.identifier || JSON.stringify(b).slice(0,120));
}
await sql`delete from board_api_keys where key_hash=${hash}`;
console.log('key revocada');
await sql.end();
