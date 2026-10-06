# Fase C: LMTM propio (sin paperclip)

Pedidos de Nazareno del 06/10:

- "Hoy y Cliente se ven feas y estáticas. No hace falta seguir usando paperclip
  como base: cambiar cómo corren los agentes y toda la interfaz, manteniendo lo
  útil."
- "Mantené todo lo de cada cliente (dashboards para compartir, conexiones, todas
  las secciones) y toda función a medida que aporte al flujo. La idea es que los
  agentes sean más capaces y proactivos."
- "Seguimos sobre paperclip, ¿los agentes ya corren en un entorno nuevo? La
  interfaz no es la que buscamos. Investigá equipos agénticos, empresas y
  agencias manejadas por agentes, y basate en eso." → `INVESTIGACION.md`.

## Dónde estamos (06/10, sin maquillaje)

- **Los agentes siguen corriendo en paperclip:** `claude_local` con MiniMax/GLM,
  despertados por heartbeats e issues, dentro del contenedor web. El runner propio
  no existía todavía.
- **La interfaz es paperclip con páginas nuestras adentro:** misma barra, mismo
  shell, mismas ~120 rutas. Hoy es una lista de 115 tarjetas de texto.
- **Lo que sí es nuestro y se queda:** métricas únicas, motor de decisiones,
  salud de fuentes, informe semanal y su auditoría, resumen de WhatsApp,
  evaluador de propuestas, herramientas `lmtm*` con guardas, conector de Claude,
  y las páginas propias de cliente (plan de acción, pauta, contenido, panel
  público).

## Cómo queda (basado en la investigación)

```
Fuentes ─► Ingesta ─► Métricas ─► Motor de decisiones (código detecta)
                                        │ decisión nueva / dato nuevo / fuente caída
                                        ▼
                               Cola de trabajos (Postgres)
                                        │
                                        ▼
                     Runner de agentes (Claude Agent SDK + MiniMax/GLM)
                     rol definido en archivo · herramientas por rol
                     escalón de autonomía aplicado en el motor
                     cada paso registrado
                                        │ investiga, propone, ejecuta lo permitido
                                        ▼
                     Evaluador (código) ─► Bandeja: aprobar / responder / avisos
                                        ▼
                           App LMTM (Hoy · Clientes · Cliente · Agentes)
                           Resumen 9:00 con lo que ya hicieron de noche
```

Principios (cada uno sale de un caso medido, ver `INVESTIGACION.md`):

1. El código detecta; el agente investiga y propone; la persona decide lo
   irreversible.
2. Se despiertan por hechos. Reloj solo para lo de calendario.
3. A la persona: avisar, preguntar o aprobar. Nada de tickets ni chat por agente.
4. Roles chicos con procedimiento obligatorio, en archivos versionados.
5. El supervisor es código (el evaluador), no otro agente del mismo modelo.
6. Autonomía por escalones y por cliente, con topes y registro con motivo y
   deshacer.
7. La memoria y el estado viven en la base. Los agentes no conversan entre sí.
   Todo lo que dicen haber hecho se verifica por efecto.
8. Ciclo nocturno: a las 9:00 el resumen dice qué ya se investigó y resolvió.

## C2. Runner propio (primero: es lo que hace a los agentes capaces)

- **Cola** `agente_trabajos` en Postgres (`FOR UPDATE SKIP LOCKED`): rol,
  cliente, motivo (decisión / horario / pedido), referencia, entrada, estado,
  resultado (resumen, verificado, supuestos), pasos (cada herramienta con qué
  pidió y qué volvió), costo, duración. Reemplaza issues + heartbeats + wakeups.
- **Motor:** Claude Agent SDK (el harness de Claude Code como librería) apuntado a
  MiniMax/GLM por `ANTHROPIC_BASE_URL`. Sin API key de Anthropic. Las
  herramientas son las mismas `lmtm*`, servidas en el mismo proceso, con la
  identidad del rol.
- **Roles** en `server/src/agentes/roles/<rol>.md`: misión, reglas,
  procedimiento, entregable, cómo se mide, herramientas, disparadores, tope de
  turnos y minutos.
