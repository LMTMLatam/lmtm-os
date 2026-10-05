# LMTM-OS 2.0: plan de rediseño

Versión técnica del plan. Leer junto con `CONTEXTO.md`. Fecha: 05/10/2026.

## Por qué

El 02/10 el dueño de la agencia dijo, en dos audios:

1. Está frustrado con el panel y siente que están trabados.
2. En Distrillantas los agentes sugerían cosas de una inmobiliaria: hay datos cruzados.
3. Hay información que deberían tener los agentes y no él. No hay un perfil de
   decisor ni un tablero para decidir ("hay que hacer esto, dale, voy y lo hago").
4. Se desconectó el WhatsApp de Distrillantas y no se enteró, porque el sistema
   manda tantos mensajes que ya no los mira.
5. Lo que sale no sirve para mandarle a un cliente ni como alerta: CPC y CTR
   sueltos, sin análisis cruzado.
6. El dashboard es feo y complejo. Está por desactivar el panel.

Esas seis cosas no se arreglan con otra pantalla. Tienen seis causas:

| Lo que ve el jefe | Causa de fondo | Evidencia |
|---|---|---|
| Datos cruzados, números que no cierran | Los datos no son confiables ni están aislados por cliente | Leads inflados 43%, 190.978 ventas falsas, sync que borraba 90 días, segundo escritor sin `client_id`, token de Meta compartido entre 4 companies del CRM |
| Lo tengo que saber yo | Los agentes procesan tickets, no tienen objetivos | 927 issues en 30 días, 249 bloqueados, 145 esperando a una persona, 160.799 despertares inútiles por semana |
| No me enteré de lo importante | Las salidas son ruido | 14 módulos mandando WhatsApp directo (ya existe `wa_outbox`) |
| No hay donde decidir | Cada módulo es una página | 72 páginas; la decisión está repartida en informe ejecutivo, costo de no hacer, plan de acción, cartera, cola humana |
| No hay análisis | Falta el cruce pauta → lead → calidad → venta | CRM en 5 de 59 clientes; `contacts.ad_id` en 0 de 261; sin objetivo (TCPL) por cliente |
| Estamos trabados | La plataforma es difícil de cambiar | 133 tablas, 199 servicios, `ads.ts` de 4.270 líneas, deploys desde un árbol sin commitear, tests del upstream que no corren |

## Qué se mantiene

### Funciones vitales hechas a medida (se migran, no se reescriben desde cero)

1. Verificador de la cadena de publicación (verifica en la red, no en Make).
2. Costo de no hacer e informe ejecutivo (acciones ordenadas por ARS/día parados).
3. Fórmulas correctas de leads y conversiones (`leadsFromActions`, `conversionsFromActions`).
4. Panel público por cliente. Los slugs no cambian.
5. Monitor de saldo (`mereceAvisoDeSaldo`: no poder juzgar no autoriza a ocultar).
6. Cola humana (escala a los 3 días, vence a los 21).
7. Guardas de planillas y listas de ClickUp protegidas.
8. Escritura en pauta con guardas: pausar, negativas, keywords; presupuesto y
   duplicar con aprobación (`ads-budget`, `ads-duplicar`, `ads-propuestas`).
9. `wa_outbox` (niveles, dedupe, tope).
10. Onboarding de ClickUp (F1 + F2 generan el Enfoque Técnico).
11. Voz de marca aprendida de los copys publicados (lo que carga una persona gana).
12. Reglas por red social antes de la fecha de publicación.
13. Brain por cliente (`client_memory`) y benchmarks por rubro.
14. Video por etiqueta de ClickUp (Higgsfield) y arte (Freepik/Magnific).

### Conexiones (todas se mantienen)

Meta Ads, Google Ads (MCC), Meta orgánico (Facebook/Instagram), ClickUp, Make
(incluido el despachador), Google Drive/Sheets/Apps Script (127 scripts por
cliente), WhatsApp (gateway propio y WABA del CRM), CRM propio, Tokko, Kommo,
Higgsfield, Magnific/Freepik, NVIDIA (visión), Pinterest y YouTube vía Make.

## Arquitectura nueva

