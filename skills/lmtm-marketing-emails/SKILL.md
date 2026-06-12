---
name: lmtm-marketing-emails
description: >
  Secuencias de email marketing completas para clientes LMTM: bienvenida,
  nurture, lanzamiento, abandono de carrito, re-engagement, post-compra.
  Genera subject lines, preheaders, cuerpo completo, segmentación y
  automatizaciones sugeridas. Tono LMTM, en castellano LATAM. Usar cuando
  se pida email marketing, secuencia, automation, "armame un flujo de
  emails", "campaña de email", "newsletter", "lanzamiento por email".
  Trigger en "email sequence", "flujo de email", "automation", "newsletter",
  "broadcast", "secuencia de bienvenida". NO usar para emails transaccionales
  uno-a-uno (esos los maneja cada integrante directamente).
---

# LMTM Marketing Emails

Construye secuencias de email marketing listas para implementar en el
CRM del cliente (Kommo, ActiveCampaign, Mailchimp, HubSpot, etc.) o en
la plataforma que use LMTM internamente.

## Tipos de secuencia cubiertos

- **Bienvenida** (5-7 emails, 14 días): presentación, valor, prueba social,
  oferta
- **Nurture / educación** (8-12 emails, 30-45 días): dolor → agitación →
  solución
- **Lanzamiento** (5-7 emails, 14 días): pre-launch, apertura, cierre,
  objection handling, last call
- **Abandono de carrito** (3-4 emails, 5 días): recordatorio, urgencia,
  incentivo, respaldo
- **Re-engagement** (3-5 emails, 21 días): "te extrañamos", incentivo,
  feedback
- **Post-compra / onboarding** (4-6 emails, 21 días): bienvenida, primeros
  pasos, tips, expansión
- **Newsletter semanal/mensual**: estructura recurrente para contenido

## Procedimiento

1. **Brief del cliente**: producto, audiencia, oferta, restricción legal
   (si es健康食品, fintech, etc.), frecuencia, plataforma de envío.
2. **Definir arquitectura de la secuencia**:
   - Cuántos emails
   - Timing entre emails (días/horas)
   - Triggers (sign-up, compra, abandono, inactividad)
   - Segmentación (lead source, comportamiento, geografía)
3. **Escribir cada email** con:
   - Subject line (3 variantes A/B)
   - Preheader
   - Cuerpo (estructura: hook → dolor → promesa → prueba → CTA)
   - CTA único y claro
   - PS estratégica (sirve como segundo CTA sin romper el flujo)
4. **Definir automatizaciones**:
   - Triggers de entrada/salida
   - Condiciones de skip (si compra, salir de la secuencia)
   - Branches (si abre vs si no abre)
5. **Plantillas de asunto** organizadas por categoría (curiosidad,
   urgencia, valor, pregunta, beneficio, social proof).
6. **Checklist de entregability**:
   - SPF, DKIM, DMARC configurados
   - Lista limpia (bounce rate < 2%)
   - Warm-up de dominio nuevo
   - Evitar spam triggers
   - Text-to-image ratio correcto
   - Plain text alternativo

## Tono y formato

- Castellano LATAM (vos, tenés, querés)
- Una idea por párrafo (3-4 líneas máximo)
- CTA visible: botón + texto. No esconder el CTA en el copy
- Mobile-first: 60% de los opens son mobile
- Sin imágenes pesadas en el header (impacta deliverability)
- PS estratégico (oferta secundaria, urgencia, link a reply)

## Salida esperada

- Arquitectura de la secuencia (diagrama en texto)
- Cada email con: subject (3 variantes), preheader, cuerpo, CTA, PS
- Tabla de triggers y condiciones
- Checklist de implementación
- KPIs sugeridos (open rate, CTR, conversion rate, unsub rate)
