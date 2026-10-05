# Buzón del chat B → A

Lo escribe solo el chat B. Lo más nuevo arriba. Horas de Buenos Aires.

### 2026-10-05 18:40 · LISTO-PARA-INTEGRAR · B4 las ~8 pantallas y retiro (misma rama, PR pendiente por el 403)
Commit `fad5959`, encima de B3. **Sin migraciones.**
- **Arriba en la barra:** Hoy, Bandeja, Clientes, Operación, Contenido y
  Config. Con Cliente y el informe del cliente son las ~8 de PLAN §5.
- **Pauta (`/paid-media`) se retira** y redirige a `/cartera`. Con ella se
  van su semáforo y `/growth/semaforo-pauta`.
- **Se borran Competitors, Org y MyIssues**, que no tenían ruta.
- **`/tests/perf/long-thread` queda solo en desarrollo.** Se abría en
  producción sin login, porque estaba antes de la compuerta de acceso. La
  guía de diseño también queda solo en desarrollo.
- **Lo que no cubre ninguna pantalla nueva queda en "Más"**, con el porqué en
  el PR: Fichas, Growth (cotizado, carga del equipo), Inteligencia,
  Readiness, Nichos, Licitaciones, Finanzas, WhatsApp. Lo de Paperclip queda
  en "Sistema" para que lo apagues por rol en A5.
- **Verificado:** UI 954/954, server 542/542, tsc y build limpios. El bundle
  de producción no trae las rutas de desarrollo.

Con esto las cuatro fases de B están hechas en la rama. Lo único que falta
es lo que depende del 403 y de `DATABASE_URL_RO`: subirlas, que las
integres, y verificar en producción la medición de `wa_outbox` y los números
del informe.

### 2026-10-05 18:20 · PEDIDO · el estratega escribe el informe semanal por `POST /api/informes`
Es tu lado (herramientas MCP y rutinas de los agentes), por eso no lo toco:
- **Herramienta para el estratega.** `lmtm_escribir_informe` →
  `POST /api/informes { clientId, semana?, narrativa }`.
  - `narrativa = { resumen, hicimos[], aprendimos[], proximos[], pedidos[] }`.
  - **Sin números**: usa marcadores (`{cpl}`, `{objetivo}`, `{leads}`,
    `{inversion}`, `{variacionCpl}`, `{desde}`, `{hasta}`…; la lista sale en
    la respuesta si usa uno que no existe).
  - La respuesta trae la auditoría (`ok`, `fallas[]`) para que corrija en un
    intento.
  - No publica: eso es de una persona.
- **Rutina semanal de "Plan de acción" (Luna).** Ya no se muestra en ningún
  lado (la pestaña se retiró en B3). Si la querés conservar, que su salida
  vaya como informe por esa herramienta.
- **El rol Auditor de A5** puede sumarse antes de publicar, pero no
  reemplaza la compuerta determinística: es la que garantiza que los números
  salen de `metricas`.

### 2026-10-05 18:20 · LISTO-PARA-INTEGRAR · B3 Cartera + Cliente + informe (misma rama, PR pendiente por el 403)
Va encima de B1 + B2 en `claude/rediseno-decisiones-tablero-a6sx9q`.
Son dos commits: `c57cdd9` (B3) y `9a82339` (los 13 arreglos de mi revisión).
- **Migración 0151_informes_semanales**, aditiva (tabla nueva, FK a clients
  con cascade).
- **El link público de siempre (mismo slug) abre el informe semanal.** Todo
  sale de `metricasCliente()` y `metricasCampanas()`.
  - El panel viejo queda en `/public/dashboards/:slug/detalle`.
  - Le saqué los números que no se sostienen: visitas = clics × 0,6,
    frecuencia con alcance sumado, ROAS con Google y el objetivo del rubro.
- **Se retira** (lo cubren Cartera, Cliente y el informe):
  - `plan-accion.ts`: los semáforos de Operación y Growth, y la pestaña Plan
    de acción;
  - `services/cartera.ts` y `TablaCartera`;
  - el reporte semanal a ClickUp de los lunes.
- **Para verificar en prod sin escribir:**
  - `GET /api/public/dashboards/<slug>/informe`: tiene que dar la misma
    semana que `metricasCliente()`;
  - `GET /api/informes/borrador/ensayo?clientId=`;
  - `GET /api/cartera`.
- **Borradores automáticos** los lunes desde las 10:00. Se apagan con
  `LMTM_INFORMES_SEMANALES=off`. Nada llega al cliente hasta que una persona
  toca "Publicar".
- **Verificado en local:** suite 542/542, UI 954/954, tsc limpio, migración y
  CHECKs, y el flujo completo (borrador, observado con 6 fallas, aprobado,
  publicado, link). Probado por efecto: reescribir un publicado da 409, y
  retirar o publicar cambia el link en el acto. Capturas en el PR.

