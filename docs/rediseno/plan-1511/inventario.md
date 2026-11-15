# Inventario de funciones propias — no se pierde ninguna (fase 0, 15/11/2026)

Regla (Naza, 06/10 y 15/11): antes de retirar algo, decir qué hacía y dónde queda. Si no hay reemplazo
equivalente con datos reales, no se retira. Este inventario es la lista contra la que se controla cada
borrado de las fases 5 y 6.

Columna **Destino**: dónde queda después del plan. `=` sigue igual · `→ X` se muda a X · `fusiona` se une con otra.

## Pantallas (ui/src/app y páginas viejas montadas en el shell)

| Pantalla | Qué hace | Destino |
|---|---|---|
| Hoy (`HoyApp`) | Decisiones e incidentes por tema, acción a la vista, responder bloqueadas | = (suma publicación y calidad) |
| Clientes / ficha (`ClientesApp`, `ClienteApp` + `ClientDashboard` 12 pestañas) | Cartera, ficha con resumen, plan de acción, tareas, calendario, dashboard, marca, web, ideas, ganchos, tendencias, memoria, competidores | → ficha = vista del cerebro (fase 5); cada pestaña con reemplazo antes de retirar `ClientDashboard` |
| Trabajo (`Trabajo`) | Lo hecho y propuesto por los agentes con resultado medido | fusiona con Biblioteca + Actividad |
| Contenido (`ContenidoApp`) | Calendario y estado del contenido | = + tablero de publicación |
| Producción: Tipos de video, Contenido generado | Plantillas por tipo; piezas generadas con su link y gasto | → Biblioteca (generado); Tipos = |
| Agentes (`AgentesApp`) | Flota, trabajos, estado | = (sobre motor propio en fase 6) |
| Config (`ConfigApp`) | Ajustes | = + medición continua |
| Avisos (`AvisosApp`) | Cola de avisos por WhatsApp, «No salió» | = |
| Pauta (`PautaApp`, `PautaGoogle`) | Pauta Meta/Google, propuestas | = |
| Nichos (`NichosApp`) | Radar por rubro, competencia, edición | = |
| Licitaciones | Mercado Público, curaduría | = |
| Finanzas | (vacía) | sale del menú (D4) |
| Semáforo (`Growth`) | Semáforo de pauta por cliente | rehacer en app nueva |
| Inteligencia (`Intelligence`) | Centro de inteligencia, brief, salud | rehacer en app nueva |
| WhatsApp (`WhatsApp`) | Bot de grupos, configuración | rehacer en app nueva |
| Conexiones (`AdsIntegrations`, `ConnectAds`) | OAuth Meta/Google, mapeo de cuentas | rehacer en app nueva |
| Preparación (`Readiness`) | Qué le falta a cada cliente | fusiona con cobertura del cerebro |
| Link público (`PublicDashboard*`) | Dashboard e informe para el cliente | = (rediseño fase 5) |

## Servicios de fondo (arrancan con el servidor)

AccountScoring, ActionOutcomes, AgencyOps, AgentEval, Auditor, ClickUpReconciliation, CompetenciaIg,
ContenidoAngulos, ContentIdeas, CustomerBrain, DbMaintenance, FeedbackAgent, GrowthRoundtable,
InformesSemanales, IssueRouter, KnowledgeGraph, LearningEngine, Licitaciones, MarcaAprendida,
MotorDecisiones, Opportunities, PublicationMonitor, ResumenDiario, ScriptHealth, StaleRunReaper,
VideoHiggsfield, VideoTipos, Vigilantes, WaBot. **Todos se mantienen**; los que dependen del motor de
paperclip (IssueRouter, StaleRunReaper, AgentEval, FeedbackAgent) se migran en la fase 6.

## Integraciones (se mantienen todas)

Meta Ads, Google Ads, Search Console + GA4, LinkedIn/TikTok (proveedores de ads), ClickUp (webhook,
provisioning, sync), Make (cadena de publicación, disparos), Google Drive (material, entregas), Apps
Script (planillas), NAS (WebDAV), CRM propio, WhatsApp (gateway + grupos), Hostinger + WordPress,
Higgsfield, Magnific, ElevenLabs, OpenAI/LiteLLM (render, visión, voz), MiniMax, Mercado Público.

## Funciones a medida que Naza nombró explícitamente (no negociables)

- Super Redes con Higgsfield y Magnific de respaldo; etiqueta «generar contenido» en ClickUp.
- Alta del cliente entero al crear su carpeta en ClickUp.
- Licitaciones (rutina de Carlos + initLicitaciones).
- Dashboards para compartir con el cliente; conexiones; plan de acción.
- Productor de contenido (HyperFrames, render aparte, NAS, Drive).
- Conector de Claude (admin y equipo).

## Archivos propios sobre paperclip

159 archivos agregados después del commit raíz en `server/src/{services,routes,agentes}`, `ui/src/app` y
`packages/mcp-server`. Lista completa: `git ls-files` contra `5c7547d`. Cualquier borrado de las fases 5–6
que toque uno de estos necesita una línea en este inventario diciendo dónde quedó.
