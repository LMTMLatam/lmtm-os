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
| C2a. Runner propio | **en producción** (`LMTM_RUNNER=1`); roles media buyer, estratega, contenido | `rediseno/c2-*` |
| C1. App propia (Hoy, Clientes, Contenido, Agentes, Config y las de "Más") | **en producción**; sin puerta a "Sistema" desde el 07/10; faltan rehacer Pauta, Semáforo, Inteligencia, Finanzas, WhatsApp (hoy con la paleta nueva) | `rediseno/c1-*` |
| Optimización del equipo | **fase 1 aplicada** (`OPTIMIZACION-EQUIPO.md`) | main |

**Integración:** A es el integrador (mergea, deploya y verifica en producción, lo
suyo y lo de B). Canal con B: rama `rediseno/buzon`.

**Esperando a una persona:**
- Aprobar o descartar (con motivo) las propuestas de pauta de Milo y del runner: son el
  dato principal del piloto (08/10: 0 de 131 decididas en 3 días).
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

### 26/10: escenarios de prueba de los agentes en la cuenta real de Make

El equipo recibía mails de error de Make. Eran pruebas de agentes en la cuenta
real: Nicolas (LMTM-6271, dom 25/10 21:08–21:38 ART) creó `ZZ-SCRATCH-A2-*` y
`TMP-TEST-LMTM-6271` y guardó 5 veces el health-check `LMTM-5441-A2` (2
ejecuciones con error; desde las 21:32 anda). Esteban (LMTM-6096, 20/10) dejó
`ZZ-TEST-ESTEBAN-*`. Con OK del usuario se borraron los 7 (83 → 76 scenarios;
queda `ZZ-TEST-PATCH-probe`, apagado). Regla nueva en `lmtm-tool-reference`: no
crear scenarios de prueba (y si es imprescindible, borrarlo en la misma corrida),
no probar guardando un scenario en uso, no poner claves en el blueprint. Ojo: el
blueprint de `LMTM-5441-A2` tiene un token de la API de Make escrito a mano.

De paso, "Clean Unity publicó cosas sueltas el finde": no es una falla. Make
publicó las tareas 8–11 del calendario de ClickUp en sus fechas (23–26/10), las
4 con "APROBADO" del cliente y en su formato.

### 26/10: la semana nueva de MiniMax se iba igual (30% en 14 h)

- **Ráfaga al reset:** a las 00:00:11 UTC el barrido de pendientes despertó ~40
  corridas juntas: ~80 M de tokens en una hora, la ventana de 5 h entera. A las
  05:00 se repitió. El ritmo semanal no lo frena al arrancar la semana. Arreglo
  (f575c5d): tope de 4 arranques automáticos por hora por proveedor
  (`LMTM_CORRIDAS_LLM_POR_HORA`), contado en memoria; motivo `llm.tope_hora`.
- **El M2.5 que mostraba la consola:** 61 tareas tienen el perfil "cheap", que en
  el adaptador pide `claude-sonnet-4-6` (effort low) y pisa el modelo del agente;
  MiniMax lo atiende con M2.5. Arreglado en la base (`runtime_config.modelProfiles.cheap`
  → MiniMax-M3.1-Flash) en los 14 agentes.
- **Clave nueva:** el usuario regeneró la clave (la vieja da 1004). Va en los 14
  agentes (`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY`) y en `MINIMAX_API_KEY` de
  Railway. Es el mismo plan: semanal 69% libre, vuelve el 02/11 00:00 UTC.

### 23/10: Google Ads caído por la versión de la API (v22 → v26)

