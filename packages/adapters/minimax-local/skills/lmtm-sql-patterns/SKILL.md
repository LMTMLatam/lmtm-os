---
name: lmtm-sql-patterns
displayName: SQL patterns
description: Window functions, CTEs, anti-patterns, queries típicas de marketing analytics.
required: false
---

# SQL patterns para marketing analytics

## Window functions

Las 3 que más vas a usar:

### ROW_NUMBER() / RANK() / DENSE_RANK()

```sql
-- Top 3 creativos por cliente por gasto
WITH ranked AS (
  SELECT
    ad_id,
    client_id,
    spend,
    ROW_NUMBER() OVER (
      PARTITION BY client_id
      ORDER BY spend DESC
    ) AS rn
  FROM ad_performance_daily
)
SELECT * FROM ranked WHERE rn <= 3;
```

**Diferencia**:
- `ROW_NUMBER()` — siempre 1, 2, 3, 4, 5 (no empates)
- `RANK()` — 1, 2, 2, 4 (salta)
- `DENSE_RANK()` — 1, 2, 2, 3 (no salta)

### LAG() / LEAD()

```sql
-- Comparar día a día
SELECT
  date,
  client_id,
  spend,
  LAG(spend, 1) OVER (
    PARTITION BY client_id
    ORDER BY date
  ) AS spend_yesterday,
  spend - LAG(spend, 1) OVER (
    PARTITION BY client_id
    ORDER BY date
  ) AS spend_diff
FROM ad_spend_daily;
```

### SUM() / AVG() OVER (rows between)

```sql
-- Moving average 7 días
SELECT
  date,
  client_id,
  revenue,
  AVG(revenue) OVER (
    PARTITION BY client_id
    ORDER BY date
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS rev_ma7
FROM revenue_daily;
```

## CTEs (Common Table Expressions)

```sql
WITH
  -- 1. cálculo de first-touch attribution
  first_touch AS (
    SELECT
      user_id,
      campaign_id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY touch_at ASC
      ) AS rn
    FROM ad_touches
  ),
  -- 2. cálculo de last-touch
  last_touch AS (
    SELECT
      user_id,
      campaign_id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY touch_at DESC
      ) AS rn
    FROM ad_touches
  ),
  -- 3. join con conversions
  attributed AS (
    SELECT
      c.user_id,
      c.conversion_value,
      ft.campaign_id AS first_campaign,
      lt.campaign_id AS last_campaign
    FROM conversions c
    LEFT JOIN first_touch ft ON c.user_id = ft.user_id AND ft.rn = 1
    LEFT JOIN last_touch lt ON c.user_id = lt.user_id AND lt.rn = 1
  )
SELECT * FROM attributed;
```

**Reglas**:
- **Una CTE por transformación lógica**, no por query.
- **Naming claro**: `first_touch`, `last_touch`, `attributed`, `final_report`.
- **No** abusar: 5 CTEs anidadas = momento de temp table.

## Anti-patterns

### ❌ SELECT *

```sql
-- MAL
SELECT * FROM huge_table WHERE date = '2026-06-01';

-- BIEN
SELECT user_id, campaign_id, spend, impressions, clicks
FROM huge_table WHERE date = '2026-06-01';
```

### ❌ Función en columna indexada

```sql
-- MAL: mata el índice
WHERE DATE(created_at) = '2026-06-01';

-- BIEN: range query usa índice
WHERE created_at >= '2026-06-01'
  AND created_at <  '2026-06-02';
```

### ❌ NOT IN con subquery

```sql
-- MAL: si hay NULLs, el resultado es unexpectedly empty
WHERE user_id NOT IN (SELECT user_id FROM unsubscribed);

-- BIEN: NOT EXISTS
WHERE NOT EXISTS (
  SELECT 1 FROM unsubscribed u WHERE u.user_id = t.user_id
);
```

### ❌ OR en WHERE

```sql
-- MAL: rompe índices
WHERE country = 'AR' OR country = 'UY';

-- BIEN
WHERE country IN ('AR', 'UY');
```

### ❌ UNION cuando alcanza con UNION ALL

```sql
-- DISTINCT por defecto: lento
SELECT a FROM t1
UNION
SELECT a FROM t2;

-- Si no te importan duplicados
SELECT a FROM t1
UNION ALL
SELECT a FROM t2;
```

## Queries típicas de marketing

### Cohortes de retención

```sql
WITH cohorts AS (
  SELECT
    user_id,
    DATE_TRUNC('month', first_seen_at) AS cohort_month
  FROM users
),
activity AS (
  SELECT
    user_id,
    DATE_TRUNC('month', event_at) AS activity_month
  FROM events
)
SELECT
  c.cohort_month,
  a.activity_month,
  COUNT(DISTINCT c.user_id) AS users,
  EXTRACT(MONTH FROM AGE(a.activity_month, c.cohort_month)) AS months_since
FROM cohorts c
JOIN activity a ON c.user_id = a.user_id
GROUP BY 1, 2
ORDER BY 1, 2;
```

### Funnel por step

```sql
WITH events_by_step AS (
  SELECT
    user_id,
    MAX(CASE WHEN step = 'visit'   THEN 1 ELSE 0 END) AS s1_visit,
    MAX(CASE WHEN step = 'signup'  THEN 1 ELSE 0 END) AS s2_signup,
    MAX(CASE WHEN step = 'active'  THEN 1 ELSE 0 END) AS s3_active,
    MAX(CASE WHEN step = 'paid'    THEN 1 ELSE 0 END) AS s4_paid
  FROM user_events
  GROUP BY user_id
)
SELECT
  SUM(s1_visit)  AS visits,
  SUM(s2_signup) AS signups,
  SUM(s3_active) AS active,
  SUM(s4_paid)   AS paid,
  -- conversion rates step-by-step
  SUM(s2_signup)::float / NULLIF(SUM(s1_visit), 0)  AS c_visit_signup,
  SUM(s3_active)::float / NULLIF(SUM(s2_signup), 0) AS c_signup_active,
  SUM(s4_paid)::float   / NULLIF(SUM(s3_active), 0) AS c_active_paid
FROM events_by_step;
```

### Ad spend vs revenue (daily)

```sql
SELECT
  s.date,
  s.client_id,
  s.platform,
  s.spend,
  COALESCE(r.revenue, 0) AS revenue,
  COALESCE(r.revenue, 0) / NULLIF(s.spend, 0) AS roas
FROM ad_spend_daily s
LEFT JOIN revenue_daily r
  ON s.date = r.date
  AND s.client_id = r.client_id
  AND s.platform = r.platform
WHERE s.date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY s.date DESC;
```

## Performance tips

- **EXPLAIN ANALYZE** toda query que tarde > 1s.
- **Filtrá primero** (WHERE), agregá después.
- **Indexes compuestos** en el orden de (equality, range, sort).
  ```sql
  CREATE INDEX idx_perf
  ON ad_performance_daily (client_id, date, platform);
  -- filtra por client_id (=), después date (range), ordenado por platform
  ```
- **Materialized views** para reports que se calculan cada hora
  y se consultan 1000 veces al día.
- **NUNCA** hacer JOIN entre millones de filas sin índice. Si te
  pasa, está mal el modelo de datos.
