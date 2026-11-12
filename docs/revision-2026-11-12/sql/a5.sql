with x as (
 select split_part(a.name,' ',1) ag, r.created_at::timestamp(0) t, coalesce(i.identifier,'-') idf,
  regexp_replace(regexp_replace(r.stdout_excerpt, E'[\\n\\r\\t]+', ' ', 'g'), '://[^@ /]+:[^@ ]+@', '://<CRED>@', 'g') s
 from heartbeat_runs r join agents a on a.id=r.agent_id left join issues i on i.id::text=r.context_snapshot->>'issueId'
 where r.created_at > now()-interval '6 days')
select ag, t, idf, p.pat, substring(s from '.{0,240}(?:' || p.pat || ').{0,240}') ctx
from x, (values ('psql |DATABASE_URL'),('/proc/[0-9a-z]+/environ'),('82\.29\.56\.162'),('Permission denied'),('claude-mcp\.json|printenv')) p(pat)
where s ~* p.pat order by t desc limit 14;
