---
name: lmtm-web-search
displayName: Web search
description: Cómo hacer investigación web con Tavily / SerpAPI / Google CSE / Brave. Cuándo usar cada uno.
required: false
---

# Web search

Para investigar fuera de las plataformas de ads, necesitás web search.
Hoy LMTM-OS tiene 4 proveedores razonables; usá el correcto según el caso.

## Cuándo usar cada uno

| Proveedor | Cuándo | Costo aprox |
|-----------|--------|-------------|
| **Tavily** (default) | Investigación general, resúmenes, fact-checking | Free tier 1000/mes, después $0.005/req |
| **SerpAPI** | Resultados crudos de Google, rank tracking, SERP features | $50/mes 5000 búsquedas |
| **Google CSE** | Búsqueda en sitios específicos (ej. solo TechCrunch) | Free 100/día, después $5/1000 |
| **Brave Search** | Privacidad, alternativa sin tracking de Google | Free tier 2000/mes |

## Formato de uso (cuando esté la tool)

```
web_search({
  query: "mejores prácticas email marketing B2B SaaS 2026",
  provider: "tavily",        // tavily | serpapi | google_cse | brave
  site_filter: ["hubspot.com","mailchimp.com"],  // opcional
  max_results: 5,
  recency_days: 90
})
```

Devuelve lista de `{title, url, snippet, published_at, score}`.

## Buenas prácticas

- **Query específico**: en vez de "email marketing", usá
  "email marketing B2B SaaS nurture sequence best practices 2026".
- **Anclar año**: agregar "2026" o "último año" para evitar resultados viejos.
- **Site filter**: cuando sabés que el sitio tiene la info (ej. un blog
  específico), filtrá por `site:blog.com` o `site_filter`.
- **Recency**: para cosas que cambian rápido (algorithms, plataformas),
  usar `recency_days: 30`. Para evergreen (frameworks copy), 365.
- **Comparar fuentes**: nunca cites un solo resultado. 2-3 fuentes
  mínimo.

## Después de buscar

- **Siempre** citar la URL en el entregable al cliente.
- **Siempre** leer la fecha de publicación. Si tiene > 1 año y el tema
  cambia rápido (ads, SEO), buscar una más fresca.
- **Si** hay conflicto entre fuentes, mencionar el disenso en vez de
  elegir arbitrariamente.

## Cuándo NO usar web search

- Datos que ya están en una tool interna (no reinventes la rueda).
- Cosas que cambian por hora (precios de acciones, trending topics —
  usar APIs especializadas).
- Preguntas que requieren credenciales (login).
