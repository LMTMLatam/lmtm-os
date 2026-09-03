import postgres from 'postgres';
const sql = postgres(process.env.DB_URL, { ssl: false, max: 3 });

// 1. FLOTA: día completo por agente
const fleet = await sql`
  select a.name,
         count(*) filter (where hr.status='succeeded') as ok,
         count(*) filter (where hr.status='failed') as fail,
         count(*) filter (where hr.status='timed_out') as tout,
         count(*) filter (where hr.status in ('running','queued')) as activos
  from heartbeat_runs hr join agents a on a.id=hr.agent_id
  where hr.created_at > now() - interval '26 hours'
  group by a.name order by ok desc`;
console.log('== FLOTA 14h ==');
let ok=0, fail=0, tout=0;
for (const f of fleet) { ok+=+f.ok; fail+=+f.fail; tout+=+f.tout; console.log(`${f.name}: ok=${f.ok} fail=${f.fail} tout=${f.tout} activos=${f.activos}`); }
console.log(`TOTAL: ok=${ok} fail=${fail} timeout=${tout}`);

// errores del día agrupados
const errs = await sql`
  select error_code, count(*), max(started_at) as last from heartbeat_runs
  where status='failed' and created_at > now() - interval '26 hours'
  group by error_code order by count desc`;
console.log('errores:', JSON.stringify(errs.map(e=>({c:e.error_code,n:e.count}))));

// 2. ISSUES: movimiento del día
const moves = await sql`
  select status, count(*) from issues where updated_at > now() - interval '26 hours' group by status order by count desc`;
console.log('\n== ISSUES TOCADOS 14h ==', JSON.stringify(moves));
const doneToday = await sql`
  select i.identifier, i.title, a.name as assignee from issues i left join agents a on a.id=i.assignee_agent_id
  where i.status='done' and i.updated_at > now() - interval '26 hours'
    and i.title not ilike '%Destilar historia%'
  order by i.updated_at desc limit 20`;
console.log('DONE hoy (sin destilaciones):', doneToday.length);
for (const d of doneToday) console.log(`  ${d.identifier} (${(d.assignee||'?').split(' ')[0]}) ${d.title.slice(0,75)}`);

// nuevos issues creados por agentes hoy
const created = await sql`
  select i.identifier, i.status, i.title, a.name as creator from issues i left join agents a on a.id=i.created_by_agent_id
  where i.created_at > now() - interval '26 hours' and i.created_by_agent_id is not null
  order by i.created_at desc limit 20`;
console.log('\nCREADOS por agentes hoy:', created.length);
for (const c of created) console.log(`  ${c.identifier} [${c.status}] (${(c.creator||'?').split(' ')[0]}) ${c.title.slice(0,75)}`);

// recoveries nuevos (ruido)
const recov = await sql`select count(*) from issues where title like 'Recover %' and created_at > now() - interval '26 hours'`;
console.log('recoveries nuevos:', recov[0].count);

// blocked ahora vs esta mañana (75)
const [bl] = await sql`select count(*) from issues where status='blocked'`;
console.log('blocked ahora:', bl.count, '(eran 75 esta mañana)');

// 3. maestros
for (const ident of ['LMTM-2285','LMTM-1034','LMTM-2287','LMTM-2288','LMTM-2289']) {
  const [i] = await sql`select identifier, status, updated_at from issues where identifier=${ident}`;
  if (i) console.log(`${i.identifier}: ${i.status}`);
}

// 4. PIPELINE
const syncs = await sql`
  select status, count(*), max(completed_at) as last from sync_logs
  where job_name='ads-autosync' and started_at > now() - interval '26 hours' group by status`;
console.log('\n== ADS 14h ==', JSON.stringify(syncs.map(s=>({s:s.status,n:s.count}))));
const org = await sql`select max(created_time) as last_post, max(synced_at) as last_sync from organic_posts`;
console.log('ORGANIC:', JSON.stringify(org));

// 5. skill playbook: la usó alguien? (buscar en transcripts es caro; ver si hay memorias/comentarios que la citen)
const skillRef = await sql`
  select count(*) from issue_comments where body ilike '%playbook-produccion%' and created_at > now() - interval '26 hours'`;
console.log('\nmenciones a playbook-produccion en comentarios:', skillRef[0].count);

// 6. memorias nuevas del día (uso de brains)
const mems = await sql`
  select count(*), count(distinct client_id) as clientes from client_memory where created_at > now() - interval '26 hours'`;
console.log('memorias nuevas 14h:', JSON.stringify(mems));

// 7. feedback super redes
const fb = await sql`select count(*) from client_memory where key='super-redes-feedback' and updated_at > now() - interval '26 hours'`;
console.log('feedback destilado 14h:', fb[0].count, 'clientes');

await sql.end();