Desde el 21/10 Google contesta `400 UNSUPPORTED_VERSION` ("Version v22 is
deprecated") en las 21 cuentas: `ads_insights` de Google quedó en el 20/10, el
monitor de saldo fallaba y "ver cuentas" en Integraciones daba 502. A las 19:50
UTC alguien borró la conexión (`DELETE /integrations/connections/5d855aab…`) y
las 21 cuentas quedaron sueltas; hubo 5 `oauth/start` sin ningún callback (el
login de Google no se terminó; el cliente OAuth y la redirect_uri están bien).
Arreglo (2197379, deploy 32d5013a SUCCESS): API v26. El único cambio que nos
tocaba entre v22 y v26 es de v23 (`campaign.start_date/end_date` →
`start_date_time/end_date_time`). Test nuevo. 24/10: el equipo reconectó
(11:50 UTC, `374f33a6…`); el callback puso el MCC y re-vinculó las 21 cuentas.
Verificado por efecto: MA PROPIEDADES sincronizó con v26 (11 campañas con
fechas, insights 21–23/10). Las otras 20 vuelven con el sync diario (90 días).

### 23/10: la guía de contenido matcheaba palabras cortas adentro de otras

Armando un reel de OPI para El Hiper de la Pelu, `lmtmGuiaContenido` traía como
"lo que se sabe del producto" frases de la memoria que decían "propio/propios":
`puntaje` buscaba cada palabra del pedido por substring. Arreglo (861eacb): las
palabras de menos de 5 letras tienen que empezar una palabra del texto; las
largas siguen por substring (nombres de archivo pegados). Test nuevo (13/13).
Deploy 5d9c5c7d SUCCESS; verificado en prod con la misma llamada: el producto
trae "OPI: distribución exclusiva en Rosario" y ninguna línea de "propio".

### 22/10: se agotó el plan semanal de MiniMax → corte por cuota, ritmo y M3.1 Flash

**Qué pasó (DB):** la semana del plan (dom 18/10 21:00 → dom 25/10 21:00) se gastó
en un día y medio. Un día normal son 20–45 corridas y 10–20 M de tokens; el
20/10 hubo 207 (~330 M) y el 21/10, 255 (~455 M). Desde el 20/10 MiniMax contesta
429 "Token Plan usage limit reached (2056)". El adaptador lo tomaba como pasajero
(`claude_transient_upstream`): 4 reintentos y después el lazo de recuperación
volvía a despertar la tarea. ~230 tareas en ese círculo, con 916 corridas
fallidas el 22/10. Además:
- Los agentes no mapeaban los modelos internos del CLI: 733 corridas salieron como
  `claude-sonnet-4-6`.
- Corridas caras que fallan por tope de turnos o timeout se reintentaban igual
  (LMTM-6183: 16 corridas, 41 M de tokens, todas fallidas).

**Hecho:**
- Adaptador claude-local: `isClaudeQuotaExhaustedError` → `claude_quota_exhausted`
  (no transitorio; `errorFamily` en resultJson = `quota_exhausted`).
- `services/cuota-llm.ts`:
  - Corte por proveedor hasta el reset, o sondeo cada 1 h. Aplica en
    `enqueueWakeup` y en la compuerta de reintentos programados, que los cancela.
  - Ritmo semanal: lo automático no adelanta lo gastado a lo transcurrido (+10 %).
    Se lee de `/v1/api/openplatform/coding_plan/remains`, que no está documentado;
    si falla, rige el tope de 80 corridas por día (`LMTM_CORRIDAS_LLM_POR_DIA`).
  - Lo pedido a mano (`on_demand`) pasa el ritmo y el tope.
  - Un aviso al resumen por día.
- Modelo: los 10 agentes de MiniMax, el runner de roles y el respaldo de LiteLLM
  pasan a `MiniMax-M3.1-Flash`, con Sonnet/Opus/Haiku/subagentes mapeados y
  `CLAUDE_CODE_EFFORT_LEVEL=medium`. El ID está verificado contra la API: un modelo
  inventado da 400; M3.1-Flash, 429 de cuota.

- **Recuperación** (25c976f): creaba corridas sin pasar por `enqueueWakeup` y, si la
  continuación fallaba por cuota, mandaba la tarea a `blocked`. Ahora la cuota frena
  igual que el presupuesto, y una falla por cuota no cuenta como falla de la tarea.
  Ya habían quedado 30 tareas bloqueadas en falso entre el 20 y el 22/10.
- **Los 4 agentes "NVIDIA"** (`lmtm-glm` por LiteLLM): GLM-5.2 de NVIDIA da 410 desde
  el 21/08, así que corrían enteros por el respaldo de MiniMax, invisibles para el
  corte. Pasaron directo a MiniMax-M3.1-Flash: los 14 agentes quedan iguales.
- **Verificado en prod** (deploys fa08f822 y f31c8a8b): desde el arranque, 879
  despertares cortados por cuota y 168 por tope diario; ninguna corrida nueva de
  MiniMax; 0 en cola. La guía de contenido anda por el conector (14 s la primera
  vez). Descarga firmada: 206 con el MP4 real; 403 con token falso; 404 con un
  archivo de otro cliente.

**Queda:**
- Sin cuota hasta el domingo 25/10 21:00 (o comprar créditos).
- El bot de WhatsApp está desvinculado (`SCAN_QR`): ningún aviso salió desde el 20/10
  21:15 (36 con error, 86 pendientes). Hay que escanear el QR.
- 30 tareas en `blocked` por cuota esperan decisión.

### 21/10: guía de contenido para Claude (`lmtmGuiaContenido`)

**Pedido:** "Quiero un video de tal producto de tal cliente y que lo genere sin
consumir muchos tokens: la dirección de Drive del contenido, la web, toda la
identidad y memoria del cliente, como una guía para Claude".

**Hecho:**
- `services/guia-contenido.ts`: una llamada arma la guía (~3k tokens) con marca,
  el producto (catálogo, memoria, web y posteos que lo mencionan), memoria útil
  para producir (sin pauta, sin bitácoras, sin supuestos), lo que mejor funcionó,
  el material de Drive, la web y la receta (con terminal: HyperFrames; sin
  terminal: generar con IA o dejar la tarea a edición) y las reglas.
- **Drive:** el material está repartido en la unidad compartida, así que se indexa
  por nombre (cliente + palabra distintiva; `metadata.driveTerminos` lo pisa) y se
  recorre lo que cuelga. Sin copias, sin basura del sistema, con los RAW como
  "otro". Índice en `client_context_cache` ("drive-material"), vigente 24 h, y
  rehecho de a uno cada día (`initIndiceDrive`). Web en "web-material" (7 días).
- **Descargas:** `GET /api/public/material/:fileId?t=`, con un token por cliente
  firmado con el secreto del servidor y válido 24 h. Solo sirve archivos de ese
  cliente (su índice, su logo, sus productos). Pasa Range y transmite en stream.
- Registrada en el conector (`lmtmGuiaContenido`), en los 14 agentes
  (`get_guia_contenido`), en el conector del equipo, en el rol contenido del runner
  y en la skill de referencia. El servidor MCP manda `instructions` que dicen
  llamarla primero.
- `makeTool` devuelve el texto del ejecutor tal cual: antes iba como JSON escapado
  (`{"ok":true,"content":"…\n…"}`) en TODAS las herramientas lmtm*.
- Ensayado local contra el Drive real: Ferrol «departamento» trajo los videos
  "DEPARTAMENTO 2 HABITACIONES" y las fotos de "EDITADAS SELECCIONADAS/FERROL/
  DEPARTAMENTOS DOBLES"; RENO «placares», los 4K "PLACARES" filmados el 20/10 y las
  páginas de cada línea en la web.

**Queda:**
- Catálogo de productos vacío en los 59 clientes (`client_products`).
- RENO: la reseña de contenido de su memoria (`content-review-posts`) describe una
  inmobiliaria. Hay que rehacerla.

### 20/10: "los agentes desactivan anuncios sin autorización"

**Qué pasaba (DB, solo lectura):** 35 pausas del 14 al 20/10, las 35 del piloto
automático (`LMTM_AUTONOMIA_PAUTA=1`, prendido a pedido el 14/10), ninguna de un
agente salteando la firma. Avisadas solo dentro del resumen de las 9:00. Dos fallas:
- **Le peleaba al equipo:** 11 pausas fueron de cosas que alguien había vuelto a
  prender (AMORTIGUADORES de Distrillantas y CAPTACION / SALTA 1250 de MA PROPIEDADES,
  3 veces cada una). El sistema nunca reanuda, así que pausa previa + gasto de nuevo
  = una persona la prendió.
- **Apagaba lo que trae consultas:** la evidencia (Poisson) con mucho volumen pasa
  con poco desvío. WP AVELLANEDA (198 leads, 1,6 × el objetivo) quedó apagada desde
  el 16/10.
- **Agujero abierto (sin uso):** las 6 herramientas de pauta aceptaban
  `approved=true` del propio agente.

**Hecho:**
- `piloto-automatico.ts`: no pausa solo lo que ya pausó antes (está en
  `agent_actions`) ni lo que cuesta menos de `cplPausaSola` = 2,5 × el objetivo por
  lead. Queda como propuesta para una persona.
- `agent-tools.ts`: `firmaHumana` = `approved` solo si lo manda un admin por el
  conector (actor board). Un agente que se firma solo deja la propuesta armada. La
  autonomía por historial ya no aplica a pausas (las decide el piloto).
- Repetido sobre las 35 reales: 18 se habrían hecho solas igual, 17 quedaban para
  una persona (deploy `e3b5c4bd`).
- **Después, pedido explícito: "no quiero que se frenen más anuncios sin
  autorización humana".** El piloto ya no pausa nada (campañas, conjuntos ni
  keywords); se sacaron `pausaSola`, sus topes y sus pruebas. Keywords de Google
  solo si la decisión quedó `aprobada` por una persona en Hoy. Sigue automático:
  bajar o mover presupuesto (mínimo $1.000), negativas de Google y tareas.
- Revisados todos los caminos de escritura: aprobar (`/approvals/:id/approve`) y
  ejecutar decisiones piden `assertBoard`; `lmtmSql` es solo lectura sin tokens; los
  plugins `lmtm-meta-ads` y `lmtm-google-ads` (tienen `update_campaign` SIN guards)
  están en `error` desde 06/06, sin config ni uso. Si alguien los activa, saltean todo.

**Queda:** `crm_request` todavía confía en el `approved` del agente (no es pauta,
no se tocó).
- Reactivar o no las que trae consultas y siguen pausadas (WP AVELLANEDA y LLANTAS
  de Distrillantas): lo decide el equipo.

### 16/10 (tarde): registro cerrado, link del equipo y conector para todos

**Pedido:** "cerrá el registro, pasame la invitación válida para todo el equipo y el
conector de Claude actual que lo puedan usar todos, e incluso generar videos".

**Hecho (`79f6745`):**
- **Registro cerrado:** `guardaRegistro` va antes del alta de better-auth. Solo entra
  quien trae el código del equipo (`LMTM_INVITACION_EQUIPO`) o el token de una
  invitación de paperclip vigente (header `x-lmtm-invitacion`). No se usó
  `PAPERCLIP_AUTH_DISABLE_SIGN_UP` porque rompía las invitaciones.
- **Link del equipo:** `/auth?equipo=<código>`. La persona crea su cuenta (o entra
  con la suya) y queda como operador. No hace falta aprobar a cada uno: las
  invitaciones de paperclip son de un solo uso y piden aprobación.
- **Conector del equipo:** `POST /mcp-equipo/<código>` (`LMTM_CONECTOR_EQUIPO`),
  como el agente "Claude (equipo)".
  - La credencial se firma en el servidor y nunca sale de ahí.
  - Tiene 28 herramientas: leer clientes y contenido, generar videos e imágenes (libre
    o desde una tarea de ClickUp), y crear tareas y aprendizajes.
  - No tiene pauta, SQL, WhatsApp a clientes, CRM ni la API genérica.
  - No se compartió el conector de admin: daba SQL de toda la base y escritura en la
    pauta.
- `/contenido/generar-libre` acepta a ese agente; el resto de la flota sigue sin
  poder generar.
