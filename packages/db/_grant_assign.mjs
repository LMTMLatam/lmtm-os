// TEMP — grant tasks:assign a Pablo (PM) y Luna (CMO). Delete after use.
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });
try {
  const agents = await sql`select id, name, company_id from agents where name ilike 'pablo%' or name ilike 'luna%'`;
  for (const a of agents) {
    const [m] = await sql`select id, status from company_memberships where company_id = ${a.company_id} and principal_type = 'agent' and principal_id = ${a.id}`;
    console.log(a.name, "| membership:", m ? m.status : "NO TIENE");
    if (!m) {
      await sql`insert into company_memberships (company_id, principal_type, principal_id, status, membership_role)
                values (${a.company_id}, 'agent', ${a.id}, 'active', 'member')
                on conflict do nothing`;
      console.log("  membership creada");
    }
    await sql`insert into principal_permission_grants (company_id, principal_type, principal_id, permission_key, granted_by_user_id)
              values (${a.company_id}, 'agent', ${a.id}, 'tasks:assign', 'lmtm-admin-0001')
              on conflict (company_id, principal_type, principal_id, permission_key) do nothing`;
    console.log("  grant tasks:assign OK");
  }
} finally { await sql.end(); }
