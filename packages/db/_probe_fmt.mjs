// TEMP — why adsFormats:0? Count qualifying creatives per niche+format. Delete after use.
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });
try {
  const rows = await sql`
    with m as (
      select ad_id, sum(impressions) imp, sum(clicks) clk
      from ads_insights
      where date >= (now() - interval '30 days')::date and ad_id is not null
      group by ad_id
    )
    select c.industry as niche,
      case when (cr.raw->'creative'->>'video_id') is not null or (cr.raw->>'video_id') is not null then 'video'
           when coalesce(cr.raw->'creative'->>'image_url', cr.raw->'creative'->>'thumbnail_url', cr.raw->>'image_url', cr.raw->>'picture', cr.raw->>'thumbnail_url') is not null then 'imagen'
           else 'otro' end as fmt,
      count(*) n, sum(m.imp) imp
    from ads_creatives cr
    join m on m.ad_id = cr.id
    join clients c on c.id = cr.client_id and c.status = 'active' and c.industry is not null
    where m.imp >= 500
    group by 1, 2 order by 1, 4 desc`;
  for (const r of rows) console.log(r.niche, r.fmt, `n=${r.n}`, `imp=${r.imp}`);
  if (!rows.length) console.log("(sin creatives que califiquen — revisar joins)");
  const [tot] = await sql`select count(*) n from ads_creatives`;
  const [ins] = await sql`select count(distinct ad_id) n from ads_insights where ad_id is not null`;
  console.log("total creatives:", tot.n, "| ad_ids con insights:", ins.n);
} finally { await sql.end(); }