- Los dos códigos están en Railway; los links, en `%USERPROFILE%\lmtm-equipo-links.txt`.
  Para revocar uno, se cambia su variable.

**Verificado en producción:**
- alta sin código: 403;
- código del equipo: válido (uno falso no);
- conector con link falso: 401;
- `tools/list` del conector: las 28 herramientas;
- `lmtmListClients` por el conector: OK;
- higgsfield activo por plan + API, con la etiqueta de ClickUp "generar contenido".

### 16/10: pedidos del equipo (grupo del bot)

**Pedidos:**
- Darle el panel a los chicos sin Licitaciones, Finanzas, etc.: "deberían ver clientes".
- "Lo de Magnific no funciona".
- Recordatorios si hace mucho no salen stories.
- Destacar el contenido que rindió mejor y las oportunidades de nicho.
- "Me marea todo el sistema".

**Seguridad (lo primero que apareció):**
- `finance.ts` no tenía ninguna guarda: `/companies/:id/finance/*` respondía y escribía
  sin login (probado con un GET sin sesión: 200; la tabla estaba vacía).
- El registro de cuentas está abierto (`PAPERCLIP_AUTH_DISABLE_SIGN_UP` sin cargar).
  Las rutas que solo pedían login (trabajo, novedades, web, video, productos,
  meta-sync, `/ops/*` de agent-tools) quedaban a la vista de cualquier cuenta nueva.
  Hay una cuenta de 07/07 sin pertenencia.
- `POST /ask` (puente a MiniMax) estaba montado antes del login y nadie lo usaba:
  cualquiera podía gastar la clave. Se sacó.
- Arreglo: `assertMiembro` (agente o persona de la empresa) en esas rutas, y
  `assertAdminEmpresa` (dueño/admin) en finanzas y licitaciones.

**Equipo:** se invita desde Config → Equipo y accesos con rol "operator". El menú se
arma por rol (`useEsAdmin`): operador y lector no ven Config, Licitaciones, Finanzas
ni WhatsApp. El servidor bloquea igual finanzas y licitaciones.

**Magnific:** nunca generó nada. El código pedía `model: "mystic"`, que es el nombre
del endpoint y no un modelo, y la API respondía "Validation error: body.model".
Además Freepik pasó a llamarse Magnific (abril 2026): host `api.magnific.com` y header
`x-magnific-api-key`. Modelo por defecto `realism`.
- Al verificar, un pedido de prueba con prompt vacío fue aceptado y generó una imagen
  (una generación consumida).

**Stories:** no estaban en el sistema (el feed de la API no las trae y solo muestra
las de 24 h).
- Captura cada 6 h en `organic_stories` (migración 0159, tabla propia: organic_posts
  la leen 20 lugares, entre ellos cotizado vs realizado).
- Regla `stories` del motor: un cliente con al menos 2 stories en 30 días y 3 días sin
  ninguna genera `contenido:sin_stories` en Hoy y una tarea.
- Solo para los clientes cuya página se pudo leer en la última captura.
- El historial arranca hoy: los primeros avisos pueden salir en 3 días.

**Ya existía:** el contenido que rindió mejor está en la ficha → "Qué funciona" y en
las buenas noticias; las oportunidades de nicho, en "Nichos" y como decisiones
`contenido:angulo/reutilizar` en Hoy (15 abiertas).

### 15/10: buenas noticias para mandarle al cliente

**Pedido:** "que los agentes puedan dar buenas noticias / novedades para reenviar a los
clientes, titulares llamativos para que noten la evolución, personalizado por cliente,
en un panel o en el dashboard".

**Hecho (`f569e4d`):** `services/novedades.ts`. Los titulares los arma el sistema con
plantillas y números medidos, no un modelo. Qué mira:
- **Pauta:**
  - semana y mes contra el período anterior;
  - la mejor semana de consultas y el costo más bajo de 3 meses;
  - el costo por consulta debajo del objetivo que fijó una persona.
- **Web:** visitas e impresiones desde Google, 28 días contra 28, con todos los días
  medidos.
- **Orgánico:** la publicación de las últimas 2 semanas que más se destacó, contada en
  interacciones reales.
- **Optimizaciones:** las medidas que bajaron el costo por consulta.

**Guardas:**
- volumen mínimo;
- "más consultas" no va si cada una costó más de 20% de más;
- "más baratas" no va si llegaron 30% menos;
- nada de pauta con fuentes atrasadas o fallando, ni con las conversiones dudosas de
  Google (en ese caso el titular dice "en Meta");
- en cuentas chicas se dice "más de 10 veces", no "338 veces".

**Dónde se ve:**
- "Buenas noticias para mandar" en Trabajo y en la ficha del cliente, con "Copiar para
  WhatsApp";
- "Novedades" arriba del resumen del dashboard del link del cliente.

**De paso:** `cuentaEnPesos()` con la columna sin tabla (`ad_account_id`) se resolvía
contra `ads_account_mappings` dentro de su propio subquery, y dejaba afuera todas las
filas. Los otros usos pasan la columna de drizzle (calificada) y están bien.

**Verificado contra producción (solo lectura):** 11 de 59 clientes con novedades.
- RENO: consultas +280% en el mes y cada una 57% más barata.
- COSA PROPIEDADES: la mejor semana de consultas de 3 meses (117) y su costo más bajo.
- Distrillantas: consultas +29% en el mes.
- Publicaciones destacadas en 9 clientes.
- Tests: 12 nuevos; server y UI en verde.

### 15/10: el trabajo de los agentes, en un solo lugar

**Pedido:** "que los agentes, en base a lo que hacen en Google, campañas, Analytics y
mejoras de SEO, vayan dejando todo en un sector, y los resultados de las optimizaciones
en los dashboards, para ver el trabajo real".

**Qué había:** todo quedaba escrito, pero en cinco lugares que ninguna pantalla juntaba:
- `agent_actions`: los cambios reales en Meta y Google, medidos a los 7 días. Solo los
  veía una ruta vieja (`/growth/actions`) que ninguna pantalla usaba.
- `approvals` de pauta: lo propuesto y el porqué de lo ejecutado.
- Decisiones de pauta, web, Search Console y Analytics.
- `agente_trabajos`: los análisis del runner.
- Entregables e informes semanales.

El borrador del informe del cliente solo contaba decisiones: las 13 pausas reales del
14 y 15/10 no aparecían en "lo que hicimos".

**Hecho (`dbe415a`):**
- `services/trabajo.ts` lee las cinco fuentes y las devuelve con una sola forma. Cada
  cambio trae su resultado: costo por consulta de la cuenta una semana antes y una
  después. Las mejoras de la web se miden con los clics desde Google (o los eventos
  clave de Analytics), 28 días antes contra 28 después, y solo con todos los días
  medidos.
- Rutas: `GET /api/trabajo` (con sesión) y `GET /api/public/dashboards/:slug/optimizaciones`.
  La pública devuelve solo los cambios ejecutados, sin el porqué interno ni veredicto:
  la semana siguiente se mueve también por otras cosas.
- Pantallas:
  - "Trabajo" en la navegación;
  - la pestaña "Agentes" del cliente pasa a "Trabajo" (mantiene "Pedirle algo" y lo que
    está corriendo);
  - "Optimizaciones" en el dashboard de pauta;
  - "Mejoras de web y SEO" en la pestaña Web;
  - "Lo que hicimos" en el dashboard del link del cliente.
- El borrador del informe semanal suma los cambios ejecutados: "Pausamos el conjunto
  «LLANTAS» de la campaña «WP AVELLANEDA - SEPTIEMBRE 2026»".

**Verificado contra producción (solo lectura), 30 días:** 230 registros.
- 13 cambios en cuentas, todos del piloto automático; se miden desde el 22 y 23/10.
- 110 análisis.
- 27 propuestas de pauta esperando.
- 33 informes semanales en borrador que nadie publicó.
- Por cliente, 0 registros de otro cliente.
- Tests: 10 nuevos; server 702 y UI 960 en verde; tsc limpio.

