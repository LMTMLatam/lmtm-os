# Optimización del equipo de agentes (07/10/26)

Auditoría con la vara del "AI Agent Team Optimizer" que pasó Nazareno, sobre lo
que corre en producción (datos de los últimos 7 días, solo lectura). Regla que
manda sobre todo lo de abajo: **ninguna función propia se pierde** (Super Redes
con Higgsfield y Magnific de respaldo, alta del cliente desde ClickUp, secciones
del cliente, dashboards públicos, plan de acción, Growth, Pauta, informes,
licitaciones, conector de Claude). Lo que cambia es quién lo hace y cómo.

---

## A. Diagnóstico (ordenado por impacto)

| # | Problema | Dato | Efecto |
|---|---|---|---|
| 1 | **Un LLM hace vigilancia que ya hace el código.** Pablo corre "Revisión de inversiones de Meta" (9:00) y "Revisión de contenido programado" (10:00) todos los días. El motor de decisiones (8:30) y los monitores ya miden saldo y publicación. | Pablo abrió **71 tareas en 7 días: 28 bloqueadas** esperando una persona ("[HUMANO-BM] X — spendCap agotado, recargar"), 15 en backlog. | Hoy muestra **42 "esperando persona"** que repiten las decisiones de saldo del motor. Ruido humano + tokens. |
| 2 | **Despertares por reloj sin trabajo.** Los 14 agentes de paperclip tienen latido cada 30 min a 24 h. | **287 corridas de LLM por reloj** en 7 días. Delfina: 64, casi todas "no tengo PAPERCLIP_TASK_ID, ¿qué necesitás?". | Costo puro, cero resultado. |
| 3 | **Dos equipos para lo mismo.** Milo (paperclip) y el media buyer del runner; Caro y el rol contenido; Luna y el estratega. | El piloto A4 compara Milo vs runner hasta el 19/10 (a propósito). | Doble costo y propuestas duplicadas en Hoy hasta cerrar el piloto. |
| 4 | **Avisos que afirmaban lo que no se midió** (arreglado hoy, `2bf39c0`). | DUNOD "98 días sin postear" (no leemos su página desde el 01/07); "apagá el despachador"; fallas de Make del 2/10 repetidas a diario; monitores que corrían con cada deploy. | Desconfianza en el canal de WhatsApp. |
| 5 | **Herramientas de más.** Los 14 tienen 23–30 tools, todos pueden crear/actualizar issues. | Sin tope de creación de tareas por agente. | El tablero se llena (punto 1). |
| 6 | **El escalamiento no tiene dónde contestarse en el panel nuevo.** Un issue "blocked" espera a una persona, pero responderlo exige la pantalla vieja. | 42 en cola. | Lo que espera a una persona se pudre. |
| 7 | **Validación desigual.** El runner valida (esquema estructurado, ≥1 herramienta OK, evaluador por código, compuerta de pauta). La flota de paperclip no: sus comentarios y tareas no pasan por ningún chequeo (solo los entregables pasan `entrega-checks`). | — | Errores que siguen de largo. |
| 8 | **Trazas partidas.** `heartbeat_runs` (flota), `agente_trabajos` (runner), `wa_outbox` (avisos), `decisiones` (motor). | La decisión → trabajo sí está ligada (`ref = decision:<id>`); el resto no. | Reconstruir "qué pasó con X" exige 3 consultas. |
| 9 | **Falla de un punto:** el runner depende de MiniMax y de un binario global de Claude Code. | 19 fallas el 06/10 (binario + 401) antes del arreglo. | Si cae MiniMax, no investiga nadie. Hoy no hay respaldo. |

Lo que **está bien** y se mantiene: motor determinístico + cola en Postgres, compuerta de pauta con ensayo `validateOnly`, embudo de WhatsApp con política (nivel, dedupe, tope 3/día), evaluador por código, verificación por efecto (cadena de publicación), alta de clientes por webhook de ClickUp.

---

## B. Arquitectura actual

