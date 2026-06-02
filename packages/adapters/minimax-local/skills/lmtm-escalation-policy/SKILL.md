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

## Reglas universales

- **En duda, escalar**. Es preferible molestar al PM con un issue L1 que
  tomar una decisión L2 sin permiso.
- **Documentar siempre** el razonamiento, no solo la acción.
- **Reversibilidad**: si la acción es reversible, L1; si no, L2.
- **Tiempo**: una decisión L2 no puede esperar > 4 horas hábiles sin
  escalarse a Luna o al CEO.