```
Fuentes (Meta, Google, CRM, ClickUp, Make, WhatsApp, Sheets)
   │  webhooks donde hay; polling como respaldo
   ▼
[1] INGESTA  servicio aparte `lmtm-ingest`
   capa cruda append-only (payload + fetched_at) → tablas limpias por upsert
   `fuentes_salud`: frescura y filas esperadas por cliente × fuente
   ▼
[2] MÉTRICAS  un solo módulo define cada número
   leads, calificados (CRM), CPL, costo por calificado, costo por venta,
   frecuencia, fatiga. Probado contra la capa cruda.
   + objetivos por cliente (TCPL, presupuesto, perfil del decisor)
   ▼
[3] DECISIONES  motor de reglas determinístico
   cada decisión: cliente, qué, por qué (evidencia), ARS/día, responsable,
   acción ejecutable, vencimiento. Ciclo: abierta → aprobada → ejecutada → verificada
   ▼
[4] AGENTES  Claude Managed Agents
   objetivos por cliente, memoria por cliente, herramientas con aislamiento
   y aprobación por monto, salidas evaluadas contra una rúbrica
   ▼
[5] SUPERFICIES
   Hoy (decidir) · Cartera (59 clientes) · Cliente · Informe para el cliente
   Avisos: solo nivel 5 interrumpe; un resumen diario
```

### 1. Ingesta: cómo traemos la info

- Servicio Railway nuevo `lmtm-ingest` (mismo repo, otro comando de arranque).
  Los syncs dejan de correr dentro del servidor web.
- Capa cruda append-only: `raw_meta_insights`, `raw_google_insights`,
  `raw_organic`, `raw_crm`. Nunca se borra. Las tablas limpias se recalculan desde
  ahí (es el método de auditoría que funcionó, ahora como diseño).
- Upsert por clave natural en vez de delete + insert.
- `fuentes_salud`: por cliente y fuente, último dato, filas esperadas vs reales,
  estado. Reemplaza los monitores sueltos.
- Cobertura como métrica de primera clase: matriz cliente × fuente. Los 32
  clientes sin Meta mapeado se vuelven decisiones con responsable.
- Webhooks donde existen (leads de Meta, WhatsApp, ClickUp); polling de respaldo.

### 2. Métricas: cómo usamos la info

- Módulo `server/src/metricas/`. Ninguna pantalla ni agente calcula una métrica
  por su cuenta.
- Contrato (implementado en A2, `server/src/metricas/index.ts`):
  ```ts
  metricasCliente(db, clientId: string, { desde, hasta, plataforma?: "meta" | "google" }) => Promise<{
    inversion: number | null, impresiones: number | null, clics: number | null,
    alcance: null, frecuencia: null,          // el alcance diario no se suma; hasta que la ingesta traiga el del período
    leads: number | null, leadsCalificados: null,   // no hay datos del CRM en esta base todavía
    ventas: number | null,                    // compras de Meta, solo si hay seguimiento de compras
    cpl: number | null, costoPorCalificado: null, costoPorVenta: number | null,
    objetivo: { tcpl: number | null, tcplFuente: "cliente" | "historial" | "rubro" | null, presupuestoMensual: number | null },
    frescura: Array<{ fuente: "meta_ads" | "google_ads" | "organico"; ultimoDato: string | null;
                      estado: "sin_conexion" | "fallando" | "sin_entrega" | "atrasada" | "ok" }>,
  }>
  ```
  `null` cuando no se puede medir: sin cuenta conectada, inversión y leads son
  null, no 0. Las conversiones de Google no cuentan como ventas (en varias
  cuentas son cualquier acción).
- Objetivo por cliente, en orden: el que fijó una persona
  (`clients.metadata.cplObjetivo`, que ya tiene ruta de escritura y lector);
  si no hay, CPL de 30 días × 0,8 cuando hay al menos 10 leads (`historial`); si
  no, el ideal del rubro (`rubro`). Siempre con su fuente, para que nadie
  presente un número calculado como si lo hubiera pedido el cliente. Se descartó
  una tabla `objetivos_cliente`: duplicaría el lugar donde vive el objetivo.
  Presupuesto mensual: `clients.metadata.presupuestoMensual`.
- Consistencia: `server/src/metricas/consistencia.ts` recalcula leads y ventas
  desde `raw` todos los días (db-maintenance) y avisa en nivel 4 si algo no cierra.
- Leads calificados: del CRM donde está (5 clientes). Reactivar la atribución
  anuncio → lead (`contacts.ad_id`). Pendiente: el CRM vive en otra base.

### 3. Decisiones

