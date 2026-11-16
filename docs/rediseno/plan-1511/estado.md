# Plan 15/11 — estado y bitácora

Plan: `PLAN.md` (copia del aprobado). Inventario: `inventario.md`. Consultas de línea de base: `linea-base.sql`.

## Decisiones de Naza (15/11)
- D1–D8: todas sí. Paperclip se saca entero (fase 6), conexiones se mantienen.
- **No se sube el código a GitHub.** Respaldo local: `C:\Users\Administrator\Respaldos\lmtm-os-20261115.bundle` (22 MB, verificado, todas las ramas).
- Publicaciones trabadas: publicarlas. MiniMax: esperar el reinicio de la cuota. CRM: no se audita.
- Tope de gasto para describir material del NAS con IA: **lo fijo yo → USD 20 por mes** (ver fase 3). Con eso alcanza para
  describir unos 600–800 videos cortos al mes a pedido; lo que pase del tope queda en cola hasta el mes siguiente.
- Postgres vacío (`Postgres`, creado 22/08, 0 tablas, 0 conexiones): Naza preguntó por qué borrarlo. Respuesta: solo por costo;
  no se toca hasta que diga.

## Línea de base (15/11, ventana 7 días salvo aclaración)
| Medida | Valor |
|---|---|
| Corridas de la flota | 220, 57 % bien; 93 fallas, ~70 por quedarse sin turnos |
| Tareas bloqueadas | 135 (74 `[HUMANO]`, la más vieja 22/07) |
| Piezas 30 d | 48 placas, 12 videos; 0 con control guardado; Productor 24 bloqueadas / 13 hechas |
| Marca (59 activos) | 54 con fila; 40 con tono; 33 con logo; 19 sin productos; 7 sin NAS |
| Memoria | 3.651 notas, mediana 25 por cliente, máximo 270 |
| Entregables 30 d | 267 planes, 73 reportes, 48 placas, 48 copys, 12 videos |
| Volúmenes | lmtm-os 68 % (3,4/5 GB), lmtm-postgres 31 %, Postgres vacío 3 % |
| Base | 1,1 GB; 8.405 de 13.896 corridas con más de 60 días |

## Bitácora

### 15/11
- **Fase 0:** respaldo `git bundle` verificado; inventario de funciones propias; plan y consultas en `docs/rediseno/plan-1511/`.
- **U1:** 19 publicaciones de Instagram reprocesadas en Make (`POST /dlqs/{id}/retry`, 200 en las 19). Salteadas: INBELT (09/11),
  PKT GLOBAL (16/10) y la incompleta vieja de MAERS POST 130 (misma tarea que la del 14/11).
- **U9:** disco medido: 68 % (bajó del 87 % del 08/11 por el archivado comprimido de logs). No hace falta limpiar ahora.
- **U2:** hallazgo **falso**. El registro ya exige invitación o el link del equipo (`guardaRegistro`, `routes/equipo.ts`);
  verificado en producción: `POST /api/auth/sign-up/email` sin invitación → 403 `REGISTRO_CERRADO`. Corregido en el plan.
- **U4:** los 3 agentes «en error» no están frenados: el estado `error` es el de su última corrida y no impide las próximas
  (heartbeat solo saltea paused / terminated / pending_approval). Causas: Nicolás → cuota de MiniMax (se espera el reinicio);
  Esteban → timeout de 1200 s; Delfina → cancelada por el control. Se atacan en la sección 8 (flota).
- **U5:** 48 tareas cerradas (vencidas, superadas o duplicadas), cada una con comentario del motivo y registro en
  `activity_log`. Respaldo completo en `respaldo_u5_issues_20261115`. Quedan ~92 abiertas: las de producción van a la
  fase 2; las de BM/recargas/GCP son de una persona y quedan.
- **U1 verificado por efecto:** las 19 incompletas quedaron resueltas; su reintento (15/11 13:17–13:18 UTC) terminó con
  status 1 en las 19 (`/dlqs/{id}/logs`). Hotel Lescano (adjuntos `octet-stream`) también publicó.
