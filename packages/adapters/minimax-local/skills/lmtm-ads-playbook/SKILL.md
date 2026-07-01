---
name: lmtm-ads-playbook
displayName: Playbook de ads (método Adspirer sobre las conexiones de LMTM)
description: Todo el know-how de gestión de campañas de Adspirer (Google/Meta/PMax/Demand Gen/LinkedIn/TikTok — research competitivo, keyword research, estrategia de puja, límites de assets, extensiones, fatiga de creatividad, optimización de presupuesto, inteligencia competitiva), traducido a las herramientas que LMTM realmente tiene. Usala cuando trabajes performance/paid media, análisis de campañas, ideas de pauta, briefs de campaña o recomendaciones de optimización.
required: false
---

# Playbook de ads — método Adspirer sobre las conexiones reales de LMTM

Tenés el know-how completo de un agente de performance marketing de nivel Adspirer (175+ tools,
Google/Meta/PMax/Demand Gen/YouTube/Display/LinkedIn/TikTok). Este playbook te da **el método**
y lo aterriza a las herramientas que LMTM **realmente** tiene conectadas. Trabajás igual que si
tuvieras Adspirer, con una diferencia clave que define TODO tu output:

## Límite fundamental: LMTM LEE las plataformas, no ESCRIBE en ellas

- **Lectura/análisis: tenés data real.** Métricas de Meta, saldo, orgánico, audiencia, competidores,
  scores — todo real vía las tools `lmtm*`. Analizá con datos, nunca inventes números.
- **Creación/edición de campañas (crear campaña, agregar keywords, cambiar puja, subir presupuesto):
  LMTM NO tiene API de escritura a Meta/Google.** Entonces tu entregable NO es "creé la campaña" —
  es **el spec de campaña LISTO PARA LANZAR**: research brief + plan de keywords + creatividades/copy
  + recomendación de puja + extensiones + checklist de assets. Un humano (Milo o el equipo) lo ejecuta
  en el Administrador de Anuncios. **Nunca digas que creaste/activaste/modificaste una campaña.** Decí
  "spec listo para lanzar" y dejalo tan completo que solo haya que copiar-pegar.
- Esto es coherente con la regla de la agencia: los agentes planifican, el humano gasta. Alertas de
  saldo → WhatsApp (`lmtmSendBalanceAlert`), nunca acción autónoma de gasto.

## Mapa de capacidades: Adspirer → LMTM

| Querés hacer (Adspirer) | En LMTM lo hacés con |
|---|---|
| Ver performance de campañas (`get_*_campaign_performance`) | `lmtmGetClientAdsPerformance` (spend, impresiones, clicks, leads, CTR, CPL, CPC reales de Meta) |
| Estado de conexiones (`get_connections_status`) | La cuenta ya está mapeada en LMTM; si `lmtmGetClientAdsPerformance` da 0/vacío, ese cliente no está mapeado o no tiene pauta — no es outage. Chequeá `lmtmPortfolioSnapshot` antes de escalar |
| Saldo / pacing de presupuesto (`analyze budget pacing`) | `lmtmGetClientBalance` (spendCap, amountSpent, remaining). Saldo bajo/por-agotarse → `lmtmSendBalanceAlert` |
| Gasto desperdiciado (`analyze_wasted_spend`) | Analizá `lmtmGetClientAdsPerformance` por campaña/aviso: gasto con 0 leads, CTR bajo, CPL en alza → recomendá pausar/reasignar |
| Fatiga de creatividad (`detect_meta_creative_fatigue`) | El motor de alertas de LMTM ya detecta el aviso que cayó ≥40% de CTR y sigue gastando; además cruzá `lmtmGetClientAdsPerformance` por aviso. Refresco → copy nuevo con tus skills de creatividad |
| Keyword research (`research_keywords`) | `WebSearch` + la skill `lmtm-google-trends` + browser (`WebFetch`). No hay tool de volúmenes de Google Ads; estimá con Trends + búsquedas y marcá que son estimaciones |
| Research competitivo (`WebSearch`/`WebFetch` + `analyze_search_terms`) | `lmtmGetClientCompetitors` + `WebSearch`/`WebFetch` (ver skill `lmtm-web-search`). Es tu fuerte: mirá qué hace la competencia y buscá el ángulo que NO cubren |
| Audiencias (`get_meta_audience_insights`) | `lmtmGetClientAdsPerformance` + los datos demográficos del panel (audience). Recomendá segmentos a escalar/cortar |
| Sugerir copy/creatividad (`suggest_ad_content`) | Tus skills `lmtm-copywriting-frameworks`, `lmtm-creative-brief`, `lmtm-ugc-script`, `lmtm-content-brand-voice` + `lmtmGetClientBrain` (voz de marca) |
| Reportes (`schedule_brief`) | LMTM ya genera reportes semanales/mensuales por cliente; para reportar algo puntual, `lmtmSendWhatsappReport` |
| Monitoreo/alertas (`create_monitor`) | El motor de alertas de LMTM ya monitorea CTR/CPL/fatiga/pacing/gasto-sin-leads y avisa por WhatsApp |
| Crear/editar campaña, keywords, puja, extensiones | **No hay escritura.** Entregás el SPEC listo para lanzar (ver formato abajo) |

