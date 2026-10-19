---
name: lmtm-diagnostico-publicacion
displayName: Diagnóstico de publicación — por qué no salió (o salió mal) un post
description: El método para encontrar la causa real cuando un post de un cliente no se publicó, se publicó tarde, duplicado o en una red sí y en otra no. Dónde está la verdad en cada eslabón (planilla, script, ClickUp, despachador, escenario de Make, redes), qué mirar según el síntoma, los casos reales y qué podés arreglar vos y qué va como propuesta. Usala ANTES de proponer cualquier arreglo de publicación.
required: false
---

# Diagnóstico de publicación

**Regla 1: en Make, verde no quiere decir publicado.** Los escenarios tienen
manejadores de error: si Facebook o LinkedIn fallan, Make deja un comentario en la
tarea de ClickUp y marca la corrida en VERDE. Si falla Instagram, la corrida queda
como incompleta. El estado de la corrida no dice qué salió. Medí el efecto.

**Regla 2: diagnosticar es tuyo; publicar, republicar o tocar el material del
cliente, NO.** Replay, reprocesar incompletas, correr un escenario, mandar algo a
un webhook, encender un escenario con cola, mover la fecha de un post, pisar o
comprimir un archivo del Drive del cliente: todo eso es L2 (ver
`lmtm-escalation-policy`). Tu entregable es la causa con evidencia y la propuesta
exacta.

## La cadena, eslabón por eslabón (y dónde miente cada uno)

| # | Eslabón | Qué hace | Dónde está la verdad | Herramienta |
|---|---|---|---|---|
| 1 | Planilla Cronopost del cliente | Fuente de verdad: fecha, hora, aprobación, redes, material | La fila del post | `sheets_read` |
| 2 | Apps Script | Pasa la planilla a ClickUp **una vez por día (~10:07)** | Sus corridas | `script_processes` |
| 3 | Tarea de ClickUp | Su fecha de inicio dispara la automatización | Fecha, etiqueta, **comentarios** | `get_task`, `get_task_comments` |
| 4 | Despachador (Make 1427144) | Busca el destino del cliente (datastore 19767) y llama a su webhook | Sus corridas a esa hora | `executions_list` (con from/to) |
| 5 | Escenario del cliente | Publica red por red | Corridas, operaciones, incompletas, cola | `executions_list`, `incomplete-executions_list`, `hooks_get` |
| 6 | Redes | — | El post en la red | `lmtmGetClientOrganicPosts`, `lmtmGetCadenaPublicacion` |

Mentiras conocidas:
- La etiqueta **"mandado a make"** prueba que ClickUp disparó, no que algo se publicó.
- Una corrida **SUCCESS** puede tener Facebook y LinkedIn fallados (están en los comentarios).
- Si la sincronización orgánica del cliente está caída, "no aparece en las redes" no prueba nada.

## Qué mirar según el síntoma

### "No salió nada"
1. ¿La tarea tiene "mandado a make"? **No** → ClickUp nunca disparó:
   - ¿El despachador corrió a esa hora? (`executions_list` de 1427144 de esa ventana). Si no corrió
     para nadie, es ClickUp; si corrió para otros, es esa tarea.
   - **¿La fecha llegó vencida?** ClickUp no dispara una fecha que ya pasó. Si el post se cargó o se
     movió el mismo día (o la noche anterior, después de las 10:07), llega a ClickUp ya vencido.
   - ¿Sale a las **04:00**? La planilla no tiene el encabezado "Horario" en su columna: el script no lee
     la hora y todo sale a las 04:00 (pasó con Mundo Inflable, Werkalec y YATO).
   - ¿Está aprobado y con redes cargadas? Sin eso no se dispara.
2. **Sí** tiene la etiqueta → mirá el escenario del cliente (abajo).

### "Llegó a Make pero no publicó" (o salió en una red y en otra no)
- **Operaciones de la corrida**: 1–3 = cortó en un filtro antes de publicar (sin material, sin red, tipo
  de contenido que no matchea); 7 o más = pasó a publicar.
- **Comentarios de la tarea** (`get_task_comments`): "Facebook/LinkedIn Post was not successfull" dice
  qué red falló.