- **Fase 2 (commit `18de0d4`):** control de calidad guardado (`<archivo>.revision.json`) y exigido en las entregas
  (`metadata.revision`); nivel 1–5 (1–2 no apta); placas: producto visible, lienzo ocupado, nivel de las referencias;
  veredicto humano (`POST /api/contenido/veredicto`, botones Sí/No en Contenido generado, `lmtmVeredictoPieza` también en el
  conector del equipo) → regla fijada `pieza-veredicto:<id>` que la guía de contenido trae siempre; skills de placas y
  video con las reglas del caso BRACHETTA. Tests: 15 nuevos + suites relacionadas; tsc server/ui/mcp en 0.
  **Desplegado** `03e75945` (15/11 13:30 UTC, sin corridas activas): health 200, conector del equipo con 43 herramientas
  (incluye `lmtmVeredictoPieza`), `/api/contenido/veredicto` sin sesión → 401.
  **Falta de la fase 2:** destrabar las tareas del Productor (24) y medir la tasa de «sirve» a 2 semanas.
- **Fase 1 (commits `17ec366` + `2832ce0`, deploys `023bb4be` y `b6de30c7`):** cerebro en tres capas —
  `lmtmEmpresa`, `lmtmCliente`, `lmtmActividad` (+ `/api/cerebro/cobertura`). Verificado por el conector del equipo:
  ficha de BRACHETTA 313 ms, actividad 244 ms, empresa 221 ms; instrucciones del MCP arrancan por el cerebro.
  **Arreglos de fondo encontrados en la fase:**
  1. `nemotron-3-super` muerto (404) y respaldo `gpt-oss-20b` colgado → completar marca, voz aprendida, ángulos,
     plantillas de video y agency-ops devolvían null en silencio. Ahora `nemotron-3-ultra` + respaldo
     `nemotron-3.5-lightning` (gratis, medidos), y el respaldo entra también por timeout.
  2. `seccionesDeMarca` mandaba el título «## Tono de marca» sin sus subsecciones → 10 clientes con Enfoque completo sin
     tono. Arreglado; corrido con forzar en los 10: 7 ganaron tono (MONDINO, MAROPOR, BITTI, Hotel San Bernardo,
     Hotel Lescano, MA DESARROLLOS) o campos (Cliente Natural, ALTECNO sin tono en el documento).
  **Cobertura:** 77 % → 79 % (13 clientes al 100 %). La meta de 85 % depende del equipo:
  - Cuenta de anuncios sin mapear: 27 clientes. Logo: 26. Productos: 19.
  - Enfoque Técnico VACÍO: CAMPO TIMBO, CARVUK, CHARLOTT, Distrito Roldan, GRUPO MA, LoMasFundas, Workera
    (+ «Cliente Inmobiliario» y «TESTEO MARCOS», que parecen de prueba: ¿se archivan?).
  - Randstad y Clean Unity tienen el MISMO Enfoque de 1.691 caracteres (plantilla sin completar).
- **Clientes de prueba archivados** (OK Naza): «Cliente Inmobiliario» y «TESTEO MARCOS» → archived; respaldo
  `respaldo_clientes_archivados_20261115`. Quedan 57 activos.
- **Fase 3 (commit `d174757`, deploy `afef4af5`):** índice del NAS (`nas-indice.ts`, client_context_cache
  source `nas-indice`, nocturno a las 4 + primero a los 3 min) y `lmtmNasBuscar`. Verificado por el conector del equipo:
  Clean Unity 2.760 archivos (817 videos, 631 fotos) indexados sin errores; búsqueda en 318 ms
  («mp4» → 808 resultados). Al cortar la sesión el primer índice seguía recorriendo los demás clientes.
  **Pendiente:** confirmar que terminaron los 50 clientes (`scratchpad/indice.sql`) y que nadie quedó `recortado`.
- **NAS (commit `7916d5a`):** el primer índice llegó a 21 clientes y 128.838 archivos antes del deploy. Arreglados:
  `&amp;` en los href (nombres con «&» daban «no existe», bug también de `nas_listar`), reintento de 502, cachés de
  Premiere/AE/Resolve y Thumbs.db fuera, topes 3000/40000, búsqueda en SQL (2–4 s sin acentos) e índice de los
  clientes faltantes al arrancar.