- Tabla `decisiones` (dueño: chat B):
  `id, client_id NOT NULL, tipo, que, porque jsonb, ars_por_dia numeric null,
  responsable (equipo|cliente|agente), estado (abierta|aprobada|ejecutada|verificada|descartada|vencida),
  creada_por (regla:<nombre>|agente:<id>), accion jsonb null, vence_at,
  motivo_descarte, verificada_at, created_at`.
- Reglas iniciales: las que ya existen (cadena de publicación, saldo, costo de no
  hacer, cola humana, cobertura) más las de pauta del playbook:
  - sin datos suficientes por debajo de 3 × TCPL de gasto: esperar;
  - 0 leads con 3 × TCPL gastado: cambiar el concepto;
  - calificados < 40% (con CRM): cambiar el ángulo;
  - costo por calificado > 1,5 × TCPL dos semanas: reemplazar;
  - frecuencia > 2,5 en prospección fría: avisar; > 4: reemplazar;
  - escalar de a 20% como máximo, con 3 a 5 días entre subidas.
- Al marcar "ejecutada", la decisión se re-chequea con el próximo dato. Recién
  entonces pasa a "verificada".
- Descartar exige un motivo. Los motivos alimentan el aprendizaje de las reglas.

### 4. Agentes: dónde corren y cómo se vuelven agénticos

**Hoy:** Claude Code CLI dentro del contenedor web, modelos baratos vía proxy,
600 s por corrida, despertados por tickets. Comparten CPU y memoria con el
servidor web.

**Mañana:** Claude Managed Agents.

| Necesidad | Qué da Managed Agents |
|---|---|
| Configuración versionada y con rollback | Agentes como objetos versionados, definidos en archivos (`ant apply`) |
| Rutinas | Deployments programados (cron) con registro por corrida |
| Calidad antes de mostrar algo | Outcomes: un evaluador itera contra una rúbrica hasta que pasa |
| Memoria por cliente | Memory stores |
| Credenciales fuera del prompt | Vaults (se sustituyen al salir, el agente nunca las ve) |
| Herramientas propias | MCP: el servidor MCP de LMTM es la única puerta a datos y acciones |
| Coordinación | Sesiones multiagente con coordinador |
| Tope de gasto | Presupuesto en dólares por sesión, aplicado por la plataforma |

**Cómo se vuelven agénticos:**

1. Objetivo por cliente en vez de tickets. "Bajar el costo por calificado de
   Distrillantas a TCPL sin perder volumen", con rúbrica.
2. Se despiertan por hechos: llegó data nueva, se creó una decisión, se cayó una
   conexión. Los relojes quedan de respaldo.
3. Actúan con herramientas, con autonomía por escalones:
   - N0: proponen (todo arranca acá);
   - N1: ejecutan lo reversible hasta X ARS/día;
   - N2: ejecutan y avisan después;
   - N3: siempre con aprobación humana.
   El escalón es por cliente y sube con el historial.
4. Verifican por efecto. Después de actuar, miran el próximo dato.
5. Memoria curada con fuente, fecha y confianza. Lo dudoso va marcado como supuesto.

**Plantel: de 14 personajes a 6 roles con objetivo.**

| Rol nuevo | Reemplaza a | Qué entrega |
|---|---|---|
| Estratega de cuenta (coordinador por cliente) | Luna, Pablo, Roxana, Delfina | Decisiones priorizadas, informe semanal, próximo paso |
| Media buyer (Meta + Google) | Milo, Carla | Propuestas de pauta ejecutables, fatiga, presupuesto |
| Contenido y marca | Caro, Bianca, Sergio | Calendario, copys con la voz del cliente, briefs de arte y video |
| Inteligencia de mercado | Carlos | Competencia, tendencias, licitaciones |
| Operaciones y CRM | Esteban, Ana, Nicolás | Salud de integraciones, atribución, diagnóstico |
| Auditor (evaluador) | nadie hoy | Revisa toda salida para un cliente: sin datos de otro cliente, números iguales a los de `metricas`, accionable |

Dario (tableros) desaparece: los tableros pasan a ser código.

**Modelo y costo.** Por defecto Claude Opus 5.5. El costo se mide en el piloto
contra el ritmo actual (~USD 1.750/mes; presupuesto USD 4.650). Palancas: menos
agentes y corridas, el motor de reglas hace las cuentas (los agentes leen
decisiones, no tablas crudas), prompt caching, esfuerzo bajo para lo rutinario,
batch para el análisis nocturno, tope por sesión. Si el piloto muestra que hace
falta bajar costo, la opción es Claude Sonnet 5.5 en los roles de volumen. Esa
decisión es de LMTM, con el número del piloto en la mano.

