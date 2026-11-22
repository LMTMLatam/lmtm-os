---
name: lmtm-ejemplos-triage
displayName: Ejemplos de triage de la cola
description: "Cómo se ordena una cola de tareas quietas: qué se cierra, qué se junta y qué se deja, con el triage real de 27 tareas del 22/11/2026. Cargala antes de repartir, cerrar o comentar tareas en lote."
required: false
---

# Cómo se ordena una cola

Una cola de 27 tareas «por hacer», sin comentarios y quietas hace días, no es trabajo pendiente: es ruido que tapa lo urgente. El triage no las resuelve. Hace que se vea cuáles importan.

## Leelas todas juntas antes de tocar una
Una lista con: identificador, estado, prioridad, días desde que se creó, días sin moverse, cliente y título. Leída entera aparecen tres patrones.

### 1. La misma tarea, abierta varias veces
Un detector diario abría una tarea nueva cada día por el mismo problema: cuatro tareas en diez días, un solo tema.
- Queda **una**: la más reciente, con el estado medido hoy.
- Las otras se cierran como duplicadas, con un comentario que apunta a la que queda.
- Si las cerradas tienen datos que la nueva no (ids, pasos), decilo: «los ids están en tal y tal, siguen legibles».

### 2. La tarea que venció sola
Las tareas sobre un post con fecha dejan de servir cuando la fecha pasa. Se cierran con: qué fecha era, que ya pasó, y **cuál es la tarea viva de ese cliente**, si hay una.

### 3. La tarea que ya se resolvió
Una urgente y bloqueada pedía avisar a un cliente por un certificado que vencía el 21. Se leyó el certificado del sitio: ya estaba renovado. Llevaba cuatro días bloqueada sin motivo.
**Antes de escalar o de dejar bloqueada una tarea, medí de nuevo.** Muchas veces el problema ya no está.

## Lo que el triage no hace
- **No cierra lo que necesita a una persona.** Aprobaciones, piezas, avisar a un cliente: se dejan, y si hace falta se marcan [HUMANO]. Una tarea que solo una persona puede hacer, asignada a un agente, no avanza nunca.
- **No reparte por repartir.** Pasar una tarea a otro agente que tampoco puede resolverla es mover ruido.
- **No resuelve en el comentario.** El comentario de triage dice el estado y el próximo paso; el trabajo lo hace quien corresponde.

## Antes de comentar una tarea, leela entera
En este triage se escribió «encender el escenario» de un cliente, copiado de una herramienta. La descripción de esa misma tarea decía que no se encendiera: sus destinos eran de otro cliente y habría publicado en redes ajenas. Se corrigió con un segundo comentario, a la vista.
La descripción y los comentarios de una tarea pesan más que la salida de una herramienta.

## Resultado del ejemplo
De 27 tareas se tocaron 10: una cerrada como hecha (con la prueba), una que quedó como única de su tema, tres cerradas como duplicadas y cinco cerradas por vencidas. Las otras 17 siguen abiertas porque esperan a una persona.

## Cada cierre lleva su prueba
- Hecha: cómo se verificó y con qué resultado.
- Duplicada: cuál queda.
- Vencida: qué fecha era y qué sigue vivo.

## Detalle práctico
`paperclipUpdateIssue` devuelve la tarea completa con todas sus relaciones: son miles de caracteres por llamada. En un lote, comentá con `paperclipAddComment` y cambiá el estado solo donde haga falta.
