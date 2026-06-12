---
name: lmtm-marketing-funnel
description: >
  Análisis y optimización del funnel de ventas de un cliente LMTM: awareness,
  consideración, conversión, retención, expansión. Mapea cada etapa con
  métricas, identifica cuellos de botella y propone acciones concretas
  con impacto esperado. Usar cuando se pida "armame el funnel", "dónde está
  perdiendo leads", "por qué no convierte", "embudo de ventas", "customer
  journey", "conversion path". NO usar para CRO específico de una sola
  landing (eso es `lmtm-marketing-landing`).
---

# LMTM Marketing Funnel

Análisis end-to-end del funnel de un cliente. Cubre las 5 etapas
clásicas + post-venta, con foco en identificar dónde se pierde dinero
y qué hacer para recuperarlo.

## Las 5 etapas + post-venta

```
AWARENESS         CONSIDERATION      CONVERSION        RETENTION        EXPANSION
  ↓                    ↓                  ↓                 ↓                ↓
Impresiones    →    Visitas a web   →   Leads           →   Clientes    →   Recompra
  ↓                    ↓                  ↓                 ↓                ↓
CPM, Reach,    →    CTR, bounce,     →   CPL, form      →   Churn,     →   LTV, NPS,
  Frequency        time on site          completion         retention      referrals
  ↓                    ↓                  ↓                 ↓                ↓
Meta/Google     →    SEO, contenido, →   Automations,  →   Onboarding, →   Upsell,
  Ads               Email                 CRM                soporte       cross-sell
```

## Procedimiento

1. **Recolectar**:
   - Tráfico por canal (Meta, Google, orgánico, directo, referral)
   - Tasas de conversión por etapa (últimos 90 días)
   - Volumen de leads y ventas
   - Ticket promedio, LTV, churn
   - Stack actual (CRM, email, ads, analytics)
2. **Mapear el funnel real** del cliente, etapa por etapa, con números.
3. **Calcular**:
   - Drop-off rate entre etapas
   - CAC por canal
   - LTV/CAC ratio (target > 3)
   - Payback period
   - Conversion rate por segmento
4. **Identificar cuellos de botella** con el principio 80/20: ¿dónde
   perder 20% de los leads recupera 80% de los revenue?
5. **Proponer acciones** priorizadas por impacto/esfuerzo:
   - Awareness bajo → más presupuesto en top funnel, partnerships
   - Consideration bajo → mejor contenido, retargeting, social proof
   - Conversion bajo → CRO, menos fricción, mejor oferta
   - Retention bajo → onboarding, soporte, engagement
   - Expansion bajo → cross-sell, upsell, referidos
6. **Estimar impacto** de cada acción (leads/mes adicionales, $ recuperados)
7. **Plan de implementación** a 30/60/90 días con owners y KPIs

## Frameworks útiles

- **AARRR** (Pirate Metrics): Acquisition, Activation, Retention, Referral,
  Revenue
- **Hub/Spoke**: tráfico central + nurtures secundarios
- **Bowtie Funnel**: pre-venta + post-venta simétricos
- **Customer Journey Map**: por persona, no por canal

## Salida esperada

- Diagrama del funnel actual con números por etapa
- Tabla de drop-off y $$ perdidos por etapa
- Top 5 acciones priorizadas con impacto estimado
- Plan de implementación 30/60/90 con KPIs por etapa
- 3 experimentos A/B sugeridos para el próximo sprint
