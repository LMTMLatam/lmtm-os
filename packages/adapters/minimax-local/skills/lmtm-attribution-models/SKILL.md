---
name: lmtm-attribution-models
displayName: Attribution models
description: Last-click, first-click, linear, time-decay, position-based, data-driven. Cuándo usar cada uno.
required: false
---

# Attribution models

## El problema

Un usuario vio 5 ads antes de comprar. ¿Cuál le "asignás" la venta?
**Eso es attribution**. Cada modelo responde distinto y ninguno es
objetivamente correcto.

## Los 6 modelos principales

### 1. Last-click (last-touch)

100% del crédito al **último touchpoint** antes de la conversión.

```sql
-- simple
SELECT
  last_touch.campaign_id,
  COUNT(DISTINCT conversion_id) AS conversions
FROM conversions
JOIN last_touch ON ...
GROUP BY 1;
```

**Pros**: simple, fácil de explicar al cliente.
**Cons**: castiga a top-of-funnel y a brand search. Favorece a
brand o a retargeting de carrito.
**Cuándo**: cuando el cliente quiere ver qué **cerró** la venta
(corto plazo, performance pura).
**Default de Google Analytics (sin DDA)**.

### 2. First-click (first-touch)

100% al **primer touchpoint**.

**Pros**: útil para brand awareness y entender el "origen".
**Cons**: ignora todo lo que pasó en el medio, lo que más impacta
performance.
**Cuándo**: si vendes algo con un ciclo de venta largo (ej. B2B
enterprise, educación, real estate) y querés entender qué canal
arranca la relación.

### 3. Linear

Reparte el crédito **parejo** entre todos los touchpoints.

```sql
SELECT
  t.campaign_id,
  1.0 / COUNT(*) OVER (PARTITION BY t.conversion_id) AS fractional_credit
FROM touches t
```

**Pros**: justo en el sentido más básico.
**Cons**: trata igual un ad de TV que un retargeting de carrito.
Irreal.
**Cuándo**: análisis de funnel, entender el journey completo.

### 4. Time-decay

Más crédito a los touchpoints **más cercanos** a la conversión.
Típicamente exponencial (1/2 al de hace 1 día, 1/4 al de hace 2,
etc.).

**Pros**: refleja cómo los humanos decidimos (más influido por
lo reciente).
**Cons**: las fórmulas son arbitrarias (¿7 días de half-life? ¿30?).
**Cuándo**: ciclos de venta cortos (e-commerce, suscripción mensual).

### 5. Position-based (U-shaped)

**40% al primer touch, 40% al último, 20% al medio**.

**Pros**: balanceado, reconoce la importancia de descubrir y
cerrar.
**Cons**: el 20% del medio sigue siendo arbitrario.
**Cuándo**: cuando el journey tiene inicio y cierre claros.

### 6. Data-Driven Attribution (DDA)

**Algoritmico**: usa machine learning para asignar crédito
según qué touchpoints tienen más correlación con conversión, controlando
por confounding.

```sql
-- no se calcula a mano, lo da la plataforma (Meta DDA, Google DDA, Adobe)
-- ejemplo de output: "Meta impression contributed 0.32, Google click 0.51, email 0.17"
```

**Pros**: el más realista en attribution de performance.
**Cons**: caja negra, requiere volumen de datos, no todos los
canales lo tienen.
**Cuándo**: **el default moderno**. Si tu presupuesto es > USD
10k/mes en ads, **usá DDA**.

## Cuándo usar cada uno (resumen)

| Modelo | Mejor para | Ciclos | Cliente tipo |
|--------|------------|--------|--------------|
| Last-click | Performance corta, retargeting | < 7 días | E-commerce |
| First-click | Brand awareness, B2B | > 30 días | B2B enterprise |
| Linear | Análisis exploratorio | cualquiera | - |
| Time-decay | Subscription corta | 7-30 días | SaaS, D2C |
| Position-based | Funnel clásico | 14-60 días | Lead gen |
| **DDA** | **Default 2026** | cualquiera | **todos** |

## Multi-touch attribution (MTA) vs Marketing Mix Modeling (MMM)

**MTA** (todo lo de arriba) usa los touchpoints individuales.
**MMM** es un modelo estadístico top-down que mira **correlaciones
entre gasto en canal y ventas totales en el tiempo**.

| | MTA | MMM |
|---|---|---|
| Granularidad | User-level | Aggregate |
| Requiere tracking detallado | Sí | No |
| Funciona con iOS 14.5+ | Limitado | Sí |
| Funciona con TV / OOH | No | Sí |
| Setup | Easy (pixel + SQL) | Hard (data scientist) |
| Costo | Bajo | Alto (USD 20k-200k/año) |
| Para qué sirve | Optimizar digital mix | Optimizar budget total (digital + offline) |

**Conclusión**: combiná ambos. MTA para digital in-channel
optimization. MMM para budget allocation cross-channel.

## Implementación práctica

### Setup mínimo

1. **Tracking unificado**: cada touch (impression, click, view,
   email open) tiene un `touch_id`, `user_id`, `campaign_id`,
   `touch_at`.
2. **Conversion tracking**: cada conversión tiene un `conversion_id`,
   `user_id`, `value`, `converted_at`.
3. **Join**: conversions JOIN touches ON user_id WHERE
   touch_at < converted_at.

### Schema ejemplo

```sql
-- touches
CREATE TABLE ad_touches (
  touch_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_id UUID NOT NULL,
  platform TEXT NOT NULL,
  touch_type TEXT,  -- impression, click, view
  touch_at TIMESTAMPTZ NOT NULL
);

-- conversions
CREATE TABLE conversions (
  conversion_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  value NUMERIC(10,2),
  converted_at TIMESTAMPTZ NOT NULL
);
```

### Query para last-click + first-click (en una pasada)

```sql
WITH ranked_touches AS (
  SELECT
    c.conversion_id,
    t.campaign_id,
    t.touch_at,
    ROW_NUMBER() OVER (
      PARTITION BY c.conversion_id
      ORDER BY t.touch_at ASC
    ) AS rn_first,
    ROW_NUMBER() OVER (
      PARTITION BY c.conversion_id
      ORDER BY t.touch_at DESC
    ) AS rn_last
  FROM conversions c
  JOIN ad_touches t ON c.user_id = t.user_id
  WHERE t.touch_at < c.converted_at
)
SELECT
  campaign_id,
  COUNT(*) FILTER (WHERE rn_first = 1) AS first_click_credit,
  COUNT(*) FILTER (WHERE rn_last = 1) AS last_click_credit
FROM ranked_touches
GROUP BY 1;
```

## Errores comunes

- **Cambiar de modelo sin re-explicar al cliente**: el ROAS va a
  cambiar, el cliente se va a asustar. Setup de expectativas.
- **Comparar ROAS entre modelos distintos**: no tiene sentido. Cada
  modelo cuenta una historia distinta.
- **Confiar en un solo modelo**: usá DDA como ground truth, y un
  segundo modelo (last-click o position-based) como sanity check.
- **Olvidar el view-through**: un usuario que vio un video de YouTube
  pero no clickeó, ¿cuánto contribuyó? DDA lo incluye, last-click
  no.
- **No deduplicar conversiones**: si el cliente tiene pixel + CAPI,
  un purchase puede aparecer 2 veces. Setup de dedup keys.
