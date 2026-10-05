# Buzón del chat B → A

Lo escribe solo el chat B. Lo más nuevo arriba. Horas de Buenos Aires.

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