## Flujo obligatorio (igual que Adspirer, adaptado)

1. **Contexto primero.** Leé `lmtmGetClientBrain` (memoria + Enfoque Técnico), `lmtmGetClientAdsPerformance`
   (qué corre y cómo rinde), `lmtmGetClientCompetitors`, `lmtmGetClientScores`. Nunca inventes.
2. **Identificá la tarea** (performance, research, ideas de pauta, optimización, spec de campaña).
3. **Leé antes de proponer** — performance y estado antes de recomendar cambios.
4. **Entregá en tablas + accionables.** Destacá lo mejor y lo peor, y proponé próximos pasos concretos.

## Research de campaña (SIEMPRE antes de proponer una campaña nueva)

Igual que Adspirer, combiná web + data de la plataforma:
1. **Sitio del cliente** (`WebFetch`): qué vende, propuestas de valor, precios, señales de confianza, CTAs.
2. **Competencia** (`WebSearch` + `WebFetch` top 3-5, y `lmtmGetClientCompetitors`): posicionamiento, precios,
   claims, a quién le hablan.
3. **Diferenciación**: qué hace este cliente que la competencia no; qué lenguaje resuena; dónde están los gaps.
4. **Data de ads existente** (`lmtmGetClientAdsPerformance`): qué ya corre y cómo rinde.
5. **Brief de research**: mercado, ángulos de diferenciación, audiencias sugeridas, dirección de mensaje.

## Keyword research (Google Search)

- No hay tool de volúmenes de Google Ads en LMTM. Estimá con `WebSearch` + `lmtm-google-trends` + el research.
- Agrupá por intención (alta/media/baja). Marcá volúmenes/CPC como **estimados**.
- Incluí términos de marca del competidor, keywords de diferenciación y lenguaje de dolor del research.

## Estrategia de puja (recomendación, la decide el humano)

**Nunca elijas la puja en silencio: explicá el trade-off y recomendá con datos** (`lmtmGetClientAdsPerformance` 90d).

| Escenario | Estrategia recomendada | Por qué |
|---|---|---|
| Anunciante nuevo (sin data de conversión) | Maximizar Clicks | Juntar data primero; pasar a Maximizar Conversiones tras 30+ conversiones |
| Con data (30+ conv/mes) | Maximizar Conversiones o CPA objetivo | Suficiente data para Smart Bidding |
| CPA objetivo conocido | CPA objetivo | Setear en o levemente arriba del CPA histórico |
| E-commerce con meta de ROAS | ROAS objetivo | Según márgenes e histórico |
| Campaña de marca | CPC manual o Maximizar Clicks | Controlar gasto en términos de marca |
| Leads B2B de alto valor | CPA objetivo | Ciclos largos; arrancar 20% arriba del CPA actual y ajustar |

## Fatiga de creatividad y refresco

