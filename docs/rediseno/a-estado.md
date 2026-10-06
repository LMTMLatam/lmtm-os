# Chat A (Datos y agentes): estado y bitácora

Se actualiza al final de cada vuelta. Lo más reciente arriba.

## Estado

| Fase | Estado | Rama / PR |
|---|---|---|
| A1. Salud de fuentes | **en producción** (boot 15:21 UTC), verificado | PR #1 |
| A2. Métricas + objetivos | **en producción**, también en la herramienta de pauta de los agentes | `rediseno/a-metricas`, `rediseno/a-agentes` |
| A3. Aislamiento por cliente | **en producción**; limpieza de memoria hecha; Randstad verificado | `rediseno/a-aislamiento` |
| A4. Agentes con objetivo (piloto, motor actual) | **piloto en sombra corriendo** desde 06/10 (Milo, 3 clientes, 2 semanas) | `rediseno/a-agentes`, `rediseno/a-campanas` |
| A5. Resto de los roles | pendiente (pasa a C2b: cada rol migra al runner propio) | |
| C2a. Runner propio | **en producción** (`LMTM_RUNNER=1`); primer rol: media buyer | `rediseno/c2-runner`, `rediseno/c2-horario` |
| C1. App propia (Hoy, Clientes, Cliente, Agentes, Config) | deploy en curso | `rediseno/c1-app` |

**Integración:** A es el integrador (mergea, deploya y verifica en producción, lo
suyo y lo de B). Canal con B: rama `rediseno/buzon`.

**Esperando a una persona:**
- Aprobar o descartar (con motivo) las propuestas de pauta de Milo: son el dato
  principal del piloto.
- Revisar la cola de 27 issues `in_review` (desde el 15/07): cerrarlos o
  devolverlos. Los agentes no pueden avanzarlos.
- Cargar `DATABASE_URL_RO` en el entorno de la sesión de B en la nube (B no puede
  verificar contra prod sin ella).
- **Decidir la rutina diaria de Luna ("Plan de acción por cliente", 12 min/día):**
  su salida ya no se muestra en ninguna pantalla (B3 retiró la pestaña). Propuesta:
  pasarla a semanal (lunes antes de las 10:00) escribiendo el informe del cliente con
  `lmtmEscribirInforme`, primero para los 3 clientes del piloto. Los informes quedan
  en borrador hasta que una persona los publica.
- Corregir (lo toma Nazareno) las acciones de conversión de Google en MA PROPIEDADES y SEBASTIAN
  RAMASCO PADILLA (~53% de los clics "convierten").
- Limpiar la plantilla de ClickUp (OnBoarding de inmobiliaria en ~70 carpetas,
  posteos de Cliente Natural en 6). La plantilla en sí solo se corrige desde la app.
- Rubro real de LoMasFundas (brain dice Deporte; los agentes "corrigieron" a
  productos naturales a partir de la memoria contaminada).
- DUNOD: falta el permiso `pages_read_user_content` en la app de Meta (orgánico).
- Accesos de Google en el MCC: SERRAT, HANSHI, SKYGARDEN, PRONE (403 desde 14/09).

## Bitácora

### 06/10 tarde: fase C, investigación, runner propio y app propia

Pedido: "¿seguimos sobre paperclip? ¿los agentes corren en un entorno nuevo? La
interfaz no es la que buscamos; investigá equipos y agencias manejadas por
agentes y basate en eso". Respuesta honesta: hasta hoy, sí sobre paperclip.

- **Investigación** en `INVESTIGACION.md` (Project Vend, Polsia, HurumoAI,
  TheAgentCompany, Agent Inbox, playbooks de pauta con agentes, frameworks).
  `PLAN-C.md` reescrito como "LMTM propio" con esos principios.