**Decisión del 05/10: por ahora sin API key de Anthropic.** Managed Agents queda
como destino, no como punto de partida. Las fases A4 y A5 se hacen sobre el motor
actual (Claude Code dentro del contenedor, MiniMax/GLM) y lo agéntico se logra con
lo que no depende del motor: objetivo y rúbrica por cliente, herramientas MCP que
exigen `client_id`, decisiones (`lmtm_proponer_decision`) en vez de tickets,
despertar por hechos, piloto en sombra y set de evaluación. Todo eso se porta tal
cual a Managed Agents el día que haya key: las herramientas son las mismas (MCP),
cambia dónde corre el ciclo.

**Migración:** estrangulamiento, no big bang. Paperclip sigue corriendo; se
migra un rol por vez, en sombra primero (el agente nuevo propone, no ejecuta, y
se compara con lo que hizo el equipo), y se apaga el rol viejo cuando el nuevo
lo supera en la evaluación.

### 5. Superficies

Tres pantallas para decidir más una de operación:

1. **Hoy** (para el decisor, pensada para el celular): decisiones ordenadas por
   ARS/día en juego, cada una con su evidencia, responsable y botones Aprobar /
   Asignar / Descartar. Arriba, solo los incidentes de nivel 5. Abajo, cobertura.
2. **Cartera**: los 59 clientes. Salud (frescura de datos, objetivo vs real,
   contenido, CRM), tendencia, responsable, próxima decisión. Orden por plata en
   riesgo.
3. **Cliente**: objetivo vs real en costo por calificado (no en CTR), embudo
   pauta → lead → calificado → venta, qué se hizo y qué se aprendió en la semana,
   decisiones pendientes, calendario.
4. **Operación** (para Nazareno): salud de fuentes, agentes, costos.

El **informe para el cliente** sale de la misma data que la pantalla Cliente:
link público con los slugs actuales, narrativa semanal escrita por el estratega
con números que vienen de `metricas` (nunca inventados) y revisada por el auditor.

**Avisos:** solo el nivel 5 interrumpe (conexión caída de un cliente que paga,
saldo agotado con pauta activa, fuente sin datos más de 24 h). Todo lo demás va a
un resumen diario a las 9:00 con links a Hoy. Objetivo: 3 interrupciones por día
como máximo en toda la agencia.

**Diseño:** una identidad visual, reglas de visualización de la skill dataviz (un
solo eje, colores de estado reservados y siempre con ícono y texto, tooltips,
modo oscuro elegido y no invertido), textos en castellano desde el lado de quien
usa. De 72 páginas a unas 8. Las viejas se apagan cuando la nueva cubre su uso.

La guía que hay hoy en el repo (`.claude/skills/design-guide`) es la de Paperclip:
un panel de control denso, oscuro y pensado para teclado, hecho para
desarrolladores. Esa estética es parte de por qué el jefe lo ve "feo y complejo".
Se queda para la pantalla de Operación. Hoy, Cartera, Cliente y el informe para el
cliente llevan un sistema propio de LMTM (claro, aireado, legible en el celular,
la plata y el estado primero), que se documenta como skill nueva en
`.claude/skills/lmtm-diseno/` antes de construir las pantallas. Mismo stack
(Tailwind 4 + shadcn + radix), otros tokens.

## Plataforma

- Mismo repo, misma DB, mismo proyecto Railway. Servicios: `lmtm-os` (web + API),
  `lmtm-ingest` (nuevo), `lmtm-postgres`. El gateway de WhatsApp sigue como sidecar.
- Cola de trabajos sobre Postgres (sin infraestructura nueva).
- Deploy desde GitHub `main` por CI. Se terminan los `railway up` desde árboles
  locales.
- Se excluyen del CI los tests del upstream que no corren en nuestra infraestructura.
- Se borra lo que el rediseño deja sin uso, en el mismo PR que lo reemplaza.

## Fases

