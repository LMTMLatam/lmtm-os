import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const r = await pool.query('SELECT id, name, slug, planilla_source, planilla_external_id, clickup_folder_id, clickup_list_redes_id, clickup_list_video_id, clickup_list_enfoque_tecnico_id FROM clients ORDER BY name');
  for (const row of r.rows) console.log(JSON.stringify(row));
} finally {
  await pool.end();
}
