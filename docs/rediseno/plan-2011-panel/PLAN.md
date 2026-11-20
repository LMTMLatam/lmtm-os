# Rediseño del panel — 20/11/2026

Pedido de Naza: "todo más a mano, todo rápido, información intuitiva y cosas para tomar acción rápido",
con la maqueta oscura con magenta (canvas «Rediseño del panel») y la auditoría completa del repo.
Se mantienen todas las funciones: revisión de scripts, dashboards compartidos con clientes, informe
semanal, veredicto de piezas, aprobaciones, pedirle a un agente.

Referencias: Linear (menú de comandos, atajos), Sprout Social (selector de cliente con pendientes),
AgencyAnalytics (metas con barra de avance), Planable (bandeja de aprobaciones, aprobar en tanda).

## Fases

| Fase | Qué | Estado | Commit |
|---|---|---|---|
| 0 | Commitear lo desplegado; dashboard público: días en hora AR, errores genéricos, fechas validadas, tope de pedidos, consulta orgánica | Hecha y desplegada | 0fde1dd, 6ab3628 |
| 1 | Tokens magenta, riel nuevo (hijas, fijados, agencia), Ctrl+K, carga diferida por ruta | Hecha y desplegada | b25ba89 |
| 2 | Ficha del cliente: 5 grupos, tarjetas de estado, barra de acciones; ClientDashboard.tsx partido en app/cliente/ | Hecha y desplegada | a009c0d |
| 3 | Aprobaciones: decisiones de pauta, propuestas de agentes y piezas sin veredicto en una bandeja | Hecha y desplegada | b25ba89 |
| 4 | Clientes: vistas Todo/Pauta/Contenido, acciones por fila; métricas de la cartera guardadas 30 min | Hecha y desplegada | 13f0ab2 |
| 5 | Agentes: tareas terminadas, cortes ≠ fallas, limpieza de colgadas por proceso, test del filtro de comentarios | Hecha | cf2ff8c |
| 6 | Historial de corridas acotado, índice en el motor, canal en vivo, scripts hasta 1.000 | Hecha | 66230f0 |
| 7 | Dashboard del cliente con la paleta nueva (sigue claro) | Hecha | 66230f0 |

## Después del plan (20/11, pedidos de Naza)

- **Ideas = Super Redes** (commit 6c2cef8): la sección «Ideas» de la ficha muestra la lista «Super Redes Sociales» de
  ClickUp (donde caen y se aprueban las ideas) y cada idea tiene «Generar con el agente»: el mismo camino que la
  etiqueta «generar contenido» (Productor con Magnific), corre a pedido y después pone la etiqueta en ClickUp.
  Rutas: `GET /contenido/super-redes/:clientId`, `POST /contenido/super-redes/:clientId/:taskId/pedir`.
- **Hoy más claro** (commit 34c5c6d): urgente, los números de la agencia, 5 sugerencias y lo que hicieron los agentes
  (`ui/src/lmtm/hoy.ts`). La lista entera de decisiones está en `/decisiones`.
- **Contenido = producción y edición**: el calendario de todos los clientes (`/contenido/calendario`) y la Biblioteca
  salen del menú y siguen en el Ctrl+K.

## Dónde vive cada cosa

- Mapa del panel (riel, Ctrl+K, grupos de la ficha): `ui/src/lmtm/secciones.ts`.
- Fijados: `ui/src/lmtm/fijados.ts` (navegador de cada persona).
- Aprobaciones: `ui/src/lmtm/aprobaciones.ts` (contadores) y `ui/src/app/AprobacionesApp.tsx`.
- Ficha: `ui/src/app/ClienteApp.tsx` + una sección por archivo en `ui/src/app/cliente/`.
- Tokens: `.lmtm` y `.lmtm[data-tema="oscuro"]` en `ui/src/index.css` (`--l-marca-grad`, `--l-brillo`, `--l-marca-tinta`).

## Pendiente (decide Naza)

- **Volumen para las sesiones de Claude Code** (hallazgo 9 de la auditoría): cada deploy borra las sesiones y la
  corrida cortada retoma de cero. Un volumen de Railway en `/home/node/.claude/projects` lo resuelve, pero un
  servicio con volumen no puede solaparse en el deploy: cada deploy deja el panel caído ~1 minuto. No se hizo.
- **Tests de base**: `packages/db/src/test-embedded-postgres.ts` es un stub que devuelve `null`; ningún test con
  base embebida corre (tampoco los que ya existían). El test de `pendientes()` quedó como test del filtro de
  comentarios contra los textos reales del motor.
- **Una sola cola de agentes** (hallazgo 6): heartbeat de paperclip + motor propio + runner de la cola. Pasos 4 y 6
  del plan del 15/11.
