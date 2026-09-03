import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require", prepare: false });
const [a] = await sql`select id, adapter_config from agents where name ilike 'sergio%'`;
const cfg = a.adapter_config;
cfg.cwd = "/tmp";
cfg.quiet = false; // -Q silencia todo hasta el final → el watchdog de 300s sin output lo mataría
await sql`update agents set adapter_config = ${cfg} where id = ${a.id}`;
console.log("sergio: cwd=/tmp, quiet=false");
await sql.end();
