# Fase C: LMTM sin paperclip

Pedido de Nazareno, 06/10: "Hoy y Cliente se ven feas y estáticas. No hace falta
seguir usando paperclip como base de todo: cambiar cómo corren los agentes y toda
la interfaz, manteniendo lo útil (cada sección del cliente, el plan de acción y
demás), optimizado para nosotros, más directo".

Decisión del 06/10: **runner propio, sin API key**. Los agentes siguen con los
modelos de hoy (MiniMax / GLM vía el CLI de Claude Code) y las mismas
herramientas MCP; lo que cambia es quién los despierta, dónde corren y dónde
deja cada uno su trabajo.

Lo de A y B (métricas, salud de fuentes, decisiones, informe, evaluador) queda:
es la base. Lo que se va es el andamiaje de paperclip (issues, proyectos,
workspaces, heartbeats, aprobaciones genéricas, org).

## Qué está mal hoy, medido

- **La app es paperclip con LMTM encima:** ~120 rutas, de las que el equipo usa
  una docena. La barra lateral, el inbox y la ficha de agente son de paperclip.
- **Hoy y Cliente son texto suelto:** una columna, sin filtros, sin gráficos, sin
  abrir una decisión en el lugar. La regla "aire en vez de cajas" de
  `lmtm-diseno` llevada al extremo.
- **B3 sacó cosas útiles de la ficha del cliente:** la pestaña Plan de acción
  (semáforo + plan corto + reporte del estratega + análisis de pauta por edad,
  formato y conjunto) y la narrativa de pauta. Hay que devolverlas.
- **Los agentes corren por issues y heartbeats:** de 698 corridas por reloj en
  14 días, ninguna llevaba trabajo; 27 issues `in_review` esperan desde julio a
  nadie; el trabajo útil (propuestas, informes) termina en tablas que la
  interfaz no muestra juntas.

## C1. Interfaz LMTM (primero: es lo que se ve)

Un shell propio, sin la barra de paperclip. Cinco secciones:

| Sección | Qué tiene |
|---|---|
| **Hoy** | Incidentes, plata parada con su evolución, decisiones agrupadas por cliente con filtro (plata / cliente / responsable), cada una se abre en el lugar (por qué, números, gráfico chico, acción y descartar con motivo). Propuestas de los agentes en la misma cola. |
| **Clientes** | Cartera: tabla con estado contra objetivo, plata en riesgo, frescura de datos, decisiones abiertas; orden y filtro; mini tendencia por cliente. |
| **Cliente** | La ficha completa, con TODO lo útil que había: Resumen (semáforo y plan de acción, restaurado), Pauta (campaña por campaña, gráficos, análisis por edad/formato/conjunto, narrativa), Contenido (calendario, ideas, ganchos, tendencias), Informe semanal (borrador, auditoría, publicar), Marca y memoria, Competencia, Conexiones. |
| **Agentes** | Qué hizo cada rol hoy, cuánto costó, qué dejó (propuestas, informes), y "pedir algo" a un rol. |
| **Config** | Conexiones, equipo, accesos. |

Lo de paperclip (issues, proyectos, org, rutinas, workspaces) queda solo bajo
"Sistema" hasta C3.

**Diseño:** se mantienen los tokens de `lmtm-diseno` (paleta, tipografía,
castellano, "sin dato" nunca 0), pero se corrige la regla de "aire": las
pantallas de trabajo usan superficies, tablas densas legibles, gráficos (con
`dataviz`) y estados interactivos. Responsive: celular primero en Hoy, escritorio
primero en Cliente.

## C2. Runner propio de agentes

- **Cola propia** (`agente_trabajos`): rol, cliente, motivo, entrada, estado,
  resultado, costo, duración. Reemplaza issues + heartbeats + wakeups.
- **Disparadores:** horario por rol (cron), hechos (llegó data nueva, se abrió
  una decisión de cierto tipo, se cayó una fuente) y pedido manual desde la
  interfaz. Sin reloj que despierte "a ver si hay algo".
- **Dónde corre:** un servicio aparte en Railway (`lmtm-agentes`, misma imagen,
  modo worker) para no competir por CPU y memoria con la web. Concurrencia y
  tiempo máximo por rol.
- **Qué deja:** nada de comentarios en issues. Cada rol escribe por sus
  herramientas en el lugar que la interfaz lee: decisiones, informes, memoria del
  cliente, contenido. El resultado de la corrida queda en `agente_trabajos`.
- **Roles (PLAN §4):** media buyer → estratega → contenido → inteligencia →
  operaciones. Se migra uno por vez: el rol nuevo corre en el runner, el viejo se
  apaga en paperclip cuando el nuevo lo supera en el evaluador.

## C3. Retiro de paperclip

Cuando los 6 roles corran en el runner: se apaga el scheduler de heartbeats, se
sacan las rutas y pantallas de paperclip, y se archivan sus tablas (no se borran).

## Orden y "sale cuando"

| Paso | Sale cuando |
|---|---|
| C1a Cliente completo (Plan de acción restaurado + Pauta) | Las secciones que había antes de B3 están, con datos reales, en el link de cada cliente |
| C1b Hoy interactiva | Agrupar, filtrar y resolver una decisión sin salir de la fila; gráfico de plata parada |
| C1c Shell LMTM | La barra lateral es la de LMTM; lo de paperclip solo en "Sistema" |
| C2a Runner + media buyer | El piloto de Milo corre en el runner con los mismos números del evaluador |
| C2b Resto de roles | Cada rol migrado con su evaluador; heartbeat apagado por rol |
| C3 Retiro | Sin rutas ni scheduler de paperclip; tablas archivadas |