```text
                    ┌──────────── DETERMINÍSTICO (código) ────────────┐
ClickUp webhook ──► │ alta de cliente · sync pauta/orgánico · ClickUp  │
Meta/Google ──────► │ motor de decisiones 8:30 · ~25 monitores         │──► wa_outbox ─► WhatsApp (incidentes / resumen 9:00)
Make/Drive ───────► │ cadena de publicación · informes lunes 10:00     │──► decisiones ─► Hoy
                    └───────────────┬─────────────────────────────────┘
                                    │ disparadores / horarios / pedidos
                    ┌───────────────▼──────────────┐      ┌────────── PAPERCLIP (heredado) ───────────┐
                    │ RUNNER PROPIO (agente_trabajos)│      │ 14 agentes, latido por reloj, 12 rutinas │
                    │ media-buyer · contenido ·      │      │ issues ↔ issues (Pablo reparte)          │
                    │ estratega — MiniMax-M3         │      │ 23–30 tools c/u, crean tareas sin tope   │
                    │ esquema + compuerta + evaluador│      │ Milo · Caro · Luna · Carlos · Sergio …   │
                    └───────────────┬──────────────┘      └───────────────┬─────────────────────────┘
                                    └──────────► Hoy / aprobaciones ◄─────┘
```

---

## C. Arquitectura propuesta

```text
INPUT (datos, webhooks, reloj)
  │
  ▼
ORQUESTACIÓN = CÓDIGO ── motor de decisiones · horarios · pedidos desde el panel
  │  (decide QUÉ y A QUIÉN; sin LLM)
  ▼
EJECUCIÓN = RUNNER (pocos roles, cada uno con su allowlist de tools)
  media-buyer · contenido · estratega · operaciones · inteligencia
  │
  ▼
VALIDACIÓN = CÓDIGO ── esquema estructurado · ≥1 dato verificado · entrega-checks
  (links vivos, idioma, otro cliente) · compuerta de escritura · evaluador semanal
  │
  ▼
DECISIÓN HUMANA = HOY ── aprobar / descartar con motivo / responder
  │
  ▼
ACCIÓN con guardas (ensayo, topes 20%/día, marca protegida) → VERIFICACIÓN con el próximo dato
  │
  ▼
TRAZA = agente_trabajos (pasos, tokens) + decisiones (estado, motivo) + wa_outbox
MEMORIA = DB (brain del cliente, lecciones, historial de decisiones, datos operativos)
```

"El que decide no ejecuta": el motor decide, el rol ejecuta, el código valida, la persona aprueba lo que toca plata o al cliente.

---

## D. Agentes (propuesta)

| Agente | Responsabilidad | Tools | Input | Output | Autonomía |
|---|---|---|---|---|---|
| **Media buyer** (runner) | Investigar decisiones de pauta (gasto caído, sin leads, fatiga, escalar) y revisión diaria de los clientes piloto | Lectura de campañas, conjuntos, insights, saldo; `proponerAccionPauta` | Decisión del motor o horario | Causa + verificado/supuestos + siguiente paso + propuesta | L1 analizar · L2 cualquier cambio en la cuenta |
| **Contenido** (runner) | Calendarios (sin_calendario), guiones, ideas, Propuesta CM, tendencias con link verificado | Lectura de brain, Super Redes, orgánico, ganchos; guardar idea/tendencia (con validación) | Decisión `cadena:*`, horario, pedido | Calendario/brief listo para cargar | L1 borradores · L2 cargar en Super Redes y generar pieza |
| **Estratega** (runner) | Informe semanal, plan de acción, churn/upsell | Lectura de todo el cliente; escribir borrador de informe | Lunes, pedido | Lectura del informe + decisiones para humanos | L1 borrador · L2 envío al cliente |
| **Operaciones** (runner, *nuevo = fusión de Esteban + Nicolás + Dario*) | Arreglar lo técnico detectado por código: Apps Script caído (2 fallas seguidas), escenario de Make sin destino, sync parado | Lectura de Make, Apps Script, sync_logs; cambios solo con aprobación | Disparador determinístico | Diagnóstico + arreglo propuesto | L1 diagnosticar · L2 tocar Make/Script |
| **Inteligencia** (runner, *= Carlos*) | Licitaciones, competencia, radar de nichos | Búsqueda, ganchos, informes de nicho | Horario | Informe + ideas al baúl | L1 |
| Pablo (PM / triage) | **Se retira**: lo reemplaza el motor + la cola (código) | — | — | — | — |
| Delfina, Ana, Roxana | **Se retiran**: datos y reportes los cubren consultas en los roles y los informes por código | — | — | — | — |
| Bianca, Carla, Sergio | **A pedido** (sin latido): marca, CRO y el blog SEO pasan a procedimientos de contenido/estratega | — | Pedido | — | L1 |

