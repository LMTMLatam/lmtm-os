---
name: lmtm-email-marketing
displayName: Email marketing
description: Subject lines, deliverability, segmentation, automation, métricas.
required: false
---

# Email marketing

## Deliverability primero

Si tus emails no llegan a la inbox, todo lo demás es irrelevante.

### Setup técnico mínimo

- **SPF**: registro TXT en el DNS con todos los servers que mandan
  email para tu dominio.
- **DKIM**: firma criptográfica de cada email. Verificá en el panel
  de tu ESP.
- **DMARC**: política de qué hacer con emails que fallan SPF/DKIM.
  Empezar con `p=none` para monitorear, después `p=quarantine`.
- **Custom sending domain**: `mail.tudominio.com` en vez del
  default del ESP. Crítico para reputación.
- **Warmup**: si tu dominio es nuevo, mandá emails en volumen
  creciente: 50/día semana 1, 200/día semana 2, 1000/día semana 3.

### Señales de mala deliverability

- **Open rate < 15%** en lista fría (warm): puede ser deliverability.
- **Bounce rate > 2%**: tu lista está sucia.
- **Spam complaints > 0.1%**: googleando "spam" te lleva a problemas
  serios.
- **Reputación** en tools como Sender Score, MXToolbox, Google Postmaster.

## Subject lines que funcionan

### Patrones probados

- **Personalización**: "María, tu reporte de la semana" (+ 14% open)
- **Urgencia real**: "Termina en 3 horas: tu descuento" (+22% open)
- **Curiosidad**: "El error que cometen el 80% de los marketers"
- **Pregunta**: "¿Cuánto gastaste en ads el mes pasado?"
- **Lista**: "5 emails que te van a ahorrar 10 horas esta semana"
- **Dato específico**: "El 73% de tus suscriptores no abrió el último email"
- **Ego/identity**: "Para los marketers que odian el marketing"
- **Emoticon sutil**: "🎁 Tenés un regalo esperándote"

### Patrones a evitar

- **ALL CAPS** (te va a spam).
- **Spammy words** (gratis, $$$, "100% garantizado", "click here",
  "act now").
- **"Fw:", "Re:"** sin que sea real.
- **Doble signo de exclamación** "!!".
- **Subject > 50 caracteres** en mobile (se corta).
- **Emojis en cada email** (te vuelve predecible).

## Preview text

El texto que aparece después del subject (50-90 chars). **Tan
importante como el subject**. Siempre customizado, no dejes el "View
in browser" como preview.

## Cuándo enviar

- **B2B**: martes a jueves, 9-11 AM hora local del suscriptor.
- **B2C ecommerce**: depende del producto, pero jueves 7-9 PM suele
  andar bien para retail.
- **Newsletter**: misma hora, mismo día, todas las semanas. La
  consistencia es la palanca.
- **Test**: mandá A/B a 10% de la lista y esperá 4-6 horas para
  decidir.

## Segmentación

- **Demográfica** (básica): país, edad, género.
- **Behavioral** (mejor): qué emails abrió, qué links clickeó, en
  qué páginas del sitio estuvo, qué compró.
- **Engagement-based** (lo más accionable): cold (90+ días sin
  abrir), warm (1-30 días), hot (última semana).
- **RFM** (para e-commerce): Recency (cuándo compró), Frequency
  (cuántas veces), Monetary (cuánto gastó).

## Automatations que pagan

| Automation | Cuándo | Revenue lift típico |
|------------|--------|---------------------|
| Welcome series | Alta: nuevo suscriptor | 3-5x más revenue que email único |
| Abandoned cart | Alta: 60% de los carritos se abandonan | 5-10% recovery |
| Browse abandonment | Media: visitaron producto, no compraron | 2-4% recovery |
| Post-purchase | Media: acaban de comprar | 20-30% repeat purchase |
| Win-back | Baja: inactivos 90+ días | 1-3% recovery |
| Birthday/anniversary | Baja: 1x al año por cliente | 2-5x engagement |
| Replenishment | Alta: productos con cadencia | 10-20% lift en LTV |

## Métricas clave

- **Open rate**: 20-25% (warm), 15-20% (cold)
- **CTR**: 2-5%
- **CTOR** (click-to-open): 10-15% (es la que más importa)
- **Unsubscribe rate**: < 0.5% por envío
- **Spam complaint rate**: < 0.1%
- **Bounce rate**: < 2%
- **List growth rate**: 2-5% mensual
- **Revenue per email**: USD 0.10-1.00 (varía brutal por industria)

## Reglas de oro

- **Limpiar la lista** cada 6 meses. Suscriptores dormidos cuestan
  más (peor deliverability) que lo que valen.
- **Doble opt-in** si tenés problema de deliverability. Cuesta
  -10% de subs pero +30% engagement.
- **Mobile first**: 60%+ de los opens son en mobile. Diseñá para
  pantalla de 320px.
- **Plain text > HTML** a veces. Probá ambos para ver qué convierte
  mejor en tu lista.
- **Unsubscribe fácil**: link visible. Si alguien quiere irse, que
  se vaya. Forzar es peor a largo plazo.