- **Runner propio** (`server/src/agentes/`, migración 0152 `agente_trabajos`):
  cola en Postgres, Claude Agent SDK con MiniMax (sin API key), roles en
  `roles/*.md`, compuerta por herramienta (escalón N0 en el motor: le saca
  `approved` a todo), registro de pasos. Disparadores: decisión
  `pauta:gasto_caido` → media buyer investiga; horario 11:00 L–V → revisión
  diaria del piloto, un trabajo por cliente, en paralelo con la rutina de Milo.
  Probado en local contra MiniMax: investigación en 35 s, 4 pasos en el orden
  del procedimiento, causa + verificado + supuestos.
- **Primer arranque en prod (17:53 UTC):** encoló solo las 7 decisiones abiertas
  y las 7 fallaron en 0 s: el binario nativo del SDK no se instala en la imagen.
  Arreglo: usar `/usr/local/bin/claude` (`660158d`). Se reintentan solas a los 30 min.
- **Error mío:** ese commit se llevó borrados staged de páginas viejas; el build
  falló (prod siguió con el deploy anterior). Restaurado en `545c9b1`.
- **App propia** (`ui/src/app/`): rutas sin prefijo (hoy, clientes, agentes,
  config), shell propio; la ficha reusa todas las secciones viejas
  (`TabContent`). 959 tests de UI, tsc y build OK.

### 06/10 08:20: PR #2 de B (B1–B4) en producción

B no contestó el FALLO-INTEGRACION en 5 h; hice los dos arreglos en la rama de
integración (`4b3750e`): el informe del cliente mide cada campaña con objetivo por
plataforma y `noSeMidePorCpl`, y el resumen agrupa los avisos reencolados. Entra
también `lmtmEscribirInforme`. Main `5fe0659`: server 543/543, MCP 12/12, build OK.
Boot 11:18 UTC; el migrador registró 0150/0151 (ya creadas); motor, resumen e
informes programados; health 200; `/api/hoy` sin sesión → 401. Link público real
de Distrillantas y MA PROPIEDADES: 200, con la marca, el catálogo y Google
dudoso en `sin_dato`.

**Verificado en el día:**
- **Motor (8:30):** abrió 165 decisiones (en prod también corren saldo y cadena,
  que el ensayo no podía). 18 eran "Cargar saldo antes de que se frene" con gasto
  null, de responsable cliente → salían como pedido en su link público (MA
  PROPIEDADES, con su Meta gastando ARS 287.000/semana). Arreglo `rediseno/a-saldo-sin-gasto`
  (sin gasto conocido no se pide saldo), deploy 11:54 UTC, 16 descartadas con motivo
  (las otras 2 eran frenadas reales). Link de MA PROPIEDADES: sin pedidos.
- **Resumen de las 9:00:** salió 9:04, sin repetidos (2 avisos extra). Para B: los
  incidentes se repiten dentro de "Otros avisos" y las tendencias son viejas
  (marzo, febrero).
- **Luna (9:30):** terminó en 12,2 min, OK. Antes la cortaban el timeout (10) o el
  reaper (12). Corte por agente verificado.
- Cadena de publicación incluye clientes plantilla (Cliente Natural, Cliente
  Inmobiliario) en Hoy: para B.
- **Piloto A4, día 1 (Milo 11:00):** 22 propuestas en 6 min, **20/22 defendibles
  (91%, meta 90%)**. Las 2 fallas son de la herramienta, no del agente: le dábamos
  el objetivo total (972, mezcla Google) y no el de Meta (790). Arreglado `2b95887`:
  cada campaña trae `objetivoCpl` de su plataforma y `noSeMidePorCpl`. Detalle en
  `agentes/media-buyer/PILOTO.md`.

### 06/10 05:40: reloj verificado, PR #2 de B revisado (vuelve con dos arreglos)