| Fase | Semanas (estimado) | Dueño | Sale cuando |
|---|---|---|---|
| 0. Asentar | 1 | Nazareno | Todo pusheado; CI deploya desde `main`; credenciales rotadas; rol de solo lectura; los 4 accesos de Google arreglados; TCPL cargado en los 10 clientes con más inversión |
| A1. Salud de fuentes | 1-3 | Chat A | `saludFuentes()` clasifica cliente × fuente (sin_conexion, fallando, sin_entrega, atrasada, ok) y ninguna parte del sync falla sin dejar registro. La capa cruda separada se posterga: `ads_insights.raw` ya permite recalcular (0 diferencias) |
| A2. Métricas + objetivos | 2-3 | Chat A | `metricasCliente` con tests contra crudo; 0 diferencias en el chequeo de consistencia |
| A3. Aislamiento por cliente | 2-4 | Chat A | `client_id NOT NULL` en tablas por cliente; toda herramienta exige y filtra por cliente; test de contaminación en CI |
| B1. Motor de decisiones | 2-4 | Chat B | Las reglas existentes y las de pauta escriben en `decisiones`; ciclo hasta "verificada" |
| B2. Hoy + avisos | 3-5 | Chat B | El decisor aprueba desde el celular; ejecuta por las rutas con guardas; ≤ 3 interrupciones/día |
| A4. Agentes con objetivo (piloto, motor actual) | 4-7 | Chat A | Media buyer en sombra 2 semanas en 3 clientes; eval aprobado; costo medido |
| B3. Cartera + Cliente + informe | 5-8 | Chat B | Informe semanal para clientes desde `metricas`, revisado por el auditor |
| A5. Resto de roles | 7-10 | Chat A | Cada rol nuevo supera al viejo en el eval; paperclip apagado por rol |
| B4. Diseño + retiro de páginas | 7-10 | Chat B | 72 → ~8 páginas |

## Métricas de éxito

| | Hoy | Objetivo |
|---|---|---|
| Diferencias crudo vs guardado | 0 (desde el 21/09) | 0, como test en CI |
| Clientes con Meta mapeado | 27 de 59 | 55 de 59 |
| Interrupciones por WhatsApp | sin medir; "mensaje, mensaje, mensaje" | ≤ 3 por día |
| Decisiones con acción en 48 h | no existe | ≥ 70% |
| ARS/día parados | 122.231 en 12 clientes (última medición) | en baja mes a mes |
| Salidas que pasan el auditor | no existe | ≥ 90% |
| Incidentes de datos cruzados | ocurrió (Distrillantas) | 0 |
| Costo de agentes por mes | ~USD 1.750 | ≤ USD 4.650, con menos corridas y más útiles |

## División del trabajo en dos chats

| | Chat A: Datos y agentes | Chat B: Decisiones y tablero |
|---|---|---|
| Fases | A1-A5 | B1-B4 |
| Carpetas propias | `server/src/ingest/`, `server/src/metricas/`, `packages/mcp-server/`, `agentes/` (definiciones de Managed Agents) | `server/src/decisiones/`, `server/src/avisos/`, `ui/` |
| Migraciones | 0131-0149 | 0150-0169 |
| Ramas | `rediseno/a-*` | `rediseno/b-*` |

**Contratos entre los dos:**

- B consume `metricasCliente()`. Hasta que A lo entregue, B usa un adaptador
  propio sobre las tablas actuales (las fórmulas de leads y conversiones ya son
  correctas) con la misma firma, y lo cambia cuando A mergea.
- A entrega la salud de las fuentes en `server/src/ingest/salud.ts`. B la usa
  para los incidentes de nivel 5 y la franja de cobertura de Hoy:
  ```ts
  saludFuentes(db, { clientId?: string }) => Promise<Array<{
    clientId: string; cliente: string;
    fuente: "meta_ads" | "google_ads" | "organico";
    estado: "sin_conexion" | "fallando" | "sin_entrega" | "atrasada" | "ok";
    ultimoDato: string | null;       // YYYY-MM-DD, último día con datos
    ultimaCorridaOk: string | null;  // ISO, último sync que terminó bien
    fallasSeguidas: number;          // corridas fallidas consecutivas, las más recientes
    fallandoDesde: string | null;    // ISO, primera de esas fallas
    ultimoError: string | null;
    detalle: string;                 // una frase para una persona
  }>>
  ```
  `sin_entrega` = el sync anda pero no hay datos (pauta pausada o sin presupuesto):
  no es una falla y no interrumpe a nadie.
- A escribe decisiones desde los agentes con la herramienta MCP
  `lmtm_proponer_decision`, que llama a `POST /api/decisiones` (servicio de B).
- Si uno necesita tocar una carpeta del otro, lo pide en el PR y no lo hace.
