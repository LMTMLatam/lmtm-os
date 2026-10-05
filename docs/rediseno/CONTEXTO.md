# LMTM-OS: contexto operativo para el rediseño

Leer entero antes de tocar código. Todo lo que está acá costó un incidente real.
Este archivo NO tiene credenciales y no debe tenerlas nunca: los valores viven en
las variables de entorno del entorno de trabajo.

## Qué es esto

LMTM-OS es la plataforma interna de LMTM Latam, agencia de marketing (59 clientes
activos, ARS ~13 M/mes de pauta gestionada en Meta y Google). Es un fork de
paperclipai (framework de "empresa de agentes") con mucho código propio encima.

- Monorepo pnpm. Server Express + TypeScript, Drizzle ORM, Postgres 17.
- UI: React 19, Tailwind 4, shadcn/radix, TanStack Query 5, react-router. Sin
  librería de gráficos (los gráficos son SVG a mano).
- Producción: Railway, proyecto `lmtm-os`, servicio `lmtm-os`, dominio
  `lmtm-os-production.up.railway.app`. DB: servicio `lmtm-postgres` del mismo
  proyecto (red interna; afuera, por TCP proxy).
- 14 agentes corren como `claude_local` (Claude Code CLI dentro del contenedor)
  apuntando a MiniMax-M3 (10) y a un proxy local `lmtm-glm` en 127.0.0.1:4000 (4).
  Timeout 600 s por corrida. Los despierta el "heartbeat" de paperclip: rutinas
  crean issues, el issue despierta al agente.
- CRM propio aparte: crm.lmtmas.com (FastAPI + React en un VPS), otro repo.

## La regla de la casa: el verde miente

El patrón que más daño hizo: sistemas que reportan éxito sin haber hecho el
trabajo. Regla: **medir el efecto, nunca el estado de la corrida.**

- Un sync "completed" no prueba que haya datos. Mirar las filas.
- Un deploy en SUCCESS no prueba que el código nuevo corra. Mirar la hora de boot:
  `railway logs --service lmtm-os | grep "starting real server"`.
- "Mandado a Make" no es "publicado". La cadena de publicación se verifica en la
  red social.
- Para auditar métricas: recalcular desde `ads_insights.raw` y comparar con la
  columna guardada. Es mecánico y no depende de sospechar de una función.

## Incidentes que definen las reglas

1. **Leads inflados 43% en toda la agencia.** Meta manda el mismo evento con varios
   `action_type` (`lead`, `onsite_conversion.lead_grouped`, `leadgen_other`). Se
   sumaban. Regla: dentro de una familia de alias se toma el MÁXIMO, nunca la suma.
   Conversaciones de WhatsApp (`onsite_conversion.messaging_conversation_started_7d`)
   mandan si son > 0.
2. **190.978 "ventas" que eran 325.** Se contaba todo `offsite_conversion.*`
   (vistas, búsquedas, carritos) como compra. Solo cuentan los alias de compra.
3. **El sync borraba y no reponía.** Delete del rango + un solo INSERT gigante. Con
   24 columnas, más de ~2.730 filas revientan el límite de 65.534 parámetros de
   Postgres. El delete ya había corrido: Distrillantas perdió julio y agosto.
   Regla: reemplazos en transacción y en tandas (`replaceRows` en
   `server/src/services/ads/aggregator.ts`).
4. **Había un segundo escritor de `ads_insights`** (`metaAdsInsights` es un ALIAS
   de esa tabla) con la fórmula vieja y sin `client_id`. Eliminado. Regla: una sola
   función escribe cada métrica.
5. **Probar una ruta destructiva para verificar un deploy la ejecutó contra
   producción** (el build no había terminado). Regla: nunca ejercitar una ruta que
   escribe para "ver si anda".
6. **Railway: hay DOS proyectos llamados `lmtm-os`** en dos cuentas. Un `railway up`
   sin el token del proyecto correcto deploya a uno vacío. Una vez eso produjo un
   falso reporte de "producción caída hace 5 días".
7. **Datos cruzados entre clientes.** El jefe vio sugerencias de agentes sobre una
   inmobiliaria dentro de Distrillantas (neumáticos). En el CRM, las companies
   7/8/12/13 comparten el mismo token de system user de Meta.
8. **Avisos que nadie lee.** 14 módulos mandaban WhatsApp directo. Se desconectó el
   WhatsApp de Distrillantas y el jefe no se enteró. Ahora todo pasa por
   `wa_outbox` (nivel 1-5, dedupe 24 h, tope).
9. **El día de hoy está a medio sincronizar.** Contarlo en promedios diarios rompió
   dos cálculos. Las ventanas por defecto terminan AYER.
10. **Un umbral que decide sobre la FALTA de un dato no puede afirmar nada.** "Sin
    datos de gasto" no es "cuenta dormida"; "nunca despachó" no es "dejó de
    despachar".

## Cosas que no se tocan sin decisión explícita

- **Escritura en planillas de clientes: APAGADA en código.** Variable
  `LMTM_PERMITIR_ESCRIBIR_PLANILLAS` (no existe en prod). Guard en
  `server/src/services/planillas-protegidas.ts`, también para listas de ClickUp.
- **Autonomía de pauta: APAGADA.** `LMTM_AUTONOMIA_PAUTA` (no existe en prod).
  Mover presupuesto o duplicar anuncios exige `approved=true`; las propuestas de
  los agentes quedan en la tabla `approvals` para un humano.
- **Links del panel público** (`/api/public/dashboards/:slug`): los clientes ya los
  tienen. Los slugs no cambian.
- **El despachador de Make (AutoPoster 1427144)** no se apaga: es el que publica.

## Cómo se trabaja

- **No deployar desde la nube.** Rama propia, PR a `main`, Nazareno revisa y
  deploya. (Hasta que exista CI que deploye desde `main`.)
- **DB de producción: solo lectura** desde la nube (`DATABASE_URL_RO`). Cualquier
  escritura (backfill, migración aplicada a mano) la corre Nazareno.
- **Tests:** la suite completa del upstream no corre fuera de Linux con Postgres
  embebido. Los tests propios sí:
  `cd server && npx vitest run src/services/__tests__ src/services/ads src/routes/__tests__`
  y `cd packages/adapters/minimax-local && npx vitest run`.
- Cada lógica no trivial deja UN test que falle si se rompe. Sin frameworks nuevos.
- Comentarios del código en español, explicando el porqué (el estilo del repo).
- Line endings LF. El repo mezcla; no convertir archivos enteros.
- Migraciones: rango reservado por chat (ver `PLAN.md`) para no chocar en el
  journal de Drizzle.
- Nombres de clientes en la DB pueden tener espacio final (`'SKYGARDEN '`):
  comparar con `trim()`.
- `agent_wakeup_requests` agrupa los motivos rutinarios: para contar, sumar
  `coalesced_count`, no filas.
- Al consultar el estado de un sync, la primera tabla es `sync_logs`.

## Números de referencia (05/10/2026)

| | |
|---|---|
| Clientes activos | 59 |
| Con Meta mapeado / Google / orgánico 30 d | 27 / 20 / 23 |
| Tablas / servicios / rutas / páginas UI | 133 / 199 / 49 / 72 |
| `server/src/routes/ads.ts` | 4.270 líneas |
| Corridas de agentes 30 d / éxito 7 d | 2.640 / 95% |
| Issues creados 30 d / bloqueados hoy / esperando humano | 927 / 249 / 145 |
| Wakeups saltados por bloqueos, 7 d | 160.799 |
| Gasto de agentes (USD/mes, ritmo actual) | ~1.750 de 4.650 presupuestados |
