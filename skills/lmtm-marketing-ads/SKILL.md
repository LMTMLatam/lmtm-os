---
name: lmtm-marketing-ads
description: >
  Estrategia, estructura y copy para campañas de publicidad online
  (Meta Ads, Google Ads, LinkedIn Ads, TikTok Ads, YouTube Ads). Incluye
  arquitectura de cuenta, segmentación, estructura de campañas, creatividades,
  copy, budget allocation, bidding y optimización. Específico para el stack
  de clientes LMTM (principalmente Meta + Google). Usar cuando se pida
  campañas, estructura de cuenta, copy para ads, "armame la campaña de
  Meta", "qué presupuesto pongo", "estructura Advantage+", "RSA", "Performance
  Max". NO usar para programmatic puro ni DSPs (eso es un caso especializado
  que no cubre LMTM).
---

# LMTM Marketing Ads

Cubre el ciclo completo de paid media para clientes LMTM: desde
arquitectura de cuenta hasta creatividades y reportes.

## Plataformas soportadas (orden de prioridad LMTM)

1. **Meta Ads** (Facebook + Instagram) — principal
2. **Google Ads** (Search, PMax, YouTube) — secundario
3. **LinkedIn Ads** — B2B
4. **TikTok Ads** — performance, audiencias jóvenes
5. **YouTube Ads** — awareness + consideration

## Procedimiento

1. **Brief del cliente**:
   - Producto/servicio y ticket promedio
   - Cliente objetivo (demografía, intereses, behavior)
   - Objetivo de campaña (awareness / consideration / conversion)
   - Budget mensual y CPA/CPL objetivo
   - Geo (AR, CL, PE, MX, multi-país)
   - Pixel/Conversions API configurado (Meta) o GA4 + GTM (Google)
2. **Auditoría rápida** de la cuenta actual si existe:
   - ¿Hay eventos de conversión correctos?
   - ¿El pixel está firing bien?
   - ¿Hay audiencias base instaladas?
   - ¿Cuál es el ROAS/CPA histórico?
3. **Arquitectura de cuenta Meta recomendada** (ABO o CBO):
   - Campañas por objetivo (3-5 simultáneas)
   - Conjuntos por audiencia (no más de 5-7 ads por conjunto)
   - Estructura Advantage+ Shopping / App / Lead
   - Naming convention: `cliente_objetivo_geo_audiencia_YYYY-MM`
4. **Estructura Google Ads**:
   - Search por temática de keyword
   - PMax con feed (Merchant Center) para ecommerce
   - YouTube por objetivo (skippable, bumper, shorts)
   - Exclusiones negativas activas
5. **Copy por plataforma** (con tablas de variants para A/B):
   - Meta: primary text (125 chars óptimo), headline (40), description (30), CTA button
   - Google RSA: 15 headlines, 4 descriptions, variations
   - LinkedIn: intro (150), headline (70), creative
   - TikTok: hook en 3 segundos, native style
6. **Creatividades** (brief para producción):
   - Formato (feed, story, reel, carousel, video)
   - Hook visual
   - CTA visual + copy
   - Variantes para A/B (mínimo 3 por conjunto)
7. **Bidding & optimization**:
   - Highest volume / highest value / lowest cost
   - Cap de CPA si aplica
   - Learning phase requirements
   - Frequency caps
8. **Reporting & optimization**:
   - KPIs por objetivo (CPM, CTR, CPC, CPA, ROAS)
   - Frecuencia de revisión (diaria primera semana, semanal después)
   - Tests a correr (creative fatigue, audience saturation, bid strategy)

## Errores comunes a evitar

- Poner todo el presupuesto en 1 campaña / 1 conjunto
- No instalar events de conversion correctos (Meta, GA4)
- Lanzar con 1 sola creatividad (no hay learning)
- No excluir audiencias重叠 (lookalike vs base en el mismo set)
- Optimizar para "clicks" en vez de "conversions" cuando hay pixel
- Dejar campañas activas sin budget diario (se pausan por overrun)
- No monitorear frequency (cuando pasa 3-4 en retargeting, baja ROAS)

## Salida esperada

- Diagrama de arquitectura de cuenta
- Naming convention aplicada
- Copy por campaña con variantes A/B
- Brief de creatividades para producción
- Plan de budget allocation + scaling
- Plan de testing (qué probar y cuándo)
- KPIs y cadencia de reporting