**De paso: las mejoras de SEO no salían nunca (`e76d01d`).** La regla de web existía
desde el 13/10 pero no había creado ninguna decisión. MA PROPIEDADES tenía 29 búsquedas
en posición 4 a 20 con más de 100 impresiones.
- **Causa:** la sincronización solo marcaba `sincronizado_at` si andaban todas las
  fuentes. Con la Data API de Analytics apagada, ninguna web con Analytics quedaba
  marcada, y el motor salteaba al cliente entero, Search Console incluido.
- **Arreglo:** con una fuente bien ya se marca. El motor usa solo la fuente sana
  (`fuenteRota`) y no cierra nada mientras haya una rota.
- **Simulación contra producción:** MA PROPIEDADES sale con «alquiler rosario»,
  «inmobiliaria rosario», «alquileres rosario» y 26 más.

**Qué verificar mañana:**
- después de la sincronización de las 00:20, `sincronizado_at` cargado en MA
  PROPIEDADES, INBELT y ALTECNO;
- a las 8:30, la decisión `contenido:busquedas` de MA PROPIEDADES en Hoy y en Trabajo
  (Web y SEO).

### 15/10: lo que no se publicaba y nadie avisó

**Pedido:** "la revisión de scripts y de que realmente se posteen las cosas no funcionó:
tuvimos errores estos días que no fueron notificados ni solucionados". Se arreglaron a
mano en la sesión "Posteos Agencia".

**Qué pasó en octubre:**
- LinkedIn vencido: Make apagó 7 escenarios.
- Clean Unity: apagado 8 días.
- Reno: videos rechazados desde el 18/09.
- Carruseles con video o con `Thumbs.db`.
- Mundo Inflable: un post llegó vencido a ClickUp.

**Por qué no se avisó:** los monitores lo detectaban, pero iba como una línea de 140
caracteres al pie del resumen de las 9:00. Además, un escenario apagado solo se acusaba
si el cliente nunca había despachado.

**Hecho (`39edf99`):** `salud-posteos.ts`. Lo grave sale como aviso propio y todo entra a
Hoy y a la herramienta de cadena de la flota. Mira:
- conexiones de Make con verificación en vivo (el `expire` de Make no alcanza) y las que
  vencen en 10 días o menos;
- escenarios apagados con posts en la cola o programados;
- ejecuciones incompletas, con el motivo en castellano;
- comentarios de falla en ClickUp;
- posts que pasaron su hora sin dispararse (y si están a las 04:00, la planilla sin
  encabezado "Horario").

**Ensayo:** 12 hallazgos, 9 graves.

**Falta (persona):**
- **Reautorizar la conexión de Facebook "LMTM" en Make antes del 25/10.** La usan 44
  escenarios.
- Reautorizar LinkedIn "Tester" y el Drive de Cannes.
- Decidir CARVUK y GRUPO ROIBAS (apagados con un post en cola).

### 14/10 noche: piloto automático prendido

**Pedido:** "quiero que todo sea más automático, no tantas decisiones humanas".

**Por qué no andaba:** la autonomía graduada (`ads-autonomia.ts`) pedía dos llaves: el
interruptor y el historial medido por tipo de acción. Como nunca se ejecutó nada, nunca
iba a haber historial.

**Hecho (`f1eb464`):** `piloto-automatico.ts`, con `LMTM_AUTONOMIA_PAUTA=1` prendido en
Railway a pedido del usuario. Se apaga sacando esa variable.
- **Se ejecuta solo, se registra y se avisa en el resumen:**
  - pausar, si se cumplen todas estas condiciones:
    - pasa el evaluador;
    - hay evidencia fuerte (P < 0,02);
    - el destino busca consultas;
    - topes: 3 por cliente por día, 40% del gasto de la plataforma, nunca la única
      campaña que gasta;
  - bajar o mover presupuesto;
  - negativas y pausar keywords de Google;
  - tareas de decisiones nuevas, en la lista "✅ Decisiones" de ClickUp.
- **Nunca solo:** subir presupuesto ni duplicar. Si lo medido de un tipo de acción
  empeora el CPL, ese tipo vuelve a pedir OK.
- **Destino de las campañas:** el sync de Meta ahora trae `destination_type` del conjunto.
  Sin ese dato, un anuncio sin link en una campaña de leads queda "sin dato".

**Primera corrida (20:24):** 7 pausas reales en Meta.
- Distrillantas: AMORTIGUADORES, LLANTAS y REPARACION LLANTAS.
- MA PROPIEDADES: 3.
- SEBASTIAN RAMASCO PADILLA: 1.

Las gemelas quedaron canceladas con referencia, 31 propuestas quedan para una persona y la
cola total bajó de 313 a 31.

**Sigue siendo de una persona:**
- subir presupuesto;
- las 34 consultas de agentes que esperan respuesta;
- aprobar calendarios de contenido, porque publican.

### 14/10 noche: la optimización de pauta no cerraba, y campañas ↔ web

**Pedido:** "que funcione bien la optimización de campañas, que se compagine con la
página web, que todo se nutra entre sí".

**Qué pasaba:** los agentes proponían, pero nada se ejecutaba.
- Había 313 propuestas de pauta pendientes desde el 06/10 (170 de Milo y 143 del media
  buyer) y nunca se había decidido ninguna.
- Eran unas 80 acciones: la misma campaña se volvía a proponer cada mañana. MA
  PROPIEDADES sumaba 190 sobre 40 campañas.
- Muchas eran pausas de campañas que ya no gastaban: Meta deja en ACTIVE una campaña con
  la fecha de fin vencida.
- Varias pausas se apoyaban en 1 a 4 leads, donde el CPL es ruido.

**Hecho:**
- `a223f8d`:
  - una propuesta por acción y por agente; si se repite, se actualizan los números;
  - no se arma una pausa de lo que no gastó en los 3 días completos anteriores;
  - limpieza diaria: pasan a `cancelled`, con el motivo escrito, las repetidas, las
    pausas de lo que no gasta y las que nadie tocó en 7 días.
- **Primera corrida:** de 313 pendientes quedaron 76 (195 repetidas, 37 pausas de lo que
  no gasta, 5 vencidas).
- `573fa93`:
  - pausar exige evidencia: tiene que ser improbable, menos de 1 en 10, que una campaña
    que rinde en el objetivo traiga tan pocos leads (Poisson con media gasto / objetivo);
  - la herramienta pasa cada propuesta por el evaluador del playbook antes de armarla;
  - la limpieza re-evalúa las pendientes.
- **Ensayo sobre las 76:** quedan 43 defendibles.
- `031dbaa`, `ads-destinos.ts`: cada campaña trae su destino (WhatsApp, formulario,
  mensajes, perfil, posteo promocionado o web). Si va a la web, trae lo que dice GA4 de
  esa página con tráfico pago.
  - Ensayo: 21 campañas van a la web ($2,7 M en 30 días), 69 a WhatsApp ($5,3 M) y 14 a
    formularios.
  - Llega a `get_client_campaigns` (Milo y el media buyer) y a la regla de landings
    flojas, que ahora nombra las campañas que mandan ahí.
  - El media buyer suma la causa "landing" y usa `lmtmRendimientoWeb`.
- `lmtm-ads-playbook` decía que no hay escritura en Meta/Google: corregido.

**Falta (persona):**
- **Decidir las 43 propuestas en Hoy.** Si se quiere que las de riesgo cero (por ejemplo,
  pausar con evidencia fuerte) se ejecuten solas, es `LMTM_AUTONOMIA_PAUTA`: lo decide
  Nazareno.
- **Habilitar la Google Analytics Data API**, sin la cual `landing` queda vacía.

### 14/10 tarde: dashboards de clientes como antes, y Google conectado

**Pedido:** "los dashboards de los clientes están fallando, que sean como los de antes".
Venía con una captura del equipo: arriba decía $180.000 y la tarjeta "30d", $126.193.