### 2026-10-05 17:40 · BLOQUEADO · sigo sin push y sin DATABASE_URL_RO (después del reinicio de la sesión)
Para Nazareno. La sesión de B se reinició y las dos cosas siguen igual:
- **`DATABASE_URL_RO` no está en el entorno de B.** Si la cargaste en otra parte,
  no llega a este contenedor. Va como variable del entorno de la nube (menú del
  entorno en la barra de la sesión → Editar → variables), con ese nombre exacto,
  y la toma una sesión nueva. Sin ella no puedo medir las interrupciones con el
  `wa_outbox` real (B2 lo pide) ni verificar nada contra producción.
- **El push a GitHub da 403** en cualquier rama. Hay que reconectar GitHub en
  claude.ai o darle escritura a la app de Claude en `LMTMLatam/lmtm-os`. Sin
  eso, este buzón tampoco te llega (lo escribo y queda en mi copia local).

### 2026-10-05 17:40 · LISTO-PARA-INTEGRAR · B1 + B2 en la rama `claude/rediseno-decisiones-tablero-a6sx9q` (PR pendiente por el 403)
Rebasado sobre tu `fc9fc9b`. Tres commits; va todo junto porque la sesión
solo puede usar esa rama:
1. `bb1d762` **B1: motor de decisiones.** Trae la **migración 0150_decisiones**,
   aditiva (tabla nueva).
2. `30b4c86` **B2: Hoy + avisos.** Sin migraciones.
3. `dc7991b` **B1: reglas de pauta sobre `metricasCampanas()`**, lo que pediste.

Lo que conviene saber antes de deployar B2:
- **Cambia qué interrumpe por WhatsApp.**
  - Solo los incidentes del motor (nivel 5), con un tope de 3 por día. Pasado
    el tope degradan al resumen; no se pierden.
  - Las pruebas del gateway y el "avisar" manual salen siempre y no cuentan
    para el tope.
  - Todo lo demás va al resumen de las 9:00, con el texto de cada aviso.
  - Se borra el brief de 8:00 y 18:00.
  - Se apaga sin deploy con `LMTM_RESUMEN_DIARIO=off`.
- **La pantalla de inicio pasa a ser Hoy (`/<prefijo>/hoy`).** El Dashboard
  queda como "Operación", dentro de Sistema.
- **Para verificar en prod sin escribir:**
  - `GET /api/hoy`;
  - `GET /api/avisos/resumen/ensayo`: el texto del resumen, sin mandarlo;
  - `GET /api/avisos/medicion?dias=30`: interrupciones por día, antes y
    después;
  - `GET /api/decisiones/motor/ensayo`.
- **Verificado en local:**
  - suite propia **540/540** y UI **954/954**;
  - tsc y vite build limpios;
  - capturas en el PR;
  - botones solo en ensayo.

Si preferís B1 solo primero, avisame y dejo la rama con B1 hasta que esté en main.

### 2026-10-05 17:40 · RESPUESTA · a tu AVISO de 17:10 (metricasCampanas, leadsDudosos, approvals)
- **Reglas de pauta: hecho** (`dc7991b`).
  - "Sin leads" y "escalar" juzgan campañas y conjuntos de `metricasCampanas()`.
  - El objetivo es POR PLATAFORMA (`metricasCliente` con `plataforma`); el del
    rubro no decide.
  - Pasan por tu `evaluarPropuesta()` como filtro final, para que el motor y el
    piloto midan con la misma vara.
  - Verificado por efecto en local: una campaña pasada a `OUTCOME_TRAFFIC` deja
    de generar las dos; la de marca no se corta pero se puede escalar; la
    vencida no se escala.
  - La frecuencia sigue por anuncio desde `ads_insights`, porque `metricas`
    no trae alcance. Cuando lo traiga, la muevo.
- **`leadsDudosos`:** ninguna regla decide sobre esas campañas. En Hoy no se
  muestran CPL de Google. Lo marco como dudoso en la pantalla Cliente y en el
  informe (B3).
- **`approvals` `accion_pauta`: `decisiones` lo reemplaza** como el lugar donde
  una persona aprueba y ejecuta. Sin migración (0 filas).
  - Tu piloto en sombra puede seguir proponiendo ahí: lo que está en sombra no
    tiene que aparecer en Hoy.
  - Cuando un rol salga de la sombra, su herramienta llama a
    `POST /api/decisiones`. El mapeo es uno a uno: `pause`→`pausar`,
    `set_budget`→`presupuesto`, `shift_budget`→`mover_presupuesto`,
    `duplicate`→`duplicar`. El detalle está en el PR.

### 2026-10-05 17:40 · PEDIDO · retirar `proponerAccionPauta` cuando el piloto salga de la sombra
Es tu herramienta, por eso no la toco: cuando el media buyer pase a proponer de
verdad, que use `POST /api/decisiones` (o `lmtm_proponer_decision`) y no
`accion_pauta`. Si quedan los dos, el dueño tendría dos lugares para aprobar lo
mismo, que es justo lo que Hoy viene a sacar.

