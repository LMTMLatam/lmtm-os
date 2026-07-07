---
name: lmtm-web-audit
displayName: Auditoría de web y redes de clientes
description: Proceso para auditar la web (landing, pixel, formularios, mobile) y las redes públicas de un cliente con las herramientas que ya tenés (WebFetch, WebSearch, Bash/curl, tools lmtm*). Diagnóstico accionable, nunca tocar la web del cliente.
required: false
---

# Auditoría de web y redes de clientes

Podés (y debés) auditar la web y las redes de los clientes vos mismo — tenés
WebFetch, WebSearch y Bash (curl). No hace falta pedirle a un humano que "revise
la landing": revisala vos y reportá hallazgos concretos.

## Cuándo auditar

- Un issue te lo pide, o en tu loop de proactividad (cliente con señales flojas).
- **Disparador clásico**: CTR alto + 0 leads → el problema está DESPUÉS del clic
  (landing/pixel/formulario), no en el anuncio. Auditá la web antes de tocar pauta.
- Onboarding de cliente nuevo sin auditoría previa en el brain.
- Máximo una auditoría por cliente por semana — revisá el brain antes por si ya hay una reciente.

## Auditoría de WEB (con WebFetch o curl)

Conseguí la URL desde `lmtmGetClientBrain` (identity/Enfoque Técnico) o
`lmtmListClients`. Si no está, buscala con WebSearch. Chequeá:

1. **Disponibilidad**: ¿responde 200? ¿SSL válido? ¿redirects raros o www/no-www roto?
2. **Pixel de Meta**: buscá `fbq(` o `connect.facebook.net` en el HTML. Sin pixel
   no hay optimización de conversión — hallazgo CRÍTICO si el cliente tiene pauta activa.
3. **Mobile**: ¿tiene `<meta name="viewport">`? La mayoría del tráfico de pauta es móvil.
4. **Conversión**: ¿hay formulario o botón de WhatsApp (wa.me) visible? ¿El link de
   WhatsApp tiene número correcto? ¿El CTA principal se entiende?
5. **Coherencia pauta↔landing**: compará la oferta de las campañas activas
   (`lmtmGetClientAdsPerformance`) con lo que dice la landing. Oferta distinta = leads caros.
6. **Básicos SEO/velocidad**: title/meta description presentes, peso del HTML,
   cantidad de scripts de terceros (señal de lentitud).

## Auditoría de REDES (perfiles públicos)

1. Handle de IG/FB desde el brain o WebSearch por el nombre del cliente.
2. Abrí el perfil público con WebFetch/curl: bio con link correcto, datos de
   contacto, frecuencia real de posteo visible.
3. Cruzá contra lo planificado: `lmtmGetClientScheduledContent` (lo que debería
   haber salido) y `lmtmGetClientOrganicPosts` (lo que la API dice que salió).
   Diferencias = hallazgo (post planificado que no salió, o red sin actividad).

## Output (siempre igual)

- **UN issue por cliente** con los hallazgos priorizados: CRÍTICO (rompe conversión:
  sin pixel, form roto, landing caída) → MEJORA (mobile, velocidad, bio) — cada uno
  con su acción concreta. Designá el issue al cliente (clientId), no solo el título.
- Guardá los hallazgos durables con `lmtmRememberAboutClient` (ej: "LP sin pixel de
  Meta desde 2026-07", "el form de contacto va a email X").
- Si el hallazgo es de pauta (oferta incoherente), mencioná a @Milo; si es de
  contenido/redes, a @Caro.

## Límites

- **Solo diagnóstico: NUNCA toques la web del cliente** (no tenés acceso y no es tu rol).
  Los fixes de LP/pixel los ejecuta el equipo humano o se cotizan al cliente.
- No inventes métricas que no viste (velocidad exacta, ranking). Reportá lo observable.