Cada rol nuevo justifica su existencia con un disparador determinístico que hoy no tiene dueño; si no lo tiene, no se crea.

---

## E. Workflows

**1. Plata parada / gasto caído**
`motor 8:30 (SQL)` → decisión con $/día → `media-buyer` (tools de lectura) → validación: esquema + ≥1 herramienta OK + sin etiquetas raras → hallazgo en Hoy y en el resumen 9:00 → si propone tocar la cuenta: aprobación en Hoy → ensayo `validateOnly` → ejecución con topes → el próximo dato la pasa a "verificada" → traza en `agente_trabajos` + `decisiones`.

**2. Saldo bajo / cuenta frenada** (sin LLM)
`motor` → decisión responsable "cliente" con días de autonomía → Hoy: "Avisar al cliente" (L2, una persona) → el próximo sync confirma la recarga. *Hoy lo duplica Pablo con issues [HUMANO-BM]: se retira esa rutina.*

**3. Cliente sin calendario → pieza publicada**
`cadena de publicación` (efecto real) → decisión `cadena:sin_calendario` → `contenido` propone calendario (sin inventar claims; revisión propia) → persona lo carga en Super Redes → **Generar** en Contenido (vista previa del pedido, después Higgsfield plan/API, Magnific de respaldo en placas) → aprobación en ClickUp → despachador de Make → verificación en `organic_posts`.

**4. Informe semanal**
Lunes 10:00 borrador por código → 11:00 `estratega` agrega la lectura → gate binario (datos, período, cálculos) → persona aprueba el envío.

**5. Alta de cliente** (sin LLM salvo F2)
ClickUp `folderCreated` (HMAC) → `provisionClientFromClickUp` → F1/F2 enfoque técnico → decisiones de cobertura (`sin_meta`, `fallando`) hasta que el cliente esté completo.

**6. Avisos**
Monitores (código, una vez por día persistido) → embudo (`politica.ts`: nivel 5 solo incidentes, dedupe 24 h, tope 3/día) → incidentes al momento / resto al resumen 9:00, uno por tema.

**7. Algo técnico roto**
`script-health` (2 fallas seguidas) / `cadena` (destino sin escenario) / `sync_logs` (partes fallidas) → trabajo `operaciones` → diagnóstico → L2 arreglo → el monitor del día siguiente confirma.

---

## F. Memoria

| Qué | Dónde | Quién escribe |
|---|---|---|
| Contexto de la tarea | Entrada del trabajo (`agente_trabajos.entrada`) | Código al encolar |
| Conocimiento del cliente (marca, objetivos, voz, servicios) | `client_brain` / memorias pinneadas | Personas (gana) y agentes (con fuente) |
| Lecciones del equipo | `team_lessons` | Agentes + evaluador |
| Historial de decisiones y motivos de descarte | `decisiones` | Motor + personas |
| Datos operativos (pauta, orgánico, ClickUp, Make) | Tablas propias (`ads_insights`, `organic_posts`, …) | Syncs |
| Documentos (enfoque técnico, planes, informes) | `agent_deliverables` / Drive | Roles + código |
| Vector DB | **No hace falta todavía**: el volumen entra por cliente en una consulta. Se suma si un rol necesita buscar en miles de documentos. | — |

Nunca en la conversación del agente lo que tiene que vivir en una tabla.

---

## G. Human-in-the-loop

