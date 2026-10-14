---
name: lmtm-seo-playbook
displayName: SEO Playbook
description: "Método SEO de LMTM con datos reales: qué herramienta y qué skill usar para auditar, planificar y subir búsquedas de un cliente (Search Console, GA4, análisis de la home, SEO local, técnico, contenido). Usar ante cualquier pedido de SEO, posicionamiento, 'no aparece en Google', búsquedas o tráfico de la web."
required: false
---

# SEO Playbook (LMTM)

Los datos SEO de un cliente salen de tres lugares, en este orden. Nada de
Ahrefs, Semrush ni volúmenes "estimados": no los tenemos y no se inventan.

1. `lmtmRendimientoWeb` — Search Console y Analytics reales del cliente.
2. `lmtmAnalisisSeo` — la home leída como Google (técnico + on-page + velocidad).
3. WebFetch / WebSearch — otras páginas, la competencia y lo que muestra Google.

Si `lmtmRendimientoWeb` devuelve `searchConsole: null` o `analytics: null`, el
cliente no está vinculado: mirá `falta`. Si es un tema de vínculo (subdominio,
dos propiedades), resolvelo con `lmtmVincularWebGoogle`. Si ninguna cuenta ve
la propiedad, es un pedido al cliente: que dé acceso de lectura a la cuenta de
Google de la agencia. Mientras tanto se trabaja con el análisis de la home.

## Qué skill para qué

| Pedido | Skill |
|---|---|
| Negocio con local o zona (la mayoría de los clientes) | `seo-local` |
| No indexa, cayó en Google, carga lento | `seo-technical` |
| Revisar una página o landing puntual | `seo-page` |
| Revisar textos / E-E-A-T / listo para IA | `seo-content` |
| Escribir o reescribir para subir una búsqueda | `seo-content-brief` |
| Plan SEO de un cliente nuevo o propuesta | `seo-plan` |
| Aparecer en ChatGPT / AI Overviews | `ai-seo` |
| Datos estructurados | `schema` |
| Estructura de la web y enlaces internos | `site-architecture` |
| Páginas a escala (por zona, por producto) | `programmatic-seo` |
| FAQ, guías y comparativas listas para publicar | `lmtm-seo-assets` |

## El circuito que más rinde

1. **Búsquedas para subir.** `lmtmRendimientoWeb` → `oportunidades` (posición 4-20
   con impresiones). Para cada una: ¿qué página aparece?, ¿responde lo que la gente
   busca? Brief con `seo-content-brief` y tarea en ClickUp. Las mismas preguntas
   sirven de ganchos para redes: avisale a @Caro.
2. **Lo que ya trae clics.** `topPaginas` y `topBusquedas`: cuidarlas (título,
   velocidad, CTA a WhatsApp). Una caída de clics en 14 días la detecta el motor solo.
3. **Medición.** Si Analytics no tiene eventos clave, no se sabe qué visita terminó
   en consulta: es lo primero a arreglar en un cliente con pauta.
4. **Técnico de la home.** Los problemas de `lmtmAnalisisSeo` de gravedad alta van
   primero (noindex, sin HTTPS, no carga, no adaptada a celular, lenta).
5. **Local.** Perfil de empresa en Google completo, reseñas, mismo nombre-dirección-
   teléfono en web y directorios (`seo-local`).

## Reglas

- Ningún número sin fuente: posición, clics e impresiones salen de Search Console;
  visitas y conversiones de GA4; si no está, "sin dato".
- Las ventanas de los datos terminan unos días antes de hoy (el dato de Google se
  termina de cerrar con atraso): no compares contra "ayer".
- Solo diagnóstico y propuestas: la web del cliente no se toca desde acá.
- Lo durable (web sin medición, página que trae los clientes, búsqueda ganada) va a
  la memoria del cliente con `lmtmRememberAboutClient`.
