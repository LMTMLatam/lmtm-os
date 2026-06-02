---
name: lmtm-crisis-comms
displayName: Crisis communications
description: Qué hacer cuando algo sale mal: respuesta en redes, comunicación al cliente, post-mortem.
required: false
---

# Crisis communications

Una crisis es cualquier evento que **ponga en riesgo la reputación,
el revenue, o la operación** de un cliente (o de la agencia). Las
primeras 24 horas definen el 80% del outcome.

## Tipos de crisis (en marketing)

| Tipo | Ejemplo | Severidad típica |
|------|---------|------------------|
| **Ad account suspended** | Meta suspende la cuenta por policy violation | Alta |
| **Campaign rejected** | Anuncio rechazado repetidamente | Media |
| **Pixel/CAPI broken** | Tracking dejó de funcionar, attribution perdida | Media-Alta |
| **Brand safety incident** | Ad aparece junto a contenido inapropiado | Alta |
| **Data breach** | Customer data expuesta | Crítica |
| **Negative viral post** | Cliente quejándose públicamente, se hace viral | Alta |
| **Performance collapse** | ROAS cae a 0 de un día para otro | Alta |
| **Budget overspend** | Pacing mal, se gastó 3x el budget | Media |
| **Creative controversy** | Un ad es perceived como ofensivo | Media-Alta |
| **Employee misconduct** | Alguien del equipo hizo algo público | Crítica |
| **System outage** | La plataforma se cayó, no se puede acceder | Media |

## Las 4 fases

### Fase 1 — Detección (0-2 horas)

**Quién**: monitoring tools + humanos en redes.
**Acción**:
1. **Confirmar** que es real (no es un único caso aislado, es un
   patrón o es severo).
2. **Evaluar severidad** (1-5, ver tabla arriba).
3. **Activar el equipo de crisis**: PM + tech lead + account lead.
4. **Documentar todo** desde el minuto 1 (timestamp, evidence,
   actions taken).

**Tools útiles**:
- **Mention / Brand24 / Brandwatch** para social listening.
- **Slack alerts** de Meta/Google para account issues.
- **Statuspage** para outages internos.
- **Alertas en dashboards** (anomalías detectadas automáticamente).

### Fase 2 — Contención (2-12 horas)

**Objetivo**: parar el sangrado, no necesariamente resolver.

#### Ad account suspended (Meta)

- **Inmediato** (0-2h): mandar al cliente comunicación formal de
  qué pasó, qué estamos haciendo, y qué puede pasar.
- **Apelar** a Meta con toda la evidencia (creative original,
  policy que supuestamente violó, ejemplos de ads similares que
  están running).
- **Backup plan**: si la cuenta no se levanta en 24-48h, mover a
  otra cuenta (BM del cliente) o pausar todo.
- **NO** crear cuenta nueva con nombre similar (Meta lo detecta y
  banea).

#### Pixel/CAPI broken

- **Diagnóstico**: en QA sandbox primero, después en prod.
- **Fix**: deploy de la versión correcta, validate que los eventos
  lleguen.
- **Backfill**: si se perdieron eventos, ver si se puede reenviar
  desde el server logs.
- **Cliente**: comunicación clara de qué se perdió, qué se puede
  recuperar, y qué no.

#### Negative viral post

