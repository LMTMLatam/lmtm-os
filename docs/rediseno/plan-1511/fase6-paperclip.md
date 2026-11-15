# Fase 6 — salida de paperclip: lo hecho y lo que falta (15/11/2026)

Decisión de Naza (15/11): se saca paperclip entero, se mantienen las conexiones y se pasa a algo propio.
Regla: no se pierde ninguna función (ver `inventario.md`).

## Hecho el 15/11
- **Interfaz:** Inbox → Hoy; Actividad vieja → `/actividad`; Organigrama → `/agentes`; Objetivos, Proyectos y
  Workspaces → Hoy. Se borraron 9 páginas huérfanas con sus tests (5.804 líneas). Panel: 152 archivos de test en verde.
- **Preparación** rehecha en la app propia (`PreparacionApp`): los 9 chequeos de Readiness + la cobertura del cerebro.
- **Biblioteca, Actividad, posts trabados** propios: reemplazan para el uso diario a Issues/Inbox/Activity.

## Lo que queda de paperclip y por qué no se sacó todavía

| Pieza | Qué hace hoy | Por qué sigue | Reemplazo propio | Riesgo |
|---|---|---|---|---|
| Motor de corridas (`heartbeat.ts`, 9.313 líneas; `heartbeat_runs`) | Corre a los 15 agentes de la flota (Claude CLI + MiniMax), turnos, reintentos, recuperación | Es el que trabaja todos los días; el motor propio (`agente_trabajos`) corre solo 3 roles | Mudar agente por agente al motor propio | Alto: corta el trabajo de la flota si falla |
| Tareas (`issues`, `issue_comments`) | Cola de trabajo de los agentes, comentarios, bloqueos, `[HUMANO]` | Todo el flujo de los agentes (skills, herramientas paperclip*) las usa | Tareas propias (o directamente ClickUp) | Alto |
| Rutinas (`routines`) | 13 rutinas programadas | Sin pantalla propia | Rutinas en el motor propio (cron + rol) | Medio |
| Aprobaciones (`approvals`) | Pauta, web y código con firma humana | Hoy y Propuestas ya las muestran; la tabla es de paperclip | Decisiones propias (`decisiones` ya existe) | Medio |
| Login y permisos (better-auth + memberships) | Cuentas, invitaciones, roles | Funciona y es independiente del motor | Se puede quedar (no es «paperclip» en sí) | Bajo |
| Detalle de tarea y de agente (UI) | Los comentarios de los agentes linkean ahí | Mientras existan tareas de paperclip | Vista propia de tarea | Bajo |
| Plugins, environments, budgets, feedback (servidor) | **Corrección 15/11: NO están muertos.** 4 plugins instalados, 21.526 `environment_leases`, 1.219 `feedback_items`, y el motor consulta presupuestos en cada corrida | Enganchados al motor de corridas | Se van con el motor (paso 6) | Alto si se sacan antes |
| Export/import, goals, projects, execution workspaces (servidor) | Sin uso (0–7 filas) | Rutas registradas; el motor referencia projects/goals al crear tareas | Se van con las tareas (paso 4) | Bajo |

> La estimación del plan («~55.000 líneas de código muerto») estaba mal: se midió por tablas vacías, pero varias
> de esas piezas las usa el motor. El borrado grande llega con la salida del motor, no antes.

## Orden propuesto (una sesión por paso, cada uno con deploy y verificación)
1. ~~Borrar módulos muertos~~ → se hizo lo seguro: la interfaz (páginas huérfanas). El resto va con el motor.
2. **Rutinas al motor propio:** pantalla de rutinas en la app + disparador propio; apagar las de paperclip de a una
   y comparar 1 semana.
3. **Agentes al motor propio, de a uno**, empezando por los que mejor rinden (Productor, Carlos, Luna). Correr en
   paralelo 1 semana y comparar valor medido (`valor_flota`). Rollback = volver a activar el de paperclip.
4. **Tareas:** cuando el último agente esté en el motor propio, la cola pasa a `agente_trabajos` + ClickUp; las
   tareas viejas quedan de solo lectura.
5. **Aprobaciones → decisiones.**
6. Recién ahí, borrar `heartbeat.ts`, `issues.ts` y las pantallas de paperclip que quedan.

## Pantallas con diseño viejo que quedan (funcionan, con la paleta LMTM)
Semáforo de clientes (`Growth`), Inteligencia, WhatsApp y Conexiones (`AdsIntegrations`, con el OAuth de Meta y Google).
Se rehacen con el mismo criterio que Preparación: listar qué hace cada una, rehacer con los mismos datos y recién
después retirar la vieja. Conexiones es la más delicada (OAuth): última.