**Qué pasaba:**
- El link del cliente abría el informe semanal desde B3 (05/10); el dashboard había
  quedado en `/detalle`.
- No había caídas: los 33 links públicos dan 200 en todos sus endpoints. Lo que fallaba
  eran los números.
- **Tarjetas del dashboard interno:**
  - "Inversión hoy/7d/30d" sumaban los días del rango elegido, pero contados desde
    hoy hacia atrás. Con septiembre elegido, "30d" solo tomaba del 14 al 30/9 y
    aparecía "ARS 0 ↑50%".
  - La tendencia comparaba una mitad del rango contra la otra.
- **"Campañas activas"** contaba el estado de Meta: SKYGARDEN tenía 198 "activas" y solo
  10 con gasto.

**Hecho (`d5b1082`):**
- El link vuelve a abrir el dashboard. El informe pasó a `/informe`, con botón desde el
  dashboard, y `/detalle` sigue andando.
- Las tarjetas del interno son del período elegido y se comparan contra el período
  anterior de igual largo. El rango termina ayer.
- "Campañas con inversión" reemplaza a "Campañas activas" en los dos dashboards.
- El interno deja de mostrar alcance, frecuencia y ROAS, igual que el público.
- Verificado en producción con SKYGARDEN.

**Google conectado (`lmtm.ml@gmail.com`, 18:17):**
- **Search Console:** ve 7 sitios, de los cuales 4 son clientes. Ya trajo 90 días de MA
  PROPIEDADES (16.077 clics), INBELT, ALTECNO y MAERS.
- **Analytics:** vinculó 22 clientes, pero la **Google Analytics Data API está apagada**
  en el proyecto 909174443343 y no trae números.
- **Arreglado (`bdc4ee7`, `9a53851`):**
  - Con dos propiedades GA4 para la misma web se elige la que recibe visitas. Pasa en
    MAERS, SKYGARDEN, Ferrol y el Hiper de la Pelu.
  - El aviso de "elegí una" ya no lo borra la sincronización buena, y el motor ya no
    toma un aviso como falla.
  - Se avisa cuando la propiedad de Search Console mide otra URL que la de la web.
    MAERS (www vs sin www) y ALTECNO (http) daban casi 0 clics por eso.

**Falta (persona):**
- Habilitar la Google Analytics Data API en el proyecto 909174443343.
- Dar acceso de Search Console a `lmtm.ml@gmail.com` en los otros clientes.
- Crear la propiedad de dominio para MAERS y ALTECNO.

### 14/10: Search Console y Analytics por cliente, rutas abiertas y skills de la flota

**Pedido:** integrar Google Search Console y Google Analytics y "potenciar todo" para que
el sistema empiece a hacer cosas que aporten valor. A mitad del trabajo llegó otro: revisar
las skills locales y subir las mejores (SEO, diseño web y lo que necesite el equipo).

**Hecho (`082eacb`, `dbf10b3`, migración 0158):**
- Servicio `google-web.ts`. Una cuenta de Google de solo lectura se conecta desde
  Integraciones → Web, por el mismo OAuth de Google Ads.
- Cada cliente se vincula solo, por el dominio exacto de su web. Lo que se elige a mano
  no se pisa.
- La sincronización es diaria y llena `web_diario` y `web_ranking`.
- Herramientas nuevas: `lmtmRendimientoWeb` y `lmtmVincularWebGoogle`. `lmtmAnalisisSeo`
  ahora suma las búsquedas reales.
- El motor (regla `web_google`) propone cuatro cosas:
  - caída de clics desde Google;
  - búsquedas para subir (las que están en posición 4-20);
  - pauta sin conversiones medidas en GA4;
  - landings de pauta flojas.
- En el panel: tarjeta en Integraciones, pestaña Web en la ficha y filtro "Web y Google"
  en Hoy.

**Seguridad:** cinco rutas respondían sin sesión: `/api/video/*`, `/api/contenido/*`,
`/api/pauta/google`, `/api/productos/cobertura` y `/api/_debug/workers`. Entre ellas
estaba `POST /video/generar`, que gasta créditos. Ahora dan 401/403. Verificado sin sesión
y con el conector.

**Skills (`0d3fd73`, `5969a79`):** de las 141 locales más las de plugins, entraron al
bundle:
- seo-local, seo-technical, seo-page, seo-content, seo-content-brief y seo-plan, de
  claude-seo (MIT). Adaptadas a nuestras herramientas y sin DataForSEO.
- frontend-design (Anthropic).
- make-scenario-building y make-module-configuring (Make, MIT).

Además, lmtm-seo-playbook quedó reescrito con datos reales (sin Ahrefs ni Semrush), y
lmtm-tool-reference y lmtm-web-audit documentan las herramientas nuevas.

**Flota:** ningún agente tenía en su allowlist `lmtmAnalisisSeo`, `lmtmRedesPublicas` ni
`lmtmCompletarMarca`. Lo de "los agentes pueden hacer SEO" del 13/10 valía solo para Claude
y los runners. Se sumaron las herramientas de web por rol y las skills nuevas en
desiredSkills (backup en el scratchpad).

**Falta (persona):** conectar la cuenta de Google que tiene acceso a las propiedades de los
clientes. Si Google avisa que una API está apagada, el link para habilitarla aparece en la
tarjeta (proyecto 909174443343).

### 13/10 noche: Marca completa sola, web de cada cliente y SEO

**Pedido:** cargar la web de cada cliente en Marca, sus colores principales y
todo el Enfoque Técnico (menos avatar y logo), que lo hagan solos los agentes,
y que puedan hacer análisis SEO.

**Hecho (`8623e09`):** `marca-completa.ts`, todos los días (web del Enfoque o
de su página de Facebook, solo si responde; colores de la paleta del documento
o de la web sin colores de plantilla; el resto del Enfoque con el modelo, solo
si cambió). Prioridad persona > Enfoque > posteos. Bug: el formulario reenviaba
`updatedBy` y la fila de una persona quedaba como automática. `seo.ts` →
`get_analisis_seo` / `lmtmAnalisisSeo`; `completar_marca` / `lmtmCompletarMarca`.

**Primera vuelta en producción:** 45 de 59 con web (5 por la página de
Facebook), 43 con colores, 46 marcas desde el Enfoque Técnico (tono 35, público
40, diferencial 40, palabras 39, tipografías 6). A mano, con búsqueda: CARVUK,
Randstad, CANNES (web de su desarrolladora, según su Enfoque) y CHARLOTT (el
CRM). Sin web: BRISANOVA (brisanova.ar no responde), CAMPO TIMBO, Clean Unity,
Distrito Roldan, ECOCREDITO, GRUPO MA, LoMasFundas, Workera, y los 2 de prueba.
SEO probado con MAERS: sin H1, sin schema, 10/12 imágenes sin alt. PageSpeed no
contesta sin clave (`GOOGLE_PAGESPEED_KEY`).

### 13/10: Google Ads visible, cuentas sueltas y keywords aprobables

**Pedido:** "Tema Google Ads, en qué estamos, no veo nada de eso". Estado:
7 cuentas al día, 4 sin permiso (403 desde el 23/09: HANSHI, PRONE, SERRAT,
SKYGARDEN), 9 conectadas sin gasto. No había vista de Google, Hoy decía
"Reconectar" para un problema de permisos y la auditoría de keywords no la
corría nadie desde septiembre.

**Incidente del día:** a las 10:07 alguien reconectó Google. El callback creó
una conexión NUEVA (el nombre por defecto no coincidía con el de la vieja),
se borró la vieja y las 21 cuentas de Google quedaron sin conexión: esa noche
no entraba un dato. Arreglado (`8f97cd9`): reconectar refresca la conexión
existente y re-vincula las sueltas; borrar pasa las cuentas a la otra
conexión activa; al arrancar se re-vinculan (21/21 verificado en producción).

