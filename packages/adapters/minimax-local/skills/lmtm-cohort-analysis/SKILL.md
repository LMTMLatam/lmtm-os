---
name: lmtm-cohort-analysis
displayName: Cohort analysis
description: Cómo construir cohortes, leer retention curves, calcular LTV por cohorte.
required: false
---

# Cohort analysis

## Qué es una cohorte

Un **grupo de usuarios que comparten una característica en el
momento cero** (adquisición). Después seguís su comportamiento en el
tiempo.

Tipos comunes:
- **Por fecha de signup** (la más común)
- **Por fuente de adquisición** (canal que los trajo)
- **Por producto que compraron primero**
- **Por país/región**

## Retention matrix (la tabla core)

```
                  Mes 0  Mes 1  Mes 2  Mes 3  Mes 4
Cohort 2026-01    100%   42%    31%    25%    22%
Cohort 2026-02    100%   45%    33%    26%    ...
Cohort 2026-03    100%   48%    35%    ...
Cohort 2026-04    100%   44%    ...
Cohort 2026-05    100%   ...
```

**Cómo leerla**:
- **Columna Mes 0** siempre 100% (es la línea base).
- **Mes 1+** muestra el % de la cohorte original que sigue activo.
- **La curva se aplana** = encontraste el "engagement floor" (cuánta
  gente queda enganchada naturalmente).
- **Comparar cohortes verticalmente**: si Mes 1 sube de 42% → 48% en
  cohortes más nuevas, **algo cambió para bien** (onboarding, feature,
  targeting).

## SQL básico (PostgreSQL)

```sql
WITH cohorts AS (
  SELECT
    user_id,
    DATE_TRUNC('month', created_at) AS cohort_month
  FROM users
),
user_active_months AS (
  SELECT
    c.cohort_month,
    c.user_id,
    DATE_TRUNC('month', e.event_at) AS active_month
  FROM cohorts c
  LEFT JOIN events e ON c.user_id = e.user_id
  GROUP BY 1, 2, 3
),
cohort_size AS (
  SELECT cohort_month, COUNT(DISTINCT user_id) AS size
  FROM cohorts
  GROUP BY 1
)
SELECT
  a.cohort_month,
  EXTRACT(MONTH FROM AGE(a.active_month, a.cohort_month))::int
    AS months_since,
  COUNT(DISTINCT a.user_id) AS active_users,
  s.size AS cohort_size,
  ROUND(100.0 * COUNT(DISTINCT a.user_id) / s.size, 1)
    AS retention_pct
FROM user_active_months a
JOIN cohort_size s ON a.cohort_month = s.cohort_month
GROUP BY 1, 2, s.size
ORDER BY 1, 2;
```

## LTV (Lifetime Value) por cohorte

LTV = revenue acumulado / tamaño cohorte

```sql
WITH cohorts AS (
  SELECT
    user_id,
    DATE_TRUNC('month', created_at) AS cohort_month
  FROM users
),
revenue_by_user_month AS (
  SELECT
    c.cohort_month,
    c.user_id,
    DATE_TRUNC('month', o.created_at) AS order_month,
    o.total_amount
  FROM cohorts c
  JOIN orders o ON c.user_id = o.user_id
)
SELECT
  cohort_month,
  EXTRACT(MONTH FROM AGE(order_month, cohort_month))::int
    AS months_since,
  SUM(total_amount) AS revenue,
  COUNT(DISTINCT user_id) AS paying_users,
  -- LTV acumulado hasta ese mes
  SUM(SUM(total_amount)) OVER (
    PARTITION BY cohort_month
    ORDER BY EXTRACT(MONTH FROM AGE(order_month, cohort_month))
  ) / MAX(cumulative_cohort_size) AS cum_ltv
FROM revenue_by_user_month
GROUP BY 1, 2
ORDER BY 1, 2;
```

## Power user curve

Otro ángulo: **no todos los usuarios son iguales**. El 20% genera el
80% del revenue.

```sql
WITH user_revenue AS (
  SELECT
    user_id,
    SUM(total_amount) AS lifetime_revenue
  FROM orders
  GROUP BY user_id
),
ranked AS (
  SELECT
    user_id,
    lifetime_revenue,
    NTILE(5) OVER (ORDER BY lifetime_revenue DESC) AS quintile
  FROM user_revenue
)
SELECT
  quintile,
  COUNT(*) AS users,
  SUM(lifetime_revenue) AS total_revenue,
  AVG(lifetime_revenue) AS avg_ltv
FROM ranked
GROUP BY 1
ORDER BY 1;
```

**Lo que esperás ver**:
- Quintil 1 (top 20%) → ~60-80% del revenue
- Quintil 5 (bottom 20%) → ~2-5% del revenue

**Acción**: identificá el quintil 1, hacé que el equipo de
  producto/CRM los cuide, y buscá más usuarios con esas
  características.

## Retention vs revenue

A veces un usuario está "activo" pero no paga. La retención real es
**paying retention**.

```sql
-- paying retention por cohorte
WITH cohorts AS (...),
paying_users AS (
  SELECT DISTINCT user_id, DATE_TRUNC('month', first_payment_at) AS first_pay_month
  FROM orders
)
SELECT
  c.cohort_month,
  months_since,
  COUNT(DISTINCT p.user_id) AS still_paying,
  COUNT(DISTINCT c.user_id) AS cohort_size
FROM cohorts c
LEFT JOIN ...
```

## Patrones de curva

- **Smile curve** (curva plana que sube): el producto mejora con el
  tiempo (network effects, hábitos). Buen signo.
- **Decay curve** (baja rápido y se aplana): hay un core engaged
  que se queda, el resto churned. Lo normal para SaaS B2B.
- **Line down to zero**: el producto no tiene engagement durable.
  Algo está mal.
- **Step-downs** (caída escalonada): hay eventos de churn predecibles
  (ej. después de la prueba, después de la primera factura).

## Cuándo importa

- **Subscription products** (SaaS, streaming, memberships): siempre.
- **E-commerce** con repeat purchase: en cohorts de "buyers", no
  de "visitors".
- **Marketplace**: doble cohorte (buyers + sellers) y cruzalas.
- **Apps móviles**: D1, D7, D30 retention son la métrica que
  miran los inversores.
- **Lead gen / agency**: reemplazá "retention" por "lifecycle stage
  progression" (lead → MQL → SQL → customer).

## Anti-patterns

- **No** promedies cohorts (perdés el detalle).
- **No** mires cohorts de < 30 días (todavía no estabilizaron).
- **No** confundas "user active" con "user paying".
- **Sí** compará cohortes del mismo tamaño de mercado (Q4 ≠ Q1).
