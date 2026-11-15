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
- **Sigue (para otra sesión):** fase 4 (conector: registro único de herramientas, ~25 por intención, código por persona, entrega desde el
  conector del equipo), fase 5 (panel), sección 8 (flota), fase 6 (paperclip).
- **U10:** paleta de BRACHETTA corregida en `client_brand` (antes `#37ca37,#188bf6,#e30613,#9ae6b4`, cargada 14/10 desde el
  panel; ahora `#e30613,#111111,#ffffff,#1e8f3c` + nota de uso). `updated_by = plan-1511:naza` para que lo automático no la pise.