**Hecho:**
- Hoy: sin permiso pide el acceso a ESA cuenta, con su número (`40b3a6b`).
- Pauta → sección Google Ads, cuenta por cuenta (`ad5a6c9`, `178b371`).
- Regla `keywords_google` (`077567c`, `2f6453b`): negativas por campaña y
  palabras clave a pausar, aprobables en Hoy con ensayo validateOnly.
- Antes de la primera corrida, probada en lectura contra Distrillantas y COSA:
  proponía negativizar "distri llantas" (la marca separada) e "inmobiliarias
  rosario" por 8 clics. Ahora la marca se compara sin espacios, y solo se
  propone con evidencia (a la tasa de la cuenta, ≥2 conversiones esperadas).

### 11/10 tarde: lector propio de redes públicas para la competencia

**Pedido:** integrar ScrapeCreators; después, "reemplazá por ScrapingBee que es
gratis"; al final: "construí nuestra propia herramienta". ScrapeCreators quedó
hecho en la rama `competencia-scrapecreators` (sin deployar, es pago).
ScrapingBee tampoco es gratis (1.000 créditos una vez, después US$49/mes) y no
lee Instagram. La API gratis de la Biblioteca de Anuncios de Meta solo da avisos
comerciales de la UE: no sirve para competidores argentinos.