- **L1 autónomo:** analizar, investigar decisiones, borradores (calendario, informe, guion), ideas al baúl, tareas internas, avisos al resumen.
- **L2 aprobación en Hoy:** todo cambio en una cuenta de pauta (pausar, presupuesto, negativas), generar piezas pagas (Higgsfield/Magnific), cargar en Super Redes, enviar algo al cliente (informe, WhatsApp), tocar Make o Apps Script.
- **L3 solo personas:** recargar saldo / medios de pago, altas y bajas de clientes y contratos, credenciales y tokens, borrar datos, escribir en las planillas del cliente (apagado en código).

---

## H. Errores y fallbacks

| Cuando… | Hoy | Falta |
|---|---|---|
| Un agente falla | Reintento solo; el fallo queda en Agentes con el paso que rompió | Tope de reintentos por decisión (hoy reencola indefinido si la decisión sigue viva) |
| Una API falla | Monitores "ciegos": no afirman nada (cadena, make-disparos, sync) | Igual en todos los monitores viejos (auditor) |
| Faltan datos | `null` nunca 0; "no sabemos" explícito | — |
| Poca confianza | Supuestos separados de lo verificado; cero herramientas OK = fallo | — |
| Validación falla | El resultado no se usa; vuelve al agente (entregables) | Devolver al rol del runner con el motivo y reintentar 1 vez |
| Info contradictoria | El hecho medido gana sobre la etiqueta (verificación por efecto) | — |
| Cae MiniMax | Nada | Modelo de respaldo para el runner |

---

## I. Costo

- **Latidos sin trabajo:** 287 corridas/semana por reloj. Subir el latido a 12 h (o apagarlo en los que no tienen rutinas) recorta ~80% de esas corridas.
- **Rutinas duplicadas de Pablo:** 2 corridas diarias + ~70 tareas/semana que después despiertan a otros agentes (`issue_assigned`) y a personas.
- **Flota vs runner:** la flota consumió ~29 M tokens de entrada en 7 días; el runner, ~2 M para 62 trabajos. El runner es ~10× más barato por resultado porque arranca con la pregunta y los datos, no con "¿qué hay para hacer?".
- **Avisos:** la misma lista se recalculaba con cada deploy (Make, ClickUp, Drive): ahora una vez por día.

---

## J. Roadmap

### Fase 1 — Quick wins (esta semana)
| Qué | Depende de | Complejidad | Impacto |
|---|---|---|---|
| Avisos honestos y sin repetir (hecho, `2bf39c0`) | — | baja | alto |
| Contenido en la app nueva con Super Redes y generar (hecho, `4d00e27`) | — | media | alto |
| Pausar las 2 rutinas de Pablo que duplican al motor | — | baja | alto (−28 bloqueadas/semana) |
| Latido de la flota a 12 h | — | baja | medio (costo) |
| Responder desde Hoy lo que espera a una persona | API de comentarios | media | alto |
| Hoy por tema (Plata, Contenido, Conexiones, Respuestas) con la acción a la vista | — | media | alto |

### Fase 2 — Automatización avanzada
Rol **operaciones** con disparadores de script-health/cadena/sync; procedimientos de contenido para Propuesta CM, guionista y tendencias (de Caro al runner); estratega con plan de acción (de Luna); validación que devuelve al rol con motivo; modelo de respaldo.

### Fase 3 — Autonomía
Cerrar el piloto el 19/10 con el evaluador: si el runner ≥ Milo, Milo se retira y `proponerAccionPauta` queda como única puerta. Inteligencia (Carlos) al runner. Autonomía L2→L1 solo por tipo de acción con historial verificado (ej. negativas de búsqueda con 30 días sin rechazos).

### Fase 4 — Sistema integrado
Retiro de paperclip (C3): issues → decisiones + trabajos; una traza única por decisión (motor → trabajo → aprobación → acción → verificación); el panel nuevo como única superficie.

---

## Datos que faltan para decidir mejor

- **Costo real por token de MiniMax/GLM**: `usage_json.costUsd` lo calcula el CLI con precios de Claude, no sirve como costo.
- **Qué rutinas de la flota usa de verdad el equipo** (ej. "Auditoría de perfil y creatividad" no corre desde el 12/07).
- **Respuesta del cliente** a los avisos de saldo: sin eso no se puede medir si "Avisar al cliente" funciona.
