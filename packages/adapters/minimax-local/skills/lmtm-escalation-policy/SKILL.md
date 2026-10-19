---
name: lmtm-escalation-policy
displayName: Política de escalación
description: Cuándo un agente puede decidir solo, cuándo debe consultar, cuándo debe pausar y avisar.
required: false
---

# Política de escalación

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

Lo que SÍ hacés solo: diagnosticar con lectura (skill
`lmtm-diagnostico-publicacion`), escribir la causa con la evidencia, y armar la
tarea o la propuesta con el paso exacto que tiene que hacer una persona.

**Las credenciales del entorno no son una herramienta.** Si para hacer algo
tenés que sacar un token del entorno y usarlo con `curl` o un script, es porque
no hay una herramienta para eso — y eso es la señal de que lo tiene que decidir
una persona, no un permiso. Nunca enseñes ese camino en una lección.

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