- **Fase 4 (commit `d3f7b26`, deploy `16c421ec`):** link del conector por persona (Config → «Conector de Claude»),
  uso por persona en `activity_log` y en Actividad; test `herramientas-visibles` (encontró 2 invisibles:
  `lmtmValidacionRedes`, `lmtmClienteListoParaProducir`, agregadas); `lmtmRegistrarPieza`. Verificado por el
  conector del equipo (50 herramientas, las nuevas responden) y rutas protegidas (401/403 sin sesión).
  **No se hizo:** bajar de 83 a ~25 herramientas: renombrar rompe a los agentes; se resolvió con el cerebro (3
  llamadas que reemplazan a 6–10) y el test de visibilidad. **Conexión estable:** el servicio tiene volumen, Railway
  lo apaga antes de prender el nuevo → cada deploy corta ~1 min; claude.ai puede pedir reconectar.
- **Fase 5 (commits `ad4a7b9`, `176b412`, `707ed1b`, `442a701`; deploy `97a3fe90` + final):** Biblioteca, Actividad,
  «Posts que no salieron» con Reprocesar (confirmación; solo personas), cobertura en la ficha, Preparación nueva
  (operación + cerebro), menú nuevo (Finanzas fuera, D4), medición continua en Config.
  **Quedan con diseño viejo:** Semáforo, Inteligencia, WhatsApp y Conexiones (ver `fase6-paperclip.md`).
- **Sección 8 (commit `2f43888`):** cerebro en las listas de los 15 agentes (respaldo `respaldo_allowlist_20261115`)
  y en los roles del motor propio; skill `lmtm-tool-reference` arranca por `lmtmCliente`. Pausados por valor casi
  nulo en 30 días (respaldo `respaldo_estado_agentes_20261115`): Esteban (566 M tokens, 2 entregas útiles),
  Dario (53 M, 0) y Roxana (33 M, 0); ninguno tenía rutinas. Productor: 16 tareas «bloqueadas» que ya tenían
  entrega pasaron a `in_review` (respaldo `respaldo_productor_20261115`); 8 siguen bloqueadas por material/brief.
  **No se hizo:** partir tareas grandes automáticamente (primero medir si el cerebro baja los «sin turnos») y el
  costo en USD por modelo (no hay tarifas verificadas: no se inventan).
- **Fase 6:** interfaz de paperclip retirada donde había reemplazo (commit `a34cf72`, −5.804 líneas). El motor, las
  tareas, rutinas y aprobaciones siguen: plan por pasos en `fase6-paperclip.md`. Corrección: el «código muerto» no
  lo era (plugins, environments, feedback y budgets los usa el motor).
- **Último deploy del 15/11: `0f460ebb`** (commit `f6808fa`). Verificado con la clave de admin: `/cerebro/medicion`,
  `/cerebro/cobertura` (promedio 81 %), `/biblioteca`, `/publicacion/trabadas` (el 410 ya no ofrece Reprocesar) y
  `/equipo/conector` (sin personas cargadas todavía; el link compartido sigue activo). La interfaz no se vio en el
  navegador: el panel pide login y eso lo hace una persona.
- **Hallazgo nuevo:** el destino de Make del grupo MA (MISTOLES 3265 / CÁPSULA 3 CANNES) apunta al webhook muerto
  `7ko1fm`: 3 posts perdidos entre el 05 y el 13/11. Hay que corregir el destino en el datastore 19767.
- **Sigue (para otra sesión):** fase 4 (conector: registro único de herramientas, ~25 por intención, código por persona, entrega desde el
  conector del equipo), fase 5 (panel), sección 8 (flota), fase 6 (paperclip).
- **U10:** paleta de BRACHETTA corregida en `client_brand` (antes `#37ca37,#188bf6,#e30613,#9ae6b4`, cargada 14/10 desde el
  panel; ahora `#e30613,#111111,#ffffff,#1e8f3c` + nota de uso). `updated_by = plan-1511:naza` para que lo automático no la pise.