**Lo medido:** Business Discovery leyó 26 de 171 competidores con Instagram;
145 "no encontrada" (muchos usuarios adivinados por agentes: "Terreno Pilar
Premium", "AutoCaucho Industrial Argentina"). De los fb_page_url, 299 son
sitios web, 84 páginas y 8 links de la Biblioteca con view_all_page_id.

**Hecho (`b04e5fd`, `8471231`, migración 0157):** `redes-publicas.ts`.
- Instagram: el pedido público de la web (perfil + 12 publicaciones), que
  distingue medida / privada / no existe.
- Facebook: Graph API, si la app tiene Page Public Content Access.
- Reglas: sin cuentas, 15 lecturas por vuelta a 20 s, sin proxies ni captchas;
  si frena, corta y reintenta.
- Lo que Business Discovery no devuelve pasa por ahí.
- `get_redes_publicas` / `lmtmRedesPublicas` para agentes y Claude.
- `add_client_competitor` rechaza usuarios de Instagram que no existen.

**Probado en producción (18:25 UTC), por el conector:** Instagram respondió 429
a la PRIMERA consulta: frena la IP de Railway (servidor en la nube). Facebook
respondió (#10): la app no tiene Page Public Content Access. Hoy el lector no
mide nada nuevo. Queda prendido porque es inofensivo: una consulta por vuelta,
corta al primer freno y reintenta cada 3 h; la validación de competidores deja
pasar si está bloqueado. Para que mida: pedir PPCA a Meta (gratis, revisión)
y/o correrlo desde una conexión residencial, o ScrapeCreators (pago, rama lista).

**PPCA pedido a Meta (11/10)** en la app 1411059550398601, con screencast
(Downloads/LMTM-OS-PPCA-screencast.mp4). Al aprobarse no hay que tocar código:
la vuelta de cada 3 h lee las 92 páginas sola. Verificar entonces fb_estado y
competencia_posts con usuario `fb:%`.

**Limpieza de competidores (aprobada por el usuario):** 4 agentes verificaron
con buscador y sitios web (nunca Instagram directo) los 145 que Business
Discovery no encontraba. Ninguno de los usuarios cargados era correcto:
- 79 inventados → borrados.
- 34 con su Instagram real → corregidos; los mide la próxima vuelta.
- 11 sin Instagram → usuario sacado.
- 21 dudosos → sin tocar; un agente los revisa con DuckDuckGo.
- Los 299 sitios web cargados en el campo de Facebook pasaron al campo web.
- Total: 502 → 423 competidores. Respaldo de las 423 filas tocadas, con la
  prueba de cada veredicto, en `C:/Users/Administrator/lmtm-os-respaldos/`.

**Guardia (`f9610d9`):** `add_client_competitor` exige una fuente comprobable
desde el servidor (Instagram de empresa por Business Discovery o sitio que
responda). La versión anterior dejaba pasar si Instagram frenaba, y desde
Railway frena siempre.

**Vuelta corregida (`9f787cb`):** un 429 del lector propio cortaba toda la
vuelta (medía 3 de 37); ahora Business Discovery sigue con el resto. Primera
vuelta después del arreglo: 25 cuentas y 730 publicaciones nuevas. Cuentas de
Instagram de la competencia medidas: de 26 a 55. Dudosos: un agente con
buscadores (DuckDuckGo pidió captcha, Brave cortó a las 5 consultas) corrigió
2 y borró 3 (Happy Hop ×2, Bien Simple); Hotel San Remo no se borró (confianza
media). Quedan 12 por leer (tope de 40 por vuelta) y 16 sin resolver.

### 11/10: Contenido generado, gasto por herramienta y Claude genera

**Pedido:** una sección con todos los links de lo generado por Higgsfield y
Magnific, el guardado en Drive como siempre, los créditos gastados por
herramienta, y que Claude use todas las herramientas de los agentes (crear
videos incluido) por el conector LMTM.

**Lo que había:** en la base, 2 piezas generadas en total (las dos del 14/8);
el barrido de la etiqueta "generar contenido" corre pero nadie etiquetó. El
guardado en Drive (`super redes/<cliente>/VIDEOS|PLACAS`) seguía intacto.
Ningún costo quedaba registrado. El conector no tenía cómo generar y le
faltaban 12 herramientas de los agentes (ClickUp, planillas, keywords…).

**Hecho (`1142922`, migración 0156):** `contenido_gastos`, una fila por
generación pagada (herramienta, modelo, créditos/US$ cotizados, origen,
pieza; null si no lo informa, como Magnific). Pantalla /contenido/generado
(menú y desde Contenido): gasto por herramienta, por cliente, lo pagado sin
pieza entregada, y cada pieza con sus links de Drive y su tarea. Conector:
lmtmGenerarContenido (libre, al Drive del cliente), lmtmGenerarPieza (tarea
de ClickUp, con soloPrompt), lmtmContenidoGenerado, lmtmEstadoGeneracion y
lmtmHerramientaAgente (cualquier herramienta de agente por nombre). La
generación libre exige tablero: los agentes no gastan créditos por ahí.
Skill para claude.ai: `Downloads/lmtm-contenido.zip`.

**Ojo:** al plan le quedan 44,5 créditos y un video seedance_2_5 cuesta 56:
el próximo video sale por la API (si tiene saldo) o falla.

### 08/10: la mañana revisada, oportunidades primero, competencia medida y plan personalizado

**Lo que corrió solo (verificado en la base):** motor a las 8:33, incidente de
SKYGARDEN a las 8:33, resumen a las 9:02, runner a las 8:34 (3 investigaciones) y
a las 11:00 (revisión del piloto, 3 clientes, 78 s promedio). Ideas diarias de
Super Redes: 55 hoy y 59 ayer, cargadas en ClickUp a las 2:20 (sigue activa).

**Números que el resumen de las 9:00 afirmaba sin ser ciertos (`9297f4c`):**
- SEBASTIAN y RENO "con la cuenta de Meta frenada": cuentas viejas con deuda y
  sin gasto en 30 días; la activa gastaba $29.000 por día. La caída del cliente
  (21.708) se le cargaba a la cuenta muerta. Frenada ahora exige gasto reciente.
- "Gasto diario antes de frenarse" mezclaba la caída del cliente: dos datos.
- Lo investigado por el agente el 6/10 ("hoy es 6/10") salía como de hoy: fecha.
- "Tendencias de hoy": ICC de septiembre 2025 y una nota de octubre 2025.
- Ideas con "promoción de otoño" en primavera: el prompt lleva fecha y estación.
- Ventana del gasto caído: decía 3 días, el número era de 4.
- "Cargar saldo: se frena en 36 días" ya no es decisión (solo si se agota en 7).

**Oportunidades arriba (pedido: "que las principales sean de contenido o
upsell"):** regla `oportunidades` en el motor desde el análisis de contenido:
repetir el post de 2 semanas que dobló lo normal (con pauta: probarlo como
anuncio), ofrecer pauta (sin anuncios en 30 días) y el ángulo del rubro que no
usa. Con "subir presupuesto" van primero en Hoy y abren el resumen; el saldo por
cargar va en una línea. Vista previa con datos reales: 8 repetir/upsell (DOMINGO
BISIO reel 10,9× sin pauta; SEBASTIAN reel 4,2×), 9 ángulos, 4 subir presupuesto.
Primera corrida real: mañana 8:30.

**Nichos sin ángulos:** 5 de 6 hoteles y 4 de 5 de materiales no tienen ni una
publicación propia con métricas (sin sync orgánico); MAERS tiene 53 pero su
interacción normal es 2. Sin datos propios no se puede afirmar nada.

**Competencia medida (`56bc3ef`, migración 0155):** los 485 competidores tenían
una nota a mano y nadie medía qué publicaban. `competencia-ig.ts` lee con
Business Discovery (conexión de Meta existente) hasta 30 posts por cuenta, 40
cuentas cada 3 h; usuario mal cargado o cuenta personal quedan con su motivo.
Mismo índice y clasificador que lo propio, en ranking aparte. Llega a Nichos ("La
competencia"), a las ideas de Super Redes y a la herramienta de nicho.

**Plan de acción personalizado:** dice dónde está parado el cliente (pauta y
orgánico medidos, leída la pauta del gasto real) y arma las acciones con su
contenido (post a repetir, su ángulo, el del rubro, el de la competencia) y su
pauta con las decisiones del motor; sin pauta, el contenido va primero. Se fue
"Revisar la pauta con el análisis estratégico" y "Sostener el ritmo".

**Piloto, día 3:** runner 14 propuestas, Milo 28; evaluador acumulado: runner
58/58, Milo 70/73. Ninguna aprobada ni descartada por una persona en 3 días.

**Para mañana (09/10):** motor 8:30 con oportunidades y sin las dos frenadas
falsas (deben quedar vencidas); resumen 9:00 arrancando por oportunidades;
primera tanda de competencia medida (cuántas cuentas, cuántas no encontradas).

### 07/10 tarde: ni un número falso, y qué contenido funciona

Pedido de Nazareno: "que no haya ni un número falso, quizás en el semáforo"; "que
los consejos sean sobre contenido: ángulos que funcionan, ideas, formatos según el
nicho; mantener Nichos pero pulido; mejora constante comparando todas las cuentas".

Números que mentían (verificados contra la base, solo lectura):
- **Salud /100:** lo no medido valía 50 (pauta, operativa) o 100 (contenido sin
  leer la página): clientes sin ningún dato daban 78; MONDINO daba 100 con "saldo
  crítico" de razón. Ahora solo pesa lo medido; sin nada medido, no hay número.
- **Saldo crítico:** salía de 30 avisos del 3/9 que nunca se cerraban. El
  vigilante ahora cierra lo que volvió a leer y ya no falta (mismo criterio que el
  motor). 536 avisos de más de 21 días se leían como problemas de hoy.
- **Semáforo:** un cliente sin datos salía verde; ahora "sin datos para juzgar".
  Cumplimiento del cotizado: sale de las publicaciones leídas de Instagram (23
  clientes) y no de la etiqueta "mandado a make"; ClickUp queda marcado sin verificar.
- **Score de pauta/operativa:** contaba el día a medio sincronizar y alertas de
  meses; operativa sin fechas valía 75/55/50 inventados. Sin pauta: null, no 0/100.
- **Orgánico:** las 3.644 publicaciones tenían score 0 (métricas leídas con otro
  nombre): nada sabía qué funcionaba. Arreglado.
- **Benchmarks por rubro:** mezclaban CTR de Google búsqueda con Meta (ideal de
  automotor 21,77%) y las 19.103 "conversiones" de MA PROPIEDADES en Google (ideal
  de CPL de inmobiliaria $263). Ahora CTR de Meta y CPL sin conversiones dudosas.
- **Moneda:** GALA tiene costo por clic 0,15–0,28: sus cuentas están en dólares y
  se sumaban como pesos. Migración 0154: el vigilante guarda la moneda que informan
  Meta y Google. **Pendiente:** con el dato de mañana, ver qué cuentas no son ARS y
  separarlas de las sumas en pesos.

Contenido (`70b3395`):
- Ángulo de cada publicación (migración 0153), clasificado cada hora con los 18
  ángulos + 7 del orgánico. Cada publicación se mide contra lo normal de SU cuenta
  y red (cuenta chica y grande se comparan sin que gane el tamaño). Primer corrido
  real: 1.458 publicaciones de 23 cuentas; reels de Instagram 1,5× lo normal,
  fotos 0,75×.
- Lo usan las ideas de Super Redes, el rol de contenido y get_niche_intel (citan
  el dato). Panel: "Qué funciona" en Contenido, tarjeta en Hoy y `/nichos` nuevo
  con todo lo de la pantalla vieja.

- **El modelo de texto de NVIDIA había muerto (410)** y nadie se enteró: las ideas
  caían a MiniMax en silencio, la voz de marca dejó de aprenderse y el
  clasificador no clasificó nada en su primera vuelta. Probado contra la API:
  `nemotron-3-super` (texto) y `gpt-oss-20b` (clasificar y respaldo automático ante
  404/410). También en `litellm-config.yaml`.
- También: pestaña "Qué funciona" en la ficha del cliente, resumen de los lunes con
  lo que mejor funcionó en la semana, Inteligencia sin salud inventada.
- Ángulos: con la lista sin "emocional" los posteos aspiracionales caían en
  vitrina/novedad; se sumó la categoría y el clasificador usa el modelo grande. A
  las 16:56: 400 clasificadas (63 emocionales), 2.000 en cola a 500 por hora.
- Ficha del cliente (Resumen): "Iniciativas activas 0 · Across 14 agents" y "The 14
  agents are idle" estaban fijos en el código; fuera. Resultados de 30 días sin las
  conversiones dudosas de Google, con aviso. Fuera el test huérfano de Dashboard.tsx.

- Clasificador: 3 de cada 4 lotes daban HTTP 400 porque un `.slice` partía emojis
  (pares sustitutos sueltos en el JSON); se limpian en `llamar()`. Después, el
  modelo que razona se quedaba sin tokens: 12k y respaldo al rápido. A las 18:47:
  1.120 clasificadas, 0 lotes fallidos, 1.277 en cola.
- **Voz de marca:** nada la llamaba desde el 14/9 (2 clientes). Ahora cada 7 días:
  primera vuelta 22 clientes aprendidos, 34 sin publicaciones, 2 fallados.

- **08/10 00:07, vigilantes con el código nuevo (verificado):** los 59 clientes con
  salud nueva (13 sin número: nada medido); avisos de saldo abiertos 35 → 24 (los
  que quedan son de cuentas que ya no se leen, más de 21 días, fuera de salud y
  semáforo); monedas guardadas: 46 ARS, 3 USD, 1 INR, 1 CLP, 8 Google sin dato.
  Gastando en otra moneda en 30 días solo GALA (USD): fuera de sumas y benchmarks
  en pesos, nombrada "en USD" en Nichos, ficha en su moneda (`577d8dc`).
- Ángulos: 2.361 clasificadas al cierre del 07/10 (quedan las nuevas de cada día).

**Para mañana (08/10):** vigilantes de la mañana → salud nueva estampada y avisos de
saldo viejos cerrados; monedas guardadas en `ads_account_mappings.currency` →
separar cuentas no ARS de las sumas en pesos; resumen de las 9:00 sin cambios de
formato (el bloque de contenido sale solo los lunes, 12/10).

Verificación: tests propios 65/65, tsc server y ui limpios, ui 403/403. Las 64
fallas de la batería completa son de paperclip (base embebida que no corre en
Windows), ninguna toca lo cambiado.

### 07/10 mañana: avisos honestos, panel nuevo y optimización del equipo

Pedidos de Nazareno: "las alertas notificaban cosas que no eran reales"; "todo
panel nuevo, sin lo viejo; Hoy más fácil de atacar y que no todo sea pausar";
"Super Redes con Higgsfield/Magnific, el alta desde ClickUp y licitaciones tienen
que seguir"; y el optimizador de equipos de agentes como objetivo.

- **Avisos (`2bf39c0`, en prod):** auditado `wa_outbox` 05–07/10. Seis señales
  mentían (DUNOD "98 días" sin leer su página, el despachador acusado de sobrar,
  fallas de Make del 2/10 repetidas, "destino de papel" con post del día,
  plantillas y pruebas, tendencias con links inventados). Los monitores corrían
  con cada deploy: `tocaHoy()` persistido. El resumen muestra la última foto de
  cada monitor. Tests 375/375.
- **Contenido (`4d00e27`, en prod):** sección principal nueva; calendario de Super
  Redes de toda la agencia (ClickUp en vivo) y "Generar" con la generación de
  siempre, viendo el pedido antes de pagar. Fuera "Sistema"; /dashboard → Hoy.
- **Hoy (`6bc5793`):** por tema, la acción a la vista, tareas que esperan a una
  persona contestadas en el lugar, propuestas de pauta abajo.
- **Paleta (`52ac34c`):** lo de antes adentro de la app con los colores de LMTM;
  conexiones y preparación en el shell.
- **Optimización (`e68dd11`):** `OPTIMIZACION-EQUIPO.md` (A–J con datos de prod).
  Fase 1 aplicada en prod: rutinas de Pablo que duplicaban al motor en pausa
  (abrían ~28 tareas bloqueadas por semana) y latido de la flota a 12 h (287
  corridas por reloj en 7 días, Delfina contestando "no tengo tarea").
- Verificado: licitaciones activa (hoy 10:02), alta por ClickUp montada
  (`/api/clickup`, secreto cargado), Higgsfield y Magnific con credenciales.
- **Limpieza con OK de Nazareno:** 165 tareas viejas de "recargar saldo /
  spendCap" (99 de Pablo desde el 20/07, 66 de Milo, Caro, Luna, Carla y
  Esteban) canceladas con comentario de motivo; las que mezclaban otra decisión
  (creatividades, reuniones, bajas, mapear) quedaron abiertas. El saldo lo sigue
  la decisión del motor en Hoy.
- **Agentes** muestra la flota heredada (`/api/agentes/flota`); los monitores
  que quedaban con el día en memoria (vigilantes, ideas, eval) pasaron a
  `tocaHoy`. Hoy suma la tarjeta de Contenido de la semana.
- **saas-marketing-agents (`b851864`):** reglas tomadas para media buyer,
  contenido y estratega (ver INVESTIGACION.md). El sync trae la categoría
  especial de Meta; se verificó que la de vivienda no es obligatoria en Argentina.
  Cambia el rol del media buyer en el día 2 del piloto: se anota en PILOTO.md.
- **Más pantallas en la app nueva:** Licitaciones (`5034b30`, el porqué se
  escribe en el lugar), Pauta (`2d63061`, cuentas para mirar → tablero en la
  ficha), Avisos de WhatsApp (`242d372`, registro del embudo + ensayo del
  resumen), Finanzas (`ccbdeba`). Quedan con la paleta nueva pero sin rehacer:
  Semáforo, Inteligencia (sus "intervenciones" repiten parte de Hoy: pensar
  antes de rehacer) y WhatsApp (vínculo del celular y grupos).
- Motor: los clientes de prueba (`interno-test`) no abren decisiones (`81f8dc4`).

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
- **Segundo fallo:** credencial con `run_id` vacío → 401 en todas las
  herramientas (los agentes dijeron "no se puede saber", no inventaron).
  Arreglo `4a73c5a`; además una corrida sin una sola respuesta de herramienta
  es fallo, no "hecho", y al arrancar se corrigen las viejas.
- **La app no scrolleaba** (body de paperclip con overflow hidden): `d150c0b`.
- **Sync diario sin conjuntos** desde agosto (79 con gasto sin fila, el resto con
  estado y presupuesto de agosto): `084baae`, con test. Verificado: 276 conjuntos
  refrescados en la primera corrida.

**Verificado en producción, 06/10 15:48–16:00 ART:**
- Revisión diaria del piloto en el runner: 22 propuestas, **22/22 defendibles**
  (Milo en paperclip, mismo día: 20/22). 4 min, 173 mil tokens de entrada.
- Las 7 "dejó de gastar" investigadas, cada una con causa y números: BRACHETTA y
  MAERS (campañas vencidas sin reemplazo; las nuevas de MAERS con objetivo de
  interacción), MA PROPIEDADES (10 de septiembre vencidas, 2 sin reemplazo y una
  cuenta sin saldo), Distrillantas e INBELT (Meta al 95,8% y 98,4% del tope:
  entrega racionada), LoMasFundas (Google sin entrega desde el 04/10, Meta
  desconectada), COSA (caída chica y repartida: no se puede saber). Se ven en Hoy
  al abrir la fila.
- `pauta:sin_leads` en producción (16:10): 4 de 5 con causa y concepto de
  reemplazo (BOERO: «REsearch x2» 38.973 clics y 0 leads, keywords
  informacionales; SEBASTIAN: el conjunto es de una campaña de interacción, no se
  arregla con creativo). PKT GLOBAL falló el formato estructurado: ahora se
  rescata el último intento (`6675f9c`); y un resultado sin ninguna herramienta
  consultada es fallo.

**Sumado la misma tarde:**
- Rol **estratega** (`1d6d69b`): lunes 11:00 reescribe el informe automático de
  cada cliente. Probado en local con datos reales de Distrillantas y el auditor
  real: aprobado en el segundo intento. Primera corrida real: lunes 12/10.
- Rol **contenido** (`32f9ec7`): cada `cadena:sin_calendario` (28) recibe un
  calendario de 2 semanas en la voz del cliente, como propuesta en Hoy.
- **Resumen de las 9:00** (`7635f4d`): debajo de cada decisión que pesa, lo que
  ya averiguó el agente.
- **Hoy**: propuestas de pauta de los agentes (estaban solo en Aprobaciones de
  paperclip: 44 sin ver), una por acción, aprobar / rechazar con motivo / en tanda
  por cliente (`6c207a0`); evolución de la plata parada (`1043e27`, se llena desde
  la corrida del 07/10).
- **App**: Semáforo, Pauta, Contenido, Inteligencia, Licitaciones, Finanzas y
  WhatsApp dentro del shell propio (`d816ce2`); título "LMTM" (`cfdb4ba`).

**De noche (06/10 23:00–00:00):**
- Los 28 calendarios de contenido salieron (1,3 M tokens). Revisados a mano: buena
  voz y fechas, pero con afirmaciones sin fuente ("vendimos +100 propiedades",
  "pileta y spa"): regla explícita y paso de revisión (`7297fae`). Los 28 ya hechos
  quedan como propuesta para revisar.
- Plantillas de ClickUp fuera del runner (`62e2e06`).
- Agentes: tarjeta por rol con la nota del evaluador (`137dd92`); el evaluador pasó
  a `metricas/eval-recientes.ts`. API verificada: media buyer 29/29, Milo 20/22.
- **Sync diario una vez por día de verdad** (`1be34f0`): con el día en memoria,
  cada deploy disparaba el sync completo (~12 el 06/10). Verificado: el arranque
  de las 23:45 no disparó otro.
- Login en castellano y con la marca (`e9c6bdd`).

**Qué queda (C):** rol inteligencia y operaciones en el runner; apagar por rol los
agentes de paperclip cuando el del runner gane en el evaluador (media buyer:
22/22 vs 20/22 el primer día, falta más de un día); C3 retiro de paperclip.

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