- **Reloj (`675f1e1`) verificado en 12 h:** Delfina, Dario, Luna y Carlos 0
  corridas por reloj; 8.188 despertares salteados por `idle.noWork`. Quedaban Milo,
  Pablo, Nicolas y Esteban despertando por `in_review` (13/13 corridas "quedo a la
  espera") → `9f2e5e9`: `in_review` no cuenta como trabajo. En prod desde 07:54 UTC.
- **Cola `in_review`:** 27 issues esperando revisión, el más viejo del 15/07 (Milo
  8, Pablo 8, Caro 6, Esteban 4). Nadie los recibe: es trabajo para una persona.
- **PR #2 (B1–B4):** merge limpio, 542 + 954 tests, build OK, autorización bien.
  Migraciones 0150/0151 aplicadas en prod (aditivas, vacías). Ensayo con datos
  reales: el informe del cliente marcaba "muy arriba" la marca, Google contra el
  objetivo de Meta, tráfico y catálogo; el resumen de las 9:00 repetía avisos 4-5
  veces. FALLO-INTEGRACION a B; exporté `noSeMidePorCpl` (`bf4c566`) para que use
  la misma vara.

### 05/10 19:45: A5, línea de base de la flota y el reloj que despertaba a nadie

**Inventario de 14 días** (base para "el rol nuevo supera al viejo"). Costo
nominal total ≈ USD 764 (~1.640/mes, coincide con el ritmo del plan).

| Agente | Corridas | Por reloj | USD nom. | Entregables | Comentarios | Cerrados |
|---|---|---|---|---|---|---|
| Milo | 302 | 151 | 169 | 10 | 225 | 42 |
| Pablo | 227 | 64 | 129 | 0 | 240 | 100 |
| Delfina | 167 | 167 | 96 | 0 | 0 | 0 |
| Caro | 104 | 13 | 86 | 91 | 114 | 65 |
| Esteban | 105 | 46 | 73 | 0 | 80 | 12 |
| Nicolas | 76 | 50 | 62 | 0 | 37 | 5 |
| Luna | 91 | 47 | 53 | 189 | 48 | 27 |
| Carlos | 45 | 23 | 28 | 5 | 29 | 17 |
| Dario | 59 | 55 | 24 | 0 | 5 | 1 |
| Bianca, Carla, Sergio, Roxana, Ana | 14–27 c/u | | 5–13 | 0–4 | 0–15 | 0–6 |

Consulta: `docs/rediseno/inventario-flota.sql`.

**Hallazgo.** El reloj despierta a los agentes SIN issue: 698 corridas por reloj,
ninguna con issue, al menos 328 terminaron en "contame qué necesitás" (los 4 de
`lmtm-glm` casi siempre; los de MiniMax improvisan trabajo). El idle throttle no
frenaba porque contaba como trabajo un `todo` abandonado (Delfina, LMTM-5156 desde
el 21/09). Arreglo `675f1e1`: solo cuentan issues con movimiento en 7 días, y si hay
uno vigente la corrida lo lleva. Simulado: 10 agentes pasan a una pasada por día
(373 → ~140 corridas en 14 días); hoy no se revive ningún issue viejo.

**Para verificar el 06/10:** corridas por reloj por agente en 24 h (≤ 1 para esos
10) y skips `heartbeat.idle.noWork` en `wakeup_skip_log`.

### 05/10 17:20: A4, el media buyer no tenía qué mirar

**Hallazgo.** Los agentes tienen pausar / presupuesto / mover plata, y existe el ciclo
propuesta → aprobación con un click → ejecución (`approvals` tipo `accion_pauta`).
En producción: **0 propuestas desde siempre**. Ninguna herramienta mostraba las
campañas (solo el total del cliente, sin ids) y las skills pedían "analizar
lmtmGetClientAdsPerformance por campaña", algo que esa tool nunca dio. A4 no
necesita esperar a la tabla `decisiones` de B1: el ciclo N0 ya existe.

**Hecho** (`c031aaf`, `2bdb345`):
- `metricasCampanas()` + `get_client_campaigns` / `lmtmGetClientCampaigns`.
  Verificado: suma exacta contra `metricasCliente` en los 3 clientes del piloto.
  Meta sigue marcando ACTIVE las campañas vencidas: se excluyen por fecha de fin.
- `leadsDudosos`: Google "convierte" ~53% de los clics en MA PROPIEDADES y
  SEBASTIAN RAMASCO PADILLA (resto de la agencia ≤ 7%). El objetivo de MA
  PROPIEDADES era **ARS 92** por lead, sacado de esas conversiones; un media buyer
  con ese número habría propuesto pausar todo Meta. Ahora 3.300 (Meta real 4.125).
- Evaluador del piloto (`eval-propuestas.ts` + CLI con `--referencia`). La primera
  versión de la referencia "pausaba" tráfico, catálogo, la marca de Distrillantas y
  un PMax medido contra el objetivo de Meta: esas trampas quedaron como reglas.
- Skills `lmtm-ad-actions`, `lmtm-ads-playbook`, `lmtm-tool-reference` corregidas.
- Piloto definido en `agentes/media-buyer/PILOTO.md` (rutina de Milo, 3 clientes,
  cómo se mide).

**Aplicado en prod (con OK de Nazareno):**
- Allowlist: `lmtmGetClientCampaigns` a Milo, Carla, Luna, Delfina y Roxana;
  `lmtmSetBudget` a Milo. Autonomía de pauta apagada (`LMTM_AUTONOMIA_PAUTA` no
  existe): todo queda como propuesta.
- Rutina `Media buyer en sombra (piloto)` (`6217b570`), Milo, `0 11 * * 1-5`
  ART, primera corrida 06/10 11:00. Creada por API con una clave de panel temporal
  (20 min) revocada al terminar.

**Arranca el reloj del piloto (2 semanas, hasta el 19/10).** Cada día después de
las 11: `eval-propuestas-cli.ts` sobre las propuestas, y `--referencia` para la
cobertura.

### 05/10 16:50: integración de A2/A3 a los agentes, y la flota

- `get_client_ads_performance` sale de `metricasCliente` (null sin cuenta, objetivo,
  frescura). Deploy `a5cb229`, boot 16:42 UTC.
- Randstad: el filtro por nombre no alcanzaba (las ideas ya no existen en el origen).
  Se agregó la ventana de nacimiento: se descarta lo creado ≤30 min después de la
  tarea más vieja del OnBoarding de la carpeta. **Verificado:** review regenerado
  16:46 habla de RRHH, 0 menciones de Cliente Natural.
- Luna (`timeoutSec` 600 → 1200): el reaper cortaba cualquier corrida a los 12 min,
  así que subirle el tiempo no servía. Ahora el corte es `timeoutSec` del agente +
  5 min (mínimo el global). Commit `4d0d0ed`. Verificar la rutina de Luna del 06/10
  09:30 ART: que no dé timeout ni la corte el reaper.

### 05/10: A3 aislamiento por cliente

**El problema, medido.** El dueño vio sugerencias de una inmobiliaria en
Distrillantas (gomería). Tres fugas:
1. Carpetas de ClickUp creadas copiando otras: el OnBoarding de "Cliente
   Inmobiliario" (objetivos de propiedades) está en ~70 carpetas, y los posteos de
   "Cliente Natural" en Super Redes de 6. Todo creado en bloque el día de cada
   carpeta (Distrillantas: 02/07 08:03-08:07 UTC, creador Marcos Lewis).
2. El review de contenido (07/07) leyó esos posteos y guardó "productos naturales"
   en la memoria de 7 clientes; los agentes lo propagaron.
3. Efemérides sin filtro de rubro: el 12/09 "Día del Corredor Inmobiliario" a 45
   clientes que no son inmobiliarias. El filtro existente además aplicaba todas las
   de nicho a clientes sin rubro (`"x".includes("")`).

**Hecho.** Efemérides por rubro en el motor de oportunidades (con el bug del
filtro corregido); filtro de contenido de plantilla en el review y en el lector de
Super Redes; escaneo diario de contaminación al resumen (nivel 3); skills de los
agentes advierten sobre la plantilla. Limpieza: 7 reviews contaminados borrados con
resguardo en `client_memory_backup_20261005_plantilla`.

**Verificado:** 7 resguardados, 0 contaminados quedan, 5 reviews legítimos intactos.
Quedan 15 menciones de "productos naturales" escritas por agentes: casi todas son
correcciones ("NO productos naturales"); las de LoMasFundas esperan decisión humana.

**De paso (lo mostró A1):** Meta cortaba con "reduce the amount of data" al traer
creativos de MA PROPIEDADES y HANSHI; `paginate()` ahora achica la página y sigue.

### 05/10: A2 métricas y objetivos

**Hecho.** `metricasCliente()` con el contrato de PLAN.md y dos ajustes avisados a
B: inversión y leads son `null` sin cuenta conectada, y se suma
`objetivo.tcplFuente`. El objetivo va en cascada: el del cliente
(`metadata.cplObjetivo`), si no el historial (CPL de 30 días × 0,8 con 10 leads o
más), si no el rubro. Sin tabla nueva. Chequeo diario de consistencia desde `raw`,
con aviso de nivel 4 si algo no cierra.

**Verificado contra producción (solo lectura):**
- Distrillantas 31/08-29/09 Meta, medido en el mismo momento: métricas = panel
  público (ARS 2.519.657,84, 2.422 leads, 29.195 clics). Objetivo propuesto: ARS
  832 (historial). Ventas: 171 compras de Meta.
- Cliente sin cuentas (Agencia LMTM): inversión, leads, CPL y objetivo en `null`.
- Consistencia: 25.214 filas, 0 diferencias en leads, 0 en ventas, 0 huérfanas.
- Tests: 20 entre `metricas` e `ingest`; tsc limpio.

**Pendiente:** leads calificados (el CRM vive en otra base); alcance y frecuencia
del período (hace falta que la ingesta los traiga sin `time_increment`).

### 05/10: A1 salud de fuentes

**Plan.** Sin tabla nueva: `saludFuentes()` junta los hechos (mappings, últimas 30
corridas por cuenta en `sync_logs`, último dato en `ads_insights`, último post y
último refresco de métricas del orgánico) y una función pura los clasifica. El
autosync anota en la metadata de su log las partes best-effort que fallan
(creativos, audiencia, orgánico), que hasta hoy morían en un `console.warn`.

**Decisiones.**
- Capa cruda separada: postergada. `ads_insights.raw` ya guarda el payload y
  recalcular desde ahí da 0 diferencias; los reemplazos ya son transaccionales.
- Servicio `lmtm-ingest` aparte: postergado hasta que el sync pese en el web.
- Orgánico: la frescura se mide por el refresco de `organic_post_insights`, no por
  `organic_posts.synced_at`, que nunca se actualiza (el insert ignora repetidos).
  Con la señal vieja parecía que 15 clientes estaban desactualizados; era 1.

**Verificado contra producción (rol de solo lectura), 05/10:**

| fuente | fallando | atrasada | sin_conexion | sin_entrega | ok |
|---|---|---|---|---|---|
| meta_ads | 1 | 0 | 32 | 9 | 17 |
| google_ads | 4 | 0 | 39 | 8 | 8 |
| organico | 1 | 1 | 33 | 2 | 22 |

- Los 32 `sin_conexion` de Meta son exactamente los 32 clientes sin cuenta mapeada.
- Google: HANSHI, PRONE, SERRAT y SKYGARDEN `fallando` hace 30 corridas (desde
  14/09), "403: The caller does not have permission".
- HANSHI Meta: `fallando` hace 14 corridas (desde 25/09), "400: Service temporarily
  unavailable", último dato 15/06. La última corrida buena (24/09) tampoco trajo
  datos: la pauta está pausada desde junio y además el sync falla.
- DUNOD orgánico: `atrasada`, 101 posts (último 30/06) y ninguna métrica
  sincronizada nunca. Con el registro por partes, el próximo sync dirá si falla.
- Tests: 13 de `salud`, 390 propios en total, tsc limpio.

**Qué queda después del deploy:** confirmar en el sync de la noche siguiente que
aparecen `metadata.partesFallidas` en `sync_logs` cuando una parte falla:
`select metadata->'partesFallidas' from sync_logs where metadata ? 'partesFallidas' order by completed_at desc limit 20;`