- **16/11 — motor propio en producción** (commits `754b2f5`, `2d7147c`, deploy `abf34513`; arreglo `90918c1`). Las 4
  pantallas viejas (Semáforo, Inteligencia, WhatsApp, Conexiones) pasaron al diseño nuevo. **Carlos es el piloto** del
  motor (14:10 UTC; paperclip ya no lo despierta, el heartbeat anterior quedó en `heartbeatAntesDelMotor`).
  **Hallazgo de cuota:** al 16/11 14:08 UTC ya se había gastado el 23 % de la semana de MiniMax con 18 corridas. La causa
  es el reintento de paperclip: Nicolás corrió 5 veces seguidas LMTM-6911 (tope de 45 turnos) y agotó la ventana de 5 h
  a las 09:10. El freno de ritmo (`llm.ritmo_semanal`) frena desde entonces a toda la flota: es lo esperado. Se libera
  cuando lo transcurrido de la semana alcance lo gastado menos el margen (~21:50 UTC si no se gasta más).
  **Arreglo `90918c1`:** el `correr` manual decía «Corriendo» pero el ritmo lo omitía; ahora cuenta como a pedido. Se
  dejaron de loguear las omitidas, que se repetían cada minuto.
  **Piloto OK** (LMTM-7136, 14:19 UTC): 1 corrida `motor_propio`, 44 s, 73k tokens de entrada, 3 licitaciones descartadas
  con motivo, tarea cerrada, sin doble ejecución. **14:20: migrados los 12 activos** (Ana, Bianca, Carla, Carlos, Caro,
  Delfina, Luna, Milo, Nicolás, Pablo, Sergio, Productor); los 3 pausados no se tocaron. `0e222e7`: el motor actualiza
  el estado del agente (antes quedaba «error» después de una corrida buena). `0b64b27`: las pantallas viejas pisaban
  el título de la pestaña («Growth», «Integrations • Company») con las migas de paperclip.
  **Interfaz verificada en el navegador (16/11, logueado Naza):** Hoy, Biblioteca (262 piezas), Actividad, Agentes
  (Flota con Motor LMTM/Paperclip), Config, Semáforo, Inteligencia, WhatsApp (vinculado), Conexiones, Preparación y
  Contenido («Posts que no salieron · 5»: 3 del grupo MA con 410 y MAERS 12/11 + INBELT 09/11 viejos, sin reprocesar).
  **Decisión de Naza (16/11): no se reprocesan ni se toca el datastore; quedan anotados.** Pendiente del equipo: webhook
  correcto del grupo MA para el datastore 19767 de Make (hoy apunta al muerto `7ko1fm`).
- **16/11 — fase 6, pasos 2 y 5:**
  - **Rutinas (paso 2):** NO hace falta disparador propio. El de paperclip crea la tarea (`todo`) y el despertar
    del agente migrado se saltea sin error (`heartbeat.wakeOnDemand.disabled` devuelve null, no tira; la rutina no
    borra la tarea). El motor la toma en el minuto siguiente. A confirmar con la primera rutina real: Tendencias
    diarias, 17/11 07:00 (Caro). En Agentes → Flota, cada rutina muestra su horario legible (`cronLegible`) y se sacó
    el «latido cada 12 h» de los agentes del motor (ya no corre). Commit `9cceb56`.
  - **Aprobaciones (paso 5):** las de web, código y pedidos al equipo NO se veían en ninguna pantalla desde que salió
    la de paperclip: 7 de web (WordPress de Santa Rosa con 106 vulnerabilidades, plugins de PKT/Campo Timbó/Santa
    Rosa, redirección de Hotel Lescano, spam de casinos en Hotel Libertador) y 4 pedidos de Esteban (SKYGARDEN,
    INBELT, HANSHI, DOMINGO BISIO), algunas desde el 06/11. Ahora van en Hoy («Webs y pedidos de los agentes»,
    filtros Todo / Web / Te esperan) con aprobar y rechazar con motivo, agrupadas. Commit `511fcf4`. La tabla
    `approvals` se queda: mudarla a `decisiones` no le suma nada a nadie y toca la ejecución de pauta y web.
  - **Pasos 4 y 6 (tareas y borrado de heartbeat/issues):** esperan una semana del motor en producción (plan).
  - Datos: «Ba�l de Ganchos» (U+FFFD guardado) → «Baúl» en 1 rutina y 19 tareas (respaldo
    `respaldo_titulos_baul_20261116`); Carlos de `error` a `idle` (su última corrida, la del motor, salió bien).
  - Verificado en el navegador: Hoy muestra «Webs y pedidos de los agentes · 10»; la Flota, los horarios legibles.
