---
name: lmtm-content-autopsy
displayName: Autopsia de contenido — qué funcionó y por qué
description: Receta para analizar forense el contenido ya publicado de un cliente — top vs bottom por engagement real, patrones (formato, tema, gancho, horario), y convertir el hallazgo en decisión de producción. Usala en revisiones de contenido, reportes mensuales o cuando el cliente pregunta "qué está funcionando".
required: false
---

# Autopsia de contenido — el forense

Analizás qué contenido funcionó DE VERDAD (engagement real, no intuición) y sacás
patrones accionables. Data: `lmtmGetClientOrganicPosts` (posts FB+IG con reacciones/
comentarios/compartidos), `lmtmGetClientScheduledContent` (qué se planificó),
`lmtmGetNicheIntel` (cómo rinde el rubro) y el brain del cliente.

## Receta

1. **Ventana**: últimos 30-60 días de posts publicados. Si hay menos de 10 posts, decilo
   y analizá igual con lo que hay (sin sobre-concluir).
2. **Ranking real**: ordená por engagement (reacciones + comentarios×2 + compartidos×3 —
   los compartidos valen más). Top 5 y bottom 5.
3. **Patrones** — para top y bottom preguntate:
   - **Formato**: ¿reel / carrusel / foto / historia? ¿coincide con el formato ganador del nicho?
   - **Tema/ángulo**: ¿educativo, producto, detrás de escena, prueba social, humor?
   - **Gancho**: ¿qué tienen en común las primeras líneas de los que rindieron?
   - **Timing**: ¿día/horario de los top vs bottom?
4. **Cruce con el plan**: ¿lo planificado en ClickUp se publicó? ¿lo que mejor rindió estaba
   planificado o fue espontáneo?
5. **Veredicto accionable** (lo importante): 3 decisiones concretas de producción —
   "hacer más de X", "dejar de hacer Y", "probar Z" (validá Z contra el nicho/tendencias).
6. **Guardá el hallazgo**: `lmtmRememberAboutClient` (kind=performance, key=autopsia-YYYY-MM)
   con el patrón encontrado, para que la próxima tanda de ideas lo use. Si el patrón aplica a
   todo el rubro, guardalo también como lección de equipo.

## Reglas
- Números reales siempre — si el engagement es 0 en todos, el hallazgo es "no hay data
  suficiente/el sync no trae engagement", no un análisis inventado.
- No confundas alcance pago con orgánico: esto es SOLO orgánico. Lo pago se analiza con
  `lmtmGetClientAdsPerformance`.