- **Disparadores:** decisión nueva de ciertos tipos (por ejemplo, "dejó de
  gastar" → el media buyer averigua la causa antes de que llegue al equipo);
  horario por rol; pedido manual desde la app o el conector de Claude.
- **Dónde corre:** primero dentro del servicio web detrás de `LMTM_RUNNER=1`
  (igual que hoy los agentes de paperclip); cuando ande, servicio aparte
  `lmtm-agentes` con la misma imagen.
- **Migración por rol:** el rol corre en el runner en sombra; cuando supera al de
  paperclip en el evaluador, el de paperclip se apaga.

## C1. App LMTM (interfaz propia, no paperclip)

App nueva, con su propio shell y rutas, servida por el mismo servidor. Lo de
paperclip queda accesible en `/sistema` hasta el retiro.

| Sección | Qué tiene |
|---|---|
| **Hoy** (bandeja) | Arriba incidentes y plata parada con su evolución. Tres pestañas: **Aprobar** (propuestas listas para ejecutar, aprobables en tanda), **Responder** (lo que el agente no puede resolver solo), **Avisos**. Agrupado por cliente, filtros por plata, cliente y responsable. Cada fila se abre en el lugar: por qué, números, gráfico chico, lo que encontró el agente, acción y descartar con motivo. "Esta noche": lo que los agentes ya resolvieron. |
| **Clientes** | Cartera: estado contra objetivo, plata en riesgo, frescura de datos, decisiones abiertas, mini tendencia; orden y filtro. |
| **Cliente** | Todo lo que había: Resumen con plan de acción, Pauta (campaña por campaña, gráficos, análisis por edad/formato/conjunto, narrativa), Contenido, Informe semanal, Marca y memoria, Competencia, Conexiones, link al panel público. Más "Pedirle algo al equipo de agentes". |
| **Agentes** | Por rol: qué hizo hoy, qué dejó, costo, escalón de autonomía, nota del evaluador. Cada corrida con su registro de pasos y "qué está verificado y qué es supuesto". |
| **Config** | Conexiones, equipo, accesos, escalones por cliente. |

Diseño: tokens de `lmtm-diseno` (paleta, Poppins, castellano, "sin dato" nunca
0) pero con superficies, tablas densas legibles, gráficos (`dataviz`) y estados
interactivos. Celular primero en Hoy; escritorio primero en Cliente.

## Regla: no se pierde ninguna función propia

Auditoría de lo que retiraron B3/B4 (`git diff --diff-filter=D fc9fc9b`):

| Retirado por B | Estado |
|---|---|
| Pestaña Plan de acción + narrativa de pauta | **restaurado** `1bfacca` |
| Growth: triage rojo/amarillo/verde y semáforo de pauta | **restaurado** `b91ad60` |
| Pauta (hub con selector de cliente) | **restaurado** `b91ad60` (sin la tabla vieja: la cartera es Cartera) |
| Reporte semanal por cliente a ClickUp (lunes) | **restaurado** `b91ad60`, con números de `metricas` |
| Panel público del cliente | sigue en `/public/dashboards/:slug/detalle`, linkeado desde el informe |
| Semáforo y cola humana de Operación | cubiertos por Hoy (incidentes + cola humana como decisiones) |
| Brief 8:00/18:00 por WhatsApp | reemplazado por el resumen de las 9:00 (medido: 1 mensaje/día) |
| Competitors, Org, MyIssues | sin ruta desde antes; Competidores sigue por cliente |

Cada pantalla vieja se apaga recién cuando la app nueva cubre su uso.

## Conector de Claude (06/10, hecho)

`POST /mcp` (header Bearer) o `/mcp/<clave>` (claude.ai): el mismo servidor MCP
de los agentes con la clave de un admin. Hacer todo = `paperclipApiRequest` + las
`lmtm*` (actúan como el agente "Claude (conector)"); leer todo = `lmtmSql` (solo
lectura, rol `lmtm_lectura`).

## C3. Retiro de paperclip

Cuando los 6 roles corran en el runner: se apaga el scheduler de heartbeats, se
sacan las rutas y pantallas de paperclip, y se archivan sus tablas (no se borran).

## Orden y "sale cuando"

| Paso | Sale cuando |
|---|---|
| C2a Runner + media buyer | La cola, el motor y el registro de pasos andan en producción; el media buyer averigua solo cada "dejó de gastar" y deja la causa en la decisión; el piloto de Milo corre en el runner con los mismos números del evaluador |
| C1a App: Hoy como bandeja | Aprobar, responder y descartar sin salir de la fila; aprobar en tanda; lo que encontró el agente visible en la fila; gráfico de plata parada |
| C1b App: Clientes + Cliente | Todas las secciones de la ficha vieja, con datos reales, en la app nueva; panel público intacto |
| C1c App: Agentes | Registro de cada corrida con pasos, costo y nota del evaluador; "pedirle algo" a un rol |
| C2b Resto de roles | Estratega, contenido, inteligencia, operaciones en el runner con su evaluador; heartbeat de paperclip apagado por rol |
| C3 Retiro | Sin rutas, pantallas ni scheduler de paperclip; tablas archivadas |