- **NO** responder impulsivamente. **NO** borrar (empeora).
- **Reconocer** públicamente en < 1h ("Vimos el problema, estamos
  investigándolo").
- **DM/contacto privado** al cliente quejoso.
- **Internal**: post-mortem paralelo, qué pasó realmente, qué
  decisión se va a tomar.
- **Resolution post**: una vez resuelto, post público transparente.

#### Performance collapse

- **Diagnóstico rápido**: ¿es el creative, la audiencia, el
  landing page, o el producto?
- **Pausar** lo que está perdiendo plata (más de USD 100/día
  quemándose).
- **Backup** de lo que estaba funcionando antes.
- **Iterar** creative con lo aprendido.
- **Cliente**: comunicación de qué pasó, qué estamos haciendo,
  timeline para recovery.

### Fase 3 — Resolución (12-72 horas)

**Objetivo**: resolver el problema root cause, no solo el síntoma.

- **Implementar el fix** y validar.
- **Test** exhaustivo antes de volver a producción.
- **Cliente**: report formal con causa, fix implementado, qué se
  hace para que no pase de nuevo.
- **Si aplica**: compensación (mes gratis, descuento, hora de
  consulting gratis).

### Fase 4 — Post-mortem (3-7 días después)

**Objetivo**: aprender, prevenir, documentar.

#### Template de post-mortem

```
═══════════════════════════════════════════
POST-MORTEM: [Nombre del incidente]
═══════════════════════════════════════════

RESUMEN (1 párrafo)
- Qué pasó, cuándo, a quién afectó, cuál fue el impacto final
  (cuantificado: USD X, Y clientes, Z días).

TIMELINE
- [hora]: [evento]
- [hora]: [evento]
- ...

CAUSA RAÍZ
- [No "se cayó Meta" — el verdadero 5-why de por qué pasó
  y por qué no lo detectamos/prevenimos antes]

IMPACTO
- Revenue perdido: USD X
- Tiempo de equipo: Y horas
- Clientes afectados: N
- Reputación: [descripción cualitativa]

QUÉ HICIMOS BIEN
- [Bullets de cosas que ayudaron]

QUÉ PODRÍAMOS HABER HECHO MEJOR
- [Bullets honestos]

ACCIONES PREVENTIVAS
- [ ] Acción 1 (owner: X, deadline: Y)
- [ ] Acción 2 (owner: X, deadline: Y)

LECCIONES APRENDIDAS
- [Lo que cambia en nuestro proceso]
═══════════════════════════════════════════
```

## Comunicación al cliente

### Reglas

- **Proactivo > reactivo**: contactá al cliente vos antes de que te
  pregunte.
- **Honestidad > spinning**: si la cagamos, decilo. El cliente
  respeta más la honestidad que el "no fue nuestra culpa".
- **Frecuencia**: updates cada 4-6 horas durante el incidente activo,
  aunque no haya novedades ("seguimos investigando, próximos update
  a las 18h").
- **Canal**: según urgencia. Email para updates. Slack/WhatsApp para
  urgente. Llamada para crisis severas.

### Template de comunicación inicial

```
Asunto: [URGENTE] Actualización sobre [problema]

Hola [nombre],

Te escribo para informarte que detectamos [problema] a las [hora].

IMPACTO:
- [Qué se vio afectado]
- [Qué se perdió, si algo]
- [Qué sigue funcionando]

QUÉ ESTAMOS HACIENDO:
- [Acción 1 en curso]
- [Acción 2 en curso]
- [Acción 3 planeada]

PRÓXIMO UPDATE: [hora específica]

Si tenés alguna pregunta urgente, respondé este email o llamame
directo al [número].

— [tu nombre]
```

## Comunicación pública (en redes, prensa)

### Principios

- **Velocidad > perfección**: responder en < 1h aunque el mensaje
  no sea perfecto.
- **Empático primero, factual después**: "Entendemos la frustración
  y estamos trabajando en..." antes de explicar qué pasó.
- **Una sola voz**: una persona autorizada habla en nombre de la
  marca. Otros redirigen a esa persona.
- **No especular**: solo hechos confirmados. Si no sabés, decí
  "estamos investigando".
- **NO** victimizarte. **NO** culpar al cliente/usuario.
- **SÍ** tomar responsabilidad. **SÍ** describir el plan de acción.

### Template de post público

```
Vimos [situación] y entendemos la frustración que causó.

[1-2 frases: qué pasó objetivamente]

[1-2 frases: qué estamos haciendo]

[1 frase: qué va a cambiar para que no vuelva a pasar]

[Contacto para más info]
```

## Anti-patterns

- **Esconder el problema**: siempre se entera el cliente, y cuando
  se entera es peor.
- **Borrar evidencia**: preservar todo para el post-mortem.
- **Culpar al cliente**: "vos configuraste mal" = no, fallamos
  nosotros en QA.
- **Prometer fecha de fix sin saber**: "listo en 2 horas" y son
  24h destruye la confianza.
- **No documentar**: la próxima crisis se maneja mejor si esta
  está bien documentada.
- **Ignorar el impacto humano**: si alguien del equipo se equivocó,
  una conversación 1-a-1 antes del blame público.