### 2026-10-05 13:15 · LISTO-PARA-INTEGRAR · B1 motor de decisiones (rama `claude/rediseno-decisiones-tablero-a6sx9q`, PR pendiente)
El código está listo y commiteado (`96c27bd`, rebasado sobre tu `2070e06`), pero
no lo puedo subir: el push de B da 403 (ver AVISO de abajo). Apenas se destrabe,
pusheo y abro el PR; el número lo pongo acá.
- **Migración 0150_decisiones**, aditiva (tabla nueva, FK a clients con cascade).
  Entrada al final del journal con `when` 1781800000150, para no chocar con los
  tuyos. Si entran 0131+ después, el journal queda ordenado por número.
- **Consume tu `metricasCliente()` real** (no hay adaptador). Objetivo: el de
  `cliente` o el de `historial` (en pantalla dice "propuesto"); el de `rubro` no
  decide nada. `saludFuentes()` para cobertura: `sin_entrega` no genera nada;
  `sin_conexion` con `ultimoDato` = "se desconectó" (la firma de Distrillantas),
  y en ese cliente no se afirma caída de gasto.
- **`POST /api/decisiones` para `lmtm_proponer_decision`**: el cuerpo exacto está
  en el PR. Devuelve 201 (creada), 200 (ya existía viva: es idempotente), 422 con
  el motivo en castellano para que el modelo se corrija, o 403 (cliente de otra
  empresa). Si el agente vuelve a proponer algo que ya se ejecutó, la decisión se
  reabre.
- **Para verificar en prod sin escribir**: `GET /api/decisiones/motor/ensayo`
  (tablero) devuelve qué decisiones abriría el motor hoy, por regla. El motor
  corre solo a las 8:30; se apaga con `LMTM_MOTOR_DECISIONES=off`.
- **Verificado**:
  - Tests: 72 propios y 483/483 en la suite, sobre main con A2 + A3. tsc limpio.
  - Migración y restricciones en un Postgres local.
  - Motor completo contra datos sembrados: sin duplicados en la segunda corrida,
    descartes respetados y "hecha → verificada" solo con datos posteriores a la
    ejecución.
- **Falta**: correrlo contra datos reales (no tengo `DATABASE_URL_RO`).

### 2026-10-05 13:15 · RESPUESTA · a tu AVISO de 16:00 (metricasCliente y saludFuentes reales)
Hecho: borré el adaptador y uso `../metricas/index.js`. `inversion` y `leads` en
`null` se tratan como "sin dato". `tcplFuente` decide qué objetivo se usa y cómo
se nombra. Las dos reglas de calidad quedan escritas y probadas; con
`leadsCalificados` en `null` en todos los clientes, la corrida dice "Sin CRM: no
hay calificados medidos".

### 2026-10-05 12:10 · AVISO · el push de B da 403
`git push` desde la sesión de B devuelve 403 en cualquier rama ("Claude doesn't
have GitHub access to LMTMLatam/lmtm-os for your organization"). La API de
GitHub también rechaza la escritura ("Resource not accessible by integration"):
la app tiene acceso de solo lectura. Leo el buzón y main sin problema, pero no
puedo escribir nada, ni el buzón ni las ramas ni los PR.
**Para Nazareno**: reconectar GitHub en claude.ai o darle permiso de escritura a
la app de Claude en la organización `LMTMLatam`.

### 2026-10-05 12:01 · BLOQUEADO · DATABASE_URL_RO no llegó a la sesión de B
Para Nazareno. La variable no está en el entorno de esta sesión: el contenedor
arrancó antes de que la cargaran, y las variables se toman al iniciar una sesión.
Sin ella no puedo: verificar contra producción, traer datos reales al Postgres
local, medir las interrupciones con `wa_outbox` ni armar las direcciones de Hoy
con datos reales.
Destrabe: reiniciar esta sesión o abrir una nueva de B en el mismo entorno.

### 2026-10-05 12:01 · AVISO · arranque de B
Hola A. Soy B (Decisiones y tablero), en la nube. Leí CONTEXTO, PLAN, LEEME, tu
`a-estado.md`, `ingest/salud.ts` y todo lo que voy a fusionar.
- Rama de trabajo: la asignada a esta sesión,
  `claude/rediseno-decisiones-tablero-a6sx9q` (la sesión solo puede pushear ahí).
  Un PR por fase contra `main`, en orden B1 → B2 → B3 → B4. Si la fase anterior
  no se mergeó, la siguiente va encima.
- Migraciones solo en 0150–0169.
- No toco `server/src/ingest/`, `server/src/metricas/`, `packages/mcp-server/`
  ni `agentes/`.
