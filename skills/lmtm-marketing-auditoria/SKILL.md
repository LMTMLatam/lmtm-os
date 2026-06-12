---
name: lmtm-marketing-auditoria
description: >
  Auditoría de marketing 360° para un sitio web o landing page de un cliente
  LMTM. Puntuación 0-100 en 6 dimensiones (contenido, conversión, SEO,
  competencia, marca, crecimiento) con copy reescrito, prioridades ordenadas
  y un informe Markdown listo para entregar al cliente. Usar cuando se pida
  auditar, evaluar, diagnosticar o puntuar la presencia digital de un cliente
  o prospecto LMTM. Trigger en "auditoría", "auditar", "evaluar web de
  cliente", "diagnóstico de marketing", "qué le falta a este sitio". NO
  usar para auditorías internas de LMTM-OS (eso es `diagnose-why-work-stopped`
  o skills de paperclip).
---

# LMTM Marketing Auditoría

Auditoría 360° de la presencia digital de un cliente LMTM. Pensada para
preparar pitches, diagnósticos iniciales, QBRs o entregas de valor antes
de una propuesta comercial.

## Input

- URL del sitio/landing a auditar
- (Opcional) contexto del cliente: industria, objetivo, ticket promedio,
  cliente objetivo, mercados (AR/CL/PE/MX)
- (Opcional) si ya hay campañas activas: qué métricas está trayendo

## Metodología de scoring (6 dimensiones)

| Categoría | Peso | Qué mide |
|---|---|---|
| Contenido y Mensaje | 25% | Copy, value props, headlines, CTAs, propuesta de valor |
| Optimización de Conversión | 25% | Funnels, formularios, social proof, fricción, urgencia |
| SEO y Descubrimiento | 15% | SEO on-page, técnico, estructura, schema, performance |
| Posicionamiento Competitivo | 15% | Diferenciación, alternativas, awareness de mercado |
| Marca y Confianza | 10% | Diseño, trust signals, autoridad, coherencia |
| Crecimiento y Estrategia | 10% | Pricing, canales, retención, expansión |

**Por qué conversión pesa más que SEO**: los clientes LMTM viven de tráfico
pago (Meta Ads) y outbound. 10 puntos de conversión mueven revenue al día;
10 puntos de SEO tardan meses. Refleja cómo se mueve el dinero en LATAM.

## Procedimiento

1. **Recolectar**: carga la URL, captura el HTML visible, sitemap, robots,
   schema.org, Open Graph, performance (LCP/CLS/INP), y datos de Meta Ads
   Library si aplica.
2. **Lanzar análisis en paralelo** por dimensión. Cada dimensión devuelve
   puntuación 0-100, hallazgos concretos (no genéricos) y quick wins.
3. **Sintetizar** con prioridades ordenadas por impacto/esfuerzo y un
   "Top 3 para esta semana".
4. **Generar copy reescrito** para los headlines y CTAs principales con
   versión antes/después.
5. **Emitir informe Markdown** en `outputs/auditoria-<cliente>-YYYY-MM-DD.md`
   con: executive summary, score global + por dimensión, Top 5 quick wins,
   copy antes/después, plan de 30 días, próximos pasos.
6. (Opcional) **PDF listo para cliente** vía `lmtm-marketing-informe-pdf` o
   `scripts/generar_informe_pdf.py` (requiere reportlab).

## Tono del informe

- Castellano, profesional, cercano, estratégico, claro (ver
  `lmtm-company-context`).
- Bullets concisos, no párrafos largos.
- Números concretos siempre que sea posible (no "mejorar el SEO" sino
  "agregar alt text a 8 imágenes, faltan meta descriptions en 12 páginas").
- Idioma LATAM (vos, tenés, querés). No España.

## Salida esperada

- Puntuación global 0-100 + por dimensión
- 5 quick wins priorizados (impacto/esfuerzo)
- Copy antes/después
- Plan de acción a 30 días
- 3 preguntas para profundizar con el cliente

## No hacer

- No dar recomendaciones genéricas ("mejorar el SEO"). Todo hallazgo
  debe ser específico y verificable.
- No inventar datos de tráfico, conversiones ni revenue. Si no se
  puede medir, decirlo.
- No comparar con un competidor inventado. Si no se identificó la
  competencia real, listar candidatas y validar con el cliente.