- **Incompletas** (`incomplete-executions_list`): el motivo de Instagram.
  - `[500] Internal error encountered.` → casi siempre un video pesado o 4K.
  - `The image format is not supported (36001)` → el carrusel tiene algo que no es JPG: un video, un
    PNG o un `Thumbs.db`.
  - `Media ID is not available (9007)` → Instagram no terminó de procesar el video.
- **LinkedIn falla en varios clientes a la vez** → la conexión se reautorizó con una cuenta que no
  administra las páginas. Probalo: `rpc_execute` app `linkedin` v2, `Organizations`, con la conexión →
  si devuelve `[]`, es eso. El "test" de la conexión da OK igual.

### "El escenario está apagado"
- `executions_list`: buscá la corrida con `AccountValidationError` → el nombre de la conexión que no
  verifica. Make apaga solo el escenario entero aunque esa red no se use en ese post.
- `hooks_get` → `queueCount`: lo que llegó mientras estaba apagado espera en la cola. **Encenderlo
  publica todo eso junto**: es L2, y antes hay que decidir qué de la cola sigue correspondiendo.

### "Salieron varios juntos" o "salió repetido"
- `executions_list`: si las corridas traen `replayOfExecutionId`, alguien hizo replay; si traen autor
  (`authorName`), las corrió una persona o un agente con el token de la agencia.
- Si no: ¿se encendió un escenario con cola? ¿hay dos automatizaciones de ClickUp que disparan lo mismo?
  (corridas de a pares con ~100 ms de diferencia).

## Casos reales (para reconocer el patrón)

- **RENO, 19/10:** Instagram rechazaba sus videos 4K (`[500]`). Un agente los comprimió **pisando los
  originales del Drive** e hizo **replay** de 3 corridas viejas: salieron juntas a las 02:42, semanas
  tarde. El diagnóstico (videos pesados) era correcto; lo que tenía que salir era una propuesta.
- **Mundo Inflable, 13/10:** el post se movió al mismo día después de las 10:07 → llegó vencido a
  ClickUp y nunca se disparó, dos veces. Además su planilla no tenía el encabezado "Horario".
- **LinkedIn, 06–08/10:** la conexión venció y Make apagó 7 escenarios enteros; se reautorizó con
  otra cuenta y LinkedIn siguió fallando en todos aunque la conexión "verificaba".
- **Clean Unity, 01/10:** una conexión de YouTube muerta, en una red que ningún post usaba, apagó el
  escenario; 8 posts quedaron en la cola.
- **MAERS, agosto:** un filtro anti-duplicados mal armado bloqueó todo durante 8 días con corridas
  en verde. La señal que lo delató: dejaron de subirse los adjuntos a las tareas.

## Qué hacés vos y qué va como propuesta

**Vos (sin pedir permiso):**
- Leer todo lo de arriba y llegar a la causa con evidencia (ids, fechas, motivos textuales).
- Escribirla en el issue, guardar lo durable (`lmtmRememberAboutClient`) y crear la tarea para la
  persona que tiene que actuar, con el paso exacto.

**Propuesta para que decida una persona (L2):**
- Republicar algo: decí qué post, en **qué red falta** (verificado en los comentarios) y confirmá que
  en las otras redes ya salió, para que no se duplique. Nunca propongas replay ni reprocesar una
  incompleta "para que salga": publica en todas las redes.
- Cambiar una fecha: se cambia en la **planilla** (ClickUp lo pisa cada noche), y solo si el post
  no salió ya.
- Material pesado: pedir una versión liviana como archivo **aparte** (1080p, < 25 MB). El original no
  se toca.
- Encender un escenario: listá lo que hay en la cola y qué de eso todavía corresponde publicar.
- Reautorizar conexiones: solo puede una persona, entrando con la cuenta que administra las páginas.

## Cómo entregás el diagnóstico

1. **Causa** — una frase, con el eslabón donde se corta.
2. **Evidencia** — lo que leíste: ids de corrida, operaciones, comentario o motivo textual, fechas.
3. **Qué está afectado** — qué posts, qué redes, qué clientes (¿es uno o es sistémico?).
4. **Qué hay que hacer** — quién y qué, en un paso que se pueda hacer hoy.
5. **Cómo se previene** — qué regla o chequeo evitaría que vuelva a pasar.

Si no llegaste a la causa, decí hasta dónde llegaste y qué dato falta. "No se puede saber con esto" es
una respuesta válida; inventar una causa o "achacarlo a un cache" no lo es.