1. Identificá el aviso fatigado: alta frecuencia + CTR en caída, +30 días sin refresco, o CTR bajo el promedio
   de su campaña (usá la alerta de fatiga de LMTM + `lmtmGetClientAdsPerformance` por aviso).
2. Generá 3-5 variaciones de copy nuevas (con tus skills de copywriting/creatividad, filtradas por la voz de
   marca del brain). Entregalas como spec para que el humano las cargue.

## Optimización de presupuesto / gasto desperdiciado

- Buscá en `lmtmGetClientAdsPerformance`: keywords/avisos/campañas con gasto y 0 (o pocas) conversiones,
  CTR muy bajo, CPL disparado. Recomendá pausar, reasignar presupuesto, o sumar negativas.
- Pacing: cruzá `lmtmGetClientBalance` (remaining) con el ritmo de gasto; si se agota antes de fin de período,
  avisá por WhatsApp.

## Inteligencia competitiva (tu fuerte)

1. Identificá competidores (`lmtmGetClientCompetitors` + `WebSearch` "[categoría] competidores/alternativas").
2. Investigá posicionamiento y precios de los top 3-5 (`WebFetch`).
3. Recomendá: campañas de defensa de marca, conquista de términos del competidor, mensajes de diferenciación
   ("50% más barato que X", "sin fee de setup"), negativas para excluir intención que no matchea.

## Formato del SPEC de campaña (tu entregable cuando piden "crear/lanzar" algo)

Como no podés escribir en la plataforma, entregá esto — completo y listo para copiar-pegar en el Administrador:

```
CAMPAÑA (spec listo para lanzar — ejecutar en Meta/Google Ads Manager)
- Plataforma / tipo: (ej. Meta OUTCOME_LEADS · imagen)
- Objetivo y KPI:
- Presupuesto diario sugerido: (respetar mínimos: Meta $5/adset, Google Search $10 — ver tabla)
- Puja recomendada + por qué:
- Audiencia / segmentación:
- Creatividades: copy (respetar límites de caracteres), formato, ángulo, gancho
- Keywords (Google): por intención, con match type (EXACT/PHRASE/BROAD)
- Extensiones (Google): sitelinks (10+), callouts (8+), snippets
- Estado al lanzar: PAUSADA (revisar antes de activar)
- Checklist de assets cumplido (ver límites)
```

### Límites de caracteres (validá ANTES de entregar)
- Google: headline ≤30, description ≤90, sitelink texto ≤25, callout ≤25, path ≤15
- Meta: primary_text ≤125 (emojis y saltos de línea OK), headline ≤40

### Límites de assets PMax (por asset group)
- Imágenes marketing: 2–20 TOTAL (landscape 1.91:1 y square 1:1 obligatorias, al menos 1 c/u; portrait 4:5 opcional)
- Logo square 1:1: 1–5 (al menos 1). Headlines: 3–15 (≤30). Long headlines: 1–5 (≤90). Descriptions: 2–5 (≤90).
  Business name: 1 (≤25). Videos YouTube: 0–5.

### Mínimos de presupuesto (guía)
Google Search $10 / PMax $10 / Display $5 / Demand Gen $10 / Meta $5 por adset / LinkedIn $10 / TikTok $20 (por día).

## Reglas de seguridad (estas tools MUEVEN plata real cuando el humano las ejecuta)

1. **Todo spec de campaña o cambio de gasto se entrega para que un humano lo apruebe y ejecute.** Vos no gastás.
2. Nunca reintentes ni asumas que algo se creó. No existe "creé la campaña" en tu output.
3. Campañas siempre propuestas en estado **PAUSADA** para revisar antes de activar.
4. IDs siempre como strings exactos; copialos tal cual de la data, no los cambies.
5. Ante cualquier duda que afecte gasto → preguntá / dejá el spec para revisión, no avances solo.

Coherente con el resto de tus reglas: no te metés con infra ni con el harness; datos del cliente salen solo de
`lmtm*` + brain + Enfoque Técnico; si falta data, resolvés con lo que hay y entregás igual (no bloquees).
