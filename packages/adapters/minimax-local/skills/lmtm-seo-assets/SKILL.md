---
name: lmtm-seo-assets
displayName: Assets de SEO (FAQ, guías, páginas vs-competidor)
description: Recetas para producir los assets de SEO/AI-SEO que posicionan y son citados por IA — bloques de FAQ con schema, guías completas listas para publicar, y páginas de comparación contra competidores. Complementa seo-audit / ai-seo / programmatic-seo con el entregable concreto.
required: false
---

# Assets de SEO — producir lo que posiciona y lo que la IA cita

Complementa tus skills `seo-audit`, `ai-seo`, `programmatic-seo` y `schema` con el
entregable concreto. Antes: leé el rubro del cliente (`lmtmGetClientBrain`), qué busca
su mercado (`lmtm-trends-mcp` / `lmtm-google-trends`) y qué hace la competencia
(`lmtmGetClientCompetitors`). Nunca inventes datos ni cifras.

## Generador de FAQ (faq-generator) — pensado para ser citado por IA
- Extraé las preguntas REALES que hace el mercado del cliente (búsquedas, objeciones de venta,
  dudas frecuentes del rubro). 8-15 preguntas.
- Respuesta: directa en la 1ra oración (la IA cita la respuesta corta), luego 2-3 oraciones de
  contexto. Lenguaje claro, sin relleno — así ChatGPT/Perplexity/Claude la levantan como fuente.
- Entregá el FAQ + el **schema FAQPage JSON-LD** listo para pegar (usá tu skill `schema`).

## Generador de guías (guide-generator)
- Guía completa lista para publicar sobre un tema del rubro donde el cliente quiere autoridad.
- Estructura: intro (qué resuelve + para quién) · secciones con H2/H3 · ejemplos concretos ·
  checklist o pasos accionables · CTA. Optimizada para la keyword objetivo sin keyword-stuffing.
- Marcá dónde van imágenes/tablas. Incluí meta title (≤60) y meta description (≤155).

## Páginas vs-competidor (seo-competitor-pages)
- Página de comparación "[Cliente] vs [Competidor]" o "alternativas a [Competidor]" — capta
  búsquedas de alta intención comercial.
- Investigá al competidor (`WebFetch` a su sitio/precios) y armá tabla honesta de diferenciadores.
  Nunca inventes claims; si no sabés un dato del competidor, no lo pongas.
- Ángulo: dónde el cliente gana de verdad (precio, servicio, especialización). CTA claro.
- Entregable = página lista para que ingeniería/el cliente la publique. Si el cliente NO tiene sitio
  propio, dejalo como propuesta y avisá que falta dónde publicarla.
