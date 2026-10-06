# Investigación: equipos de agentes, empresas y agencias manejadas por IA

06/10/2026. Pedido de Nazareno: "investigar equipos agénticos, empresas manejadas
por agentes de IA y agencias de marketing manejadas así, en GitHub e internet,
y basarnos en eso con nuestras herramientas, manteniendo lo que pedí".

## Qué se miró

| Fuente | Qué es | Por qué importa |
|---|---|---|
| [Project Vend fase 2](https://www.anthropic.com/research/project-vend-2) (Anthropic + Andon Labs) | Claude maneja un negocio real (kiosco) con CRM, inventario y un "CEO" agente | El caso más documentado de negocio real manejado por agentes; pasó de perder plata a ganar |
| [Polsia](https://timfrin.substack.com/p/how-polsia-builds-and-runs-companies) | Plataforma que corre más de 1.000 empresas con agentes, USD 1M ARR | Ciclo nocturno + resumen a la mañana a escala |
| [HurumoAI / Shell Game](https://www.rdworldonline.com/a-journalist-created-a-startup-run-almost-entirely-by-ai-agents/) (Evan Ratliff) | Startup con empleados agentes durante 6 meses | El catálogo de lo que sale mal |
| [TheAgentCompany](https://futurism.com/professors-company-ai-agents) (Carnegie Mellon) | Empresa de software simulada solo con agentes | Techo medido: el mejor agente completó 24% de las tareas reales (34% contando las parciales) |
| [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | Lo que usamos hoy: organigrama, tickets, heartbeats | Es "la empresa como organigrama"; lo que se deja atrás |
| [Agent Inbox / ambient agents](https://www.langchain.com/blog/introducing-ambient-agents) (LangChain) | Agentes que se despiertan por hechos y piden a la persona solo avisar, preguntar o aprobar | La forma de Hoy |
| [16 patrones de interfaz para agentes](https://www.setproduct.com/blog/ai-agent-ui-design-patterns) | Planes, aprobaciones, registro de pasos, deshacer | Cómo se ve lo que hace un agente |
| [Playbook de agentes en Meta Ads](https://superscale.ai/learn/how-to-automate-meta-ads-ai-agents/) y [ad-ops agéntico](https://www.digitalapplied.com/blog/agentic-advertising-2026-ai-ad-ops-playbook) | Cómo operan las agencias y plataformas de pauta con agentes en 2026 | Escalones de autonomía, topes, registro con motivo |
| [Ranking de plataformas de marketing agéntico](https://superscale.ai/compare/best-agentic-marketing-platforms) (Hyper, Ryze, Smartly, Pixis) | Productos que manejan pauta de clientes con agentes | Qué hace hoy el mercado |
| [agency-agents](https://github.com/msitarzewski/agency-agents) | 230 roles de "agencia" en Markdown (incluye pauta y redes) | Formato de definición de rol |
| [Marketing skills](https://github.com/coreyhaines31/marketingskills), [hyperfx marketing-skills](https://github.com/hyperfx-ai/marketing-skills) | Skills de marketing para Claude Code | Procedimientos reutilizables |
| [google/adk-samples marketing-agency](https://github.com/google/adk-samples/tree/main/python/agents/) | Agencia de ejemplo con el kit de agentes de Google | Coordinador + especialistas |
| [Comparativa de frameworks](https://www.firecrawl.dev/blog/best-open-source-agent-frameworks) (LangGraph, CrewAI, OpenAI Agents SDK, Claude Agent SDK, ADK) | Con qué se construyen los equipos de agentes | Qué motor usar |
| [Ejecución durable para agentes](https://hackernoon.com/durable-execution-for-ai-agents-langgraph-dbos-inngest-and-temporal-compared), [pg-boss](https://github.com/timgit/pg-boss), [graphile-worker](https://github.com/graphile/worker) | Colas sobre Postgres | Dónde vive el trabajo de los agentes |
| [Google Ads MCP oficial](https://github.com/googleads/google-ads-mcp) (solo lectura), Meta Ads MCP oficial (abril 2026, escribe) | Conectores oficiales de las plataformas | Si conviene reemplazar nuestras herramientas |

## Lo que aprendimos (y qué hacemos con cada cosa)

**1. El código detecta, el agente investiga y propone, la persona decide lo
irreversible.** Ni el mejor modelo pasa del 34% en tareas de oficina largas
(TheAgentCompany). Los que funcionan (Vend fase 2, Hyper, Ryze) le dan al agente
tareas chicas, con datos estructurados y herramientas. Nosotros ya tenemos la
mitad: el motor de decisiones detecta en código. Falta que el agente **investigue
cada decisión antes de que llegue a una persona**: hoy Hoy dice "Averiguar por
qué dejó de gastar" y se lo pasa al equipo; el agente puede mirar las campañas y
volver con la causa.

**2. Se despiertan por hechos, no por reloj.** Los agentes ambientales de LangChain
y el ciclo nocturno de Polsia arrancan cuando pasa algo: llegó data, se abrió una
decisión, se cayó una conexión. Medido acá: de 698 corridas por reloj en 14 días,
ninguna tenía trabajo. El reloj queda solo para lo que es de calendario (informe
del lunes).

**3. A la persona se le habla de tres formas: avisar, preguntar, aprobar.**
Es el modelo de Agent Inbox. Hoy pasa a ser eso: una bandeja con lo que hay que
aprobar, lo que el agente necesita saber para seguir y los avisos. Nada de chat
por agente ni de tickets.

**4. Roles chicos con procedimiento escrito.** En Vend, el especialista en
merchandising funcionó "en parte por la clara separación de roles", y lo que más
mejoró los resultados fueron los procedimientos obligatorios (averiguar el costo
antes de poner precio). Cada rol de LMTM se define en un archivo versionado en git
(misión, reglas, procedimiento, entregable, cómo se mide), no en la base ni en un
organigrama.

**5. El supervisor es código, no otro agente.** El "CEO" de Vend, del mismo modelo
que el empleado, aprobó 8 veces más pedidos laxos de los que rechazó: comparten
los mismos sesgos. Nuestro evaluador de propuestas es determinístico (reglas del
playbook contra `metricas`) y ya midió 91% en el piloto. Se queda como el
supervisor de todo rol que toca pauta.

**6. Autonomía gobernada, por escalones y por cliente.** Todas las plataformas de
pauta serias (Smartly, Pixis, Superscale) arrancan en solo lectura y suben por
etapas: proponer → mover presupuesto dentro de topes → rotar creativos → generar.
Topes duros (gasto diario, escalón máximo de 20%), cambios en tanda para no
reiniciar el aprendizaje, botón de apagar, y **registro de cada acción con su
motivo y cómo deshacerla**. Coincide con nuestros N0–N3; falta que el escalón se
aplique en el motor (no en el prompt) y se vea en la interfaz.

**7. La memoria vive en la base, no en la cabeza del agente.** HurumoAI falló por
memoria: los agentes asignaban tareas y se olvidaban, inventaban avances, y una
broma sobre un "offsite" terminó en 150 mensajes entre agentes. Regla: el estado
(qué se investigó, qué se propuso, qué se hizo) está en tablas; los agentes no
conversan entre sí libremente; todo lo que dicen haber hecho se verifica por
efecto (ya es regla nuestra).

**8. Ciclo nocturno y resumen a la mañana.** Polsia corre un ciclo por la noche y
manda un mail a la mañana con lo que hizo y lo que sigue. Nuestro resumen de las
9:00 pasa a decir también lo que los agentes ya investigaron y resolvieron
durante la noche, no solo lo que falta.

**9. Lo que muestra la interfaz de un agente.** Registro de pasos con estado,
cada herramienta usada como tarjeta (qué pidió, qué volvió), motivo resumido,
aprobación por niveles (leer / escribir / irreversible), aprobar en tanda,
"qué está verificado y qué es supuesto" al final, y deshacer por acción.

## Qué tomamos y qué no

| Tomamos | No tomamos |
|---|---|
| Motor: el harness de Claude Code como librería (Claude Agent SDK) apuntado a MiniMax/GLM, sin API key de Anthropic. Es el mismo CLI que ya corre los agentes, pero manejado desde nuestro código: permisos por herramienta, topes de turnos, registro de cada paso | LangGraph/CrewAI: suman un segundo lenguaje de orquestación sin resolver nada que el SDK y nuestras reglas no resuelvan |
| Cola sobre Postgres con `FOR UPDATE SKIP LOCKED` (el patrón de pg-boss y graphile-worker), en una tabla propia | Temporal, Inngest: infraestructura nueva para 6 roles |
| Bandeja avisar / preguntar / aprobar (Agent Inbox) | Chat por agente como interfaz principal |
| Formato de rol en Markdown (agency-agents) con procedimiento obligatorio (Vend) | Organigrama y jefes agentes (paperclip, el CEO de Vend) |
| Escalones de autonomía con topes y registro con motivo (Smartly, Superscale) | Autonomía total desde el día uno |
| Nuestras herramientas de pauta con guardas | Reemplazarlas por los MCP oficiales: el de Google es solo lectura y el de Meta no trae nuestras guardas ni el evaluador. Se puede sumar el de Meta más adelante para subir creativos |

## Qué se mantiene sí o sí (pedido del 06/10)

Todo lo de cada cliente (secciones de la ficha, plan de acción, panel público
para compartir con slugs iguales, conexiones de todas las plataformas), y toda
función propia que aporta al flujo: métricas únicas, decisiones y su ciclo,
informe semanal y su auditoría, resumen de WhatsApp, Growth, Pauta, reporte a
ClickUp, onboarding de ClickUp, cadena de publicación, voz de marca, memoria por
cliente, escritura en pauta con guardas, piloto y evaluador, conector de Claude.
Lista completa en `PLAN.md` ("Qué se mantiene") y la auditoría en `PLAN-C.md`.
