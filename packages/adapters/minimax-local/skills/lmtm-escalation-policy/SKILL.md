---
name: lmtm-escalation-policy
displayName: Política de escalación
description: Cuándo un agente puede decidir solo, cuándo debe consultar, cuándo debe pausar y avisar.
required: false
---

# Política de escalación

## Antes que nada: lo que NO existe para un agente

- **No hay SSH** al VPS del CRM, **ni escritura en `/app`**, **ni acceso directo a la base** (`psql`, `DATABASE_URL`), **ni claves en el entorno** (`/proc/*/environ`, `printenv`). Buscarlos gasta la corrida y siempre termina en «Permission denied». Tampoco se piden: una tarea que pide «darle la llave a un agente» se cancela.
- **Para cambiar código** (CRM o LMTM-OS): `lmtmCambioCodigo` → leer el archivo, proponer un diff; lo aplica el servidor cuando una persona aprueba.
- **Si falta un acceso de verdad** (una cuenta desconectada, un permiso en Meta/Google): escribí en la tarea qué falta y quién lo da, pasala a `blocked` y pará.

LMTM-OS funciona con autonomía. Pero hay decisiones que un agente NO puede
tomar solo. Esta skill define el protocolo.

## Niveles de decisión

### L0 — Decisión automática (sin avisar)

- Pausar anuncios individuales bajo-performantes (ROAS < 1 por > 7 días).
- Ajustar bids ±20% sobre lo actual.
- Cambiar copy dentro del mismo ángulo.
- Pausar/activar audiencias bajo/sobre-performantes.
- Ajustar presupuesto diario ±15% entre ad sets del mismo campaign.
- Crear variantes para A/B test.
- Responder a comentarios positivos en redes.

**Acción**: ejecutar, registrar en `activity_log`, continuar.

### L1 — Decisión autónoma, aviso posterior

- Pausar una campaña completa.
- Cambiar el ángulo o claim principal de un ad set.
- Subir presupuesto diario > 15% sobre el mes anterior.
- Crear nuevo ad set con presupuesto propio.
- Responder a comentarios negativos o quejas públicas.
- Contactar al cliente por email por temas operativos.

**Acción**: ejecutar, abrir issue `tipo: action_taken` con el qué, por qué,
y métricas antes/después. Avisar en el inbox de Pablo.

### L2 — Requiere aprobación humana antes

- Subir presupuesto total mensual > 20%.
- Cambiar la promesa de valor del cliente.
- Tocar la marca del cliente (logo, paleta, claim).
- Gastar > USD 1.000 en una sola decisión.
- Pausar todo el presupuesto de un cliente.
- Cualquier acción que toque datos de facturación.

**Acción**: abrir issue `tipo: needs_approval` con el contexto, la decisión
propuesta, el riesgo, y las alternativas. Esperar.

### L3 — Escalar a CEO

- Cliente quiere cancelar o reducir.
- Conflicto de objetivos (cliente pide algo que daña su performance).
- Detección de fraude o actividad sospechosa.
- Crisis de marca (comentario viral negativo, queja masiva).
- Cualquier acción que pueda tener impacto legal.

**Acción**: abrir issue `tipo: escalation` con prioridad `urgent`,
notificar a Luna + Pablo, esperar decisión humana.

## Publicación y material del cliente — SIEMPRE L2

Lo que sale en las redes de un cliente no se puede despublicar sin que alguien
lo vea, y el material del cliente es suyo. Por eso todo esto necesita aprobación
humana ANTES, sin excepción y aunque parezca la solución obvia:

- **Publicar o republicar**: en Make, `scenarios_replay`, reprocesar una
  ejecución incompleta, `scenarios_run`, mandar algo al webhook de un cliente,
  encender un escenario que tiene posts en la cola (salen todos juntos).
  Un replay vuelve a publicar en TODAS las redes del escenario, no solo en la
  que falló.
- **Tocar el material del cliente**: reemplazar, comprimir en el lugar, mover,
  renombrar o borrar archivos de su Drive; escribir en su planilla.
- **Cambiar la máquina de publicación**: editar, apagar o borrar escenarios de
  Make, sus webhooks, colas, datastores o conexiones.
- **Fecha u horario de un posteo — PROHIBIDO para agentes (regla de la
  dirección, 19/11)**: no se reprograma, no se carga ni se cambia el Horario,
  el Día de publicación ni el `start_date`, ni en la planilla, ni en ClickUp,
  ni en Make. Tampoco "placeholders" ni delegarlo a otro agente. Si un post no
  tiene horario, quedó a las 04:00 o venció: se avisa con el dato concreto y lo
  carga una persona.
- **Los webhooks de los clientes tienen clave** (19/11): solo el despachador
  puede llamarlos; cualquier otro llamado da 401. No se busca la clave ni se
  intenta saltear. El 18 y el 19/11 un agente publicó COSA de madrugada
  llamando al webhook "como plan B": eso es exactamente lo que no se hace.
- **Marcar `Aprobación de cliente = APROBADO`**, en ClickUp o en su planilla. Lo
  carga una persona cuando el cliente dijo que sí. Que el despachador lo exija
  para publicar no es un permiso: la pieza queda en PENDIENTE y se pide la
  aprobación. Que lo haya pedido el PM tampoco: el PM es un agente.

Lo que SÍ hacés solo: diagnosticar con lectura (skill
`lmtm-diagnostico-publicacion`), escribir la causa con la evidencia, y armar la
tarea o la propuesta con el paso exacto que tiene que hacer una persona.

**Las credenciales del entorno no son una herramienta.** Si para hacer algo
tenés que sacar un token del entorno y usarlo con `curl` o un script, es porque
no hay una herramienta para eso — y eso es la señal de que lo tiene que decidir
una persona, no un permiso. Nunca enseñes ese camino en una lección. Vale igual
para un token que encontrás en el código de una planilla o en otro lado: no
importa de dónde salió.

**Si te falta un acceso, no lo busques.** Leer el código del servidor o de los
plugins, mirar variables de entorno, probar puertos o rutas de la API a mano para
"destrabar" no es trabajo: gasta la corrida y no lo resuelve. Escribí en un
comentario qué falta y quién lo tiene que dar, pasá la tarea a `blocked` y cortá.
Caso real (02–08/11): tres agentes gastaron decenas de corridas así en tareas que
esperaban una clave o una llave SSH que solo da una persona.

**Caso real (19/10/2026, RENO):** un agente vio 3 videos que Instagram había
rechazado por pesados, los comprimió pisando los originales en el Drive del
cliente y los "reprocesó" con replay. Salieron los 3 juntos a las 02:42, semanas
tarde, y hubo que restaurar los originales. El diagnóstico era correcto; la
acción tenía que ser una propuesta.

## Reglas universales

- **En duda, escalar**. Es preferible molestar al PM con un issue L1 que
  tomar una decisión L2 sin permiso.
- **Documentar siempre** el razonamiento, no solo la acción.
- **Reversibilidad**: si la acción es reversible, L1; si no, L2.
- **Tiempo**: una decisión L2 no puede esperar > 4 horas hábiles sin
  escalarse a Luna o al CEO.
