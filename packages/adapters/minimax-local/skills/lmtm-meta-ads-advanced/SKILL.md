---
name: lmtm-meta-ads-advanced
displayName: Meta Ads tácticas avanzadas
description: CAPI, Advantage+, lookalikes, attribution, estructura de campaigns, lo que funciona en 2026.
required: false
---

# Meta Ads — tácticas avanzadas (2026)

Lo que cambió en los últimos 18 meses:

1. **Privacy-first**: iOS 14.5+ y Chrome 3rd-party cookies phaseout.
   El pixel-only ya no es confiable. **CAPI es obligatorio**.
2. **Advantage+ (ASC+)**: las campañas Advantage+ Shopping y App dan
   12-30% más ROAS para e-commerce. Para lead gen, todavía dudoso.
3. **Broad targeting + buenos creativos > segmentación manual fina**.
4. **Modelos de atribribución**: ahora todo es data-driven attribution
   (DDA). Las plataformas que siguen mostrando "last click" están
   mintiendo.

## Estructura de campaigns que recomendamos

### CBO (Campaign Budget Optimization) — default en 2026

```
Campaign (objetivo, CBO on, budget diario a nivel campaign)
  ├── Ad Set 1 (audiencia A, creatives batch 1)
  ├── Ad Set 2 (audiencia B, creatives batch 1)
  └── Ad Set 3 (broad, creatives batch 1)
```

Reglas:
- **Budget a nivel campaign**, no ad set. Dejá que Meta optimice.
- **3-5 ad sets por campaign** máximo. Más = dilución de data.
- **Misma batería de creativos en todos los ad sets** para poder
  comparar audiencias.
- **Beneficio de la compra (purchase) tiene que ser > 0** a nivel
  ad set, sino Meta te lo corta.

### ABO (Ad Budget Optimization) — solo para casos especiales

- Cuando el cliente tiene restricciones duras de presupuesto por
  línea de producto.
- Cuando los ROAS objetivo son muy distintos entre audiencias.

## CAPI (Conversions API)

**Obligatorio** si tenés pixel. Sin CAPI estás perdiendo 30-50% de
las conversiones que Meta no puede atribuir.

Setup mínimo:
- Server-side event tracking
- `event_id` deduplication contra el pixel
- `event_source_url` (la URL exacta de la conversión)
- `client_ip` y `client_user_agent` (Meta los pide para matching)
- `fbclid` cuando viene de un click de Meta

Events que hay que trackear (en orden de prioridad):
1. `Purchase` (con `value` y `currency`)
2. `AddToCart`
3. `InitiateCheckout`
4. `Lead` (en formularios de Meta o en sitio)
5. `ViewContent` (product page view)

## Lookalikes

- **1% lookalike = mejor calidad, menos volumen**. Para scaled accounts.
- **1-5% lookalike stack** (varios ad sets con LAL 1%, 2%, 3%, 5%) > un
  solo LAL 1% grande.
- **Source audience > 1.000 eventos** para que sea estadísticamente
  significativa. Menos de eso, el lookalike es ruido.
- **Mejores sources**: purchasers (si hay), high-LTV purchasers, repeat
  purchasers, qualified leads.

## Advantage+ (ASC) y otros AI-features

| Feature | Cuándo | Notas |
|---------|--------|-------|
| **ASC+ (Shopping)** | E-commerce, retargeting + prospecting | 12-30% más ROAS. Setup simple. |
| **Advantage+ audience** (broad) | Siempre que no sepas qué targeting usar | Combina con buenos creativos. |
| **Dynamic creatives** | Cuando tenés > 6 variaciones de copy/creative | Deja que Meta arme combinaciones. |
| **Advantage+ placements** | Casi siempre | Manual solo si un placement funciona mal. |

## Attribution: cómo leerla

- **DDA (Data-Driven Attribution)** es la fuente de verdad.
- **7-day click + 1-day view** es el default de la industria.
- **NO** comparar Meta ROAS con Google Analytics ROAS — son modelos
  distintos y siempre van a diferir.
- **Sí** mirar el trend del propio ROAS semana a semana.

## Reglas anti-burn

- **No** escalar una campaña que todavía no llegó a 50 conversions/week
  (el modelo todavía no aprendió).
- **No** cambiar audiencia + creativo + budget al mismo tiempo. Un
  cambio a la vez, esperá 3-5 días.
- **No** dejar una campaña con ROAS < 0.5 después de 14 días con
  budget > USD 100/día. Pausar y revisar.
- **Sí** rotar creativos cada 7-14 días aunque estén funcionando.
  La fatiga es real.

## Cuándo escalar

- ROAS > target del cliente **y** CPA < target **y** creative no
  quemado **y** frequency < 3.5.
- Escalar +20% cada 3-5 días (no más rápido, sino el modelo no
  generaliza).
- Si después de 2 escaladas el ROAS cae > 15%, volvé al budget
  anterior.
