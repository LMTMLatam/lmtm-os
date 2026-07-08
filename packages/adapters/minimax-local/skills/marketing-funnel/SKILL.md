---
name: marketing-funnel
displayName: Embudos de conversión
description: Diseño y optimización de embudos: etapas, ofertas por etapa, métricas de paso y cuellos de botella. Usala para armar o diagnosticar el funnel de un cliente.
required: false
---

# Analisis y optimizacion de funnel de ventas

Eres el motor de analisis de funnel para `/marketing funnel <url>`. Mapeas el camino completo de conversion desde la primera visita hasta la compra, identificas drop-off points, cuantificas la friccion y recomiendas optimizaciones concretas con impacto estimado en revenue. Cada recomendacion se prioriza por lift estimado y esfuerzo de implementacion.

## Cuando se invoca esta skill

El usuario ejecuta `/marketing funnel <url>`. Descarga el sitio y traza cada paso del visitante desde la landing hasta la conversion. Analiza cada paso en friccion, claridad y efectividad. Salida completa a ANALISIS-FUNNEL.md.

---

## Fase 1: Descubrimiento y mapeo del funnel

### 1.1 Identificar el tipo de funnel

Detecta que funnel usa el sitio:

| Tipo de funnel  | Modelo de negocio        | Pasos tipicos                                                           | Metrica clave               |
| --------------- | ------------------------ | ----------------------------------------------------------------------- | --------------------------- |
| **Lead Gen**    | Servicios, agencias, B2B | Landing -> formulario -> gracias -> nurture -> call                     | Tasa lead-a-cliente         |
| **SaaS Trial**  | SaaS                     | Home -> precios -> signup -> onboarding -> upgrade                      | Tasa trial-a-paid           |
| **SaaS Demo**   | SaaS enterprise          | Home -> features -> demo request -> call -> cierre                      | Tasa demo-a-cierre          |
| **E-commerce**  | Tiendas online           | Producto -> carrito -> checkout -> upsell -> gracias                    | Tasa carrito-a-compra       |
| **Webinar**     | Cursos, coaches, SaaS    | Opt-in -> confirmacion -> recordatorio -> directo -> oferta -> checkout | Tasa webinar-a-venta        |
| **Application** | Programas premium        | Info -> formulario -> revision -> entrevista -> aceptacion              | Tasa application-a-admitido |
| **Comunidad**   | Membresias               | Landing -> preview gratis -> engagement -> pago                         | Tasa gratis-a-pago          |
| **Contenido**   | Media, publishers        | Blog -> captura email -> nurture -> premium -> suscribir                | Tasa lector-a-suscriptor    |

### 1.2 Mapear cada paso del funnel

Por cada pagina del funnel documenta:

```
PASO [#]: [Nombre de la pagina]
  URL: [url]
  Tipo de pagina: [landing/producto/precios/carrito/checkout/form/gracias]
  Accion principal: [que debe hacer el usuario]
  Paso siguiente: [a donde debe ir]
  Puntos de salida: [por donde pueden marcharse]
  Elementos de friccion: [cualquier cosa que confunda o ralentice]
  Elementos de confianza: [cualquier cosa que de seguridad]
  Tiempo de carga: [estimado por complejidad]
```

### 1.3 Mapa visual del funnel

Crea un mapa ASCII del flujo:

```
VIAJE DEL VISITANTE
===================

Fuentes de trafico
  |
  v
[Home] ─── 100% de visitantes
  |
  v
[Precios] ─── ~30% hacen clic
  |
  v
[Formulario de signup] ─── ~15% llegan al signup
  |
  v
[Onboarding] ─── ~10% completan
  |
  v
[Uso activo] ─── ~6% llegan a activacion
  |
  v
[Plan de pago] ─── ~2% convierten a pago

Conversion global visitante-a-cliente: 2%
```

Ajusta la plantilla al funnel real detectado.

---

## Fase 2: Analisis pagina por pagina

### 2.1 Framework de analisis

Por cada pagina del funnel, puntua estas dimensiones:

| Dimension       | Score (0-10) | Que se evalua                                          |
| --------------- | ------------ | ------------------------------------------------------ |
| **Claridad**    | 0-10         | Se entiende al instante el proposito de la pagina?     |
| **Continuidad** | 0-10         | Continua de forma logica desde el paso anterior?       |
| **Motivacion**  | 0-10         | Da suficiente razon para tomar el siguiente paso?      |
| **Friccion**    | 0-10         | Cuan facil es completar la accion (10 = sin friccion)? |
| **Confianza**   | 0-10         | Hay senales de confianza adecuadas para esta fase?     |

**Score de pagina = media de las 5 dimensiones (0-10)**

### 2.2 Drop-offs comunes y sus fixes

**Home al siguiente paso:**
| Causa del drop-off | Senal | Fix |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Value prop poco clara | Titular vago, sin especificidad | Reescribir titular con resultado concreto |
| Sin CTA claro | Varios CTAs al mismo peso, CTA below fold| Un CTA principal above the fold |
| Carga lenta | Imagenes pesadas, scripts excesivos | Optimizar imagenes, diferir JS no critico |
| Mala experiencia en movil | Texto pequeno, botones pegados | Rediseno responsive mobile-first |

**Pagina de precios:**
| Causa del drop-off | Senal | Fix |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Shock de precio | Se ve el precio sin contexto previo | Framing de valor antes de los numeros |
| Demasiadas opciones | 4+ planes, sobrecarga de features | Reducir a 3, destacar el recomendado |
| Costes ocultos | Fees que aparecen en el flujo | Precios transparentes desde el principio |
| Sin prueba social | Sin testimonios cerca de los precios | Citas de clientes junto a cada plan |
| FAQ inexistente | Preguntas comunes sin responder | FAQ con las 5 objeciones top |

**Signup / registro:**
| Causa del drop-off | Senal | Fix |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Demasiados campos | 5+ campos obligatorios | Bajar a 3 o menos (nombre, email, password) |
| Cuenta obligatoria muy pronto | Obliga a registrarse para ver contenido | Permitir preview o trial sin cuenta |
| Sin barra de progreso | Form multi-step sin progreso | Anadir contador: "Paso 1 de 3" |
| Sin social login | Solo email/password | Anadir Google/GitHub/SSO |
| Sin senales de confianza | Sin nota de privacidad, sin sellos | Anadir "sin spam", sellos de seguridad |

**Checkout / compra:**
| Causa del drop-off | Senal | Fix |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Coste de envio sorpresa | Envio aparece solo en checkout | Mostrar envio pronto o ofrecer gratis |
| Registro obligatorio | Hay que registrarse antes de pagar | Opcion de guest checkout |
| Opciones de pago limitadas | Solo tarjeta | Anadir PayPal, Apple Pay, Google Pay, Bizum |
| Sin urgencia | No hay razon para comprar ya | Stock limitado, countdown o bonus |
| Sin garantia | Sin politica de devolucion visible | Garantia de devolucion cerca del CTA |

### 2.3 Efectividad del lead magnet

Si el funnel incluye lead magnet, evalua:

**Scoring del lead magnet:**
| Criterio | Score (0-10) | Evaluacion |
| --------------------- | ------------ | -------------------------------------------------------------- |
| **Relevancia** | 0-10 | Aborda directamente el dolor principal de la audiencia? |
| **Especificidad** | 0-10 | Es un entregable concreto (no una "guia gratis" vaga)? |
| **Valor percibido** | 0-10 | Alguien pagaria 20+ EUR por esto? |
| **Quick win** | 0-10 | Puede obtener valor en menos de 10 minutos? |
| **Alineacion producto**| 0-10 | Lleva de forma natural a querer el producto de pago? |
| **Friccion del opt-in**| 0-10 | El formulario es simple? (10 = solo email) |

**Tipos de lead magnet rankeados por efectividad:**

1. Plantillas y herramientas (mayor conversion, valor inmediato)
2. Checklists y cheat sheets (quick win, consumo rapido)
3. Casos de exito con numeros (construye credibilidad)
4. Formacion o taller en video (alto valor percibido)
5. Ebooks y guias (menos conversion pero buenos para autoridad)
6. Quizzes y assessments (interactivos, alto engagement)
7. Trials y demos (product-led, mayor intencion)

---

## Fase 3: Metricas y benchmarks del funnel

### 3.1 Metricas clave

Calcula (o estima con benchmarks) estas metricas:

```
METRICAS DEL FUNNEL
===================

Trafico:
  Visitantes mensuales: [estimar o preguntar]
  Fuentes: [organico %, pagado %, referral %, directo %, social %]

Conversion:
  Visitante -> Lead: [X]% (benchmark: 2-5%)
  Lead -> MQL: [X]% (benchmark: 15-30%)
  MQL -> Oportunidad: [X]% (benchmark: 30-50%)
  Oportunidad -> Cliente: [X]% (benchmark: 20-40%)
  Global visitante -> cliente: [X]% (benchmark: 0,5-3%)

Revenue:
  Ticket medio (AOV): [X] EUR
  LTV: [X] EUR
  CAC: [X] EUR
  Ratio LTV:CAC: [X]:1 (objetivo: 3:1 o mas)
  Revenue por visitante (RPV): [X] EUR

Engagement:
  Paginas por sesion: [X]
  Duracion media de sesion: [X] min
  Bounce rate: [X]% (benchmark: 30-60%)
```

### 3.2 Calculo del Revenue-per-Visitor

Es la metrica mas importante para optimizar el funnel:

```
RPV = (Revenue mensual) / (Visitantes mensuales)

Ejemplo:
  10.000 visitas/mes x 2% conversion x 80 EUR AOV = 16.000 EUR/mes
  RPV = 16.000 / 10.000 = 1,60 EUR por visitante

Si subimos conversion de 2% a 2,5%:
  10.000 x 2,5% x 80 EUR = 20.000 EUR/mes
  RPV = 2,00 EUR por visitante
  Lift = 4.000 EUR/mes = 48.000 EUR/ano
```

Usa este framework para cuantificar cada recomendacion.

### 3.3 Benchmarks por tipo de funnel

| Tipo de funnel            | Buena conversion | Gran conversion | Elite  |
| ------------------------- | ---------------- | --------------- | ------ |
| Lead Gen (formulario)     | 3-5%             | 5-10%           | 10-20% |
| SaaS Free Trial           | 2-5%             | 5-10%           | 10-15% |
| Trial a Paid              | 10-15%           | 15-25%          | 25-40% |
| E-commerce (browse-a-buy) | 1-3%             | 3-5%            | 5-8%   |
| Carrito a compra          | 50-60%           | 60-70%          | 70-80% |
| Registro a webinar        | 20-40%           | 40-55%          | 55-70% |
| Asistencia al webinar     | 30-40%           | 40-55%          | 55-65% |
| Webinar a venta           | 2-5%             | 5-10%           | 10-20% |
| Respuesta a cold email    | 3-5%             | 5-10%           | 10-20% |
| Demo a cierre             | 15-25%           | 25-40%          | 40-60% |

---

## Fase 4: Recomendaciones de optimizacion

### 4.1 Matriz de priorizacion

Puntua cada recomendacion con este framework:

| Prioridad        | Impacto            | Esfuerzo         | Cuando implementar   |
| ---------------- | ------------------ | ---------------- | -------------------- |
| **P1 (ahora)**   | Alto (>10% lift)   | Bajo (<1 dia)    | Esta semana          |
| **P2 (planear)** | Alto (>10% lift)   | Medio (1-5 dias) | Este mes             |
| **P3 (agendar)** | Medio (5-10% lift) | Bajo (<1 dia)    | Este mes             |
| **P4 (backlog)** | Medio (5-10% lift) | Alto (5+ dias)   | Este trimestre       |
| **P5 (nice)**    | Bajo (<5% lift)    | Cualquiera       | Cuando haya recursos |

### 4.2 Optimizaciones por fase del funnel

**Top of funnel (awareness a interes):**

- A/B test del headline (lift esperado: 10-30%)
- Ubicacion de prueba social (5-15%)
- Optimizacion de velocidad (5-20%)
- Popup de exit-intent con lead magnet (2-5% de los que se iban)

**Middle of funnel (interes a consideracion):**

- Casos de estudio y testimonios (10-20%)
- Paginas de comparativa de features (5-15%)
- Demos interactivos de producto (15-30%)
- Secuencias de email de retargeting (10-25%)

**Bottom of funnel (consideracion a compra):**

- Rediseno de la pagina de precios (10-25%)
- Reduccion de friccion en checkout (5-15%)
- Reversion del riesgo (garantias, trials) (10-20%)
- Urgencia y escasez (5-15%)
- Recuperacion de carrito abandonado (5-15% de recuperados)

**Post-compra (retencion y expansion):**

- Secuencia de onboarding (10-20% reduccion de churn)
- Upsell/cross-sell en la thank-you (5-15% del AOV)
- Programa de referral (5-15% nuevos clientes)
- Encuesta NPS a los 30 dias (detecta clientes en riesgo)

### 4.3 Optimizacion de la pagina de precios

Suele ser el punto de mayor palanca:

**Checklist de auditoria de precios:**

- [ ] El titular enmarca valor, no coste ("Elige tu plan de crecimiento")
- [ ] Los planes estan limitados a 3 (o 3 + enterprise)
- [ ] Hay un plan destacado como "Mas popular" o "Mejor valor"
- [ ] Pricing anual mostrado primero con ahorro destacado
- [ ] Features redactadas en beneficio (no jerga)
- [ ] Prueba social cerca de los precios (testimonios, numero de clientes)
- [ ] FAQ responde a las 5 objeciones de precio top
- [ ] Garantia de devolucion o trial gratis claramente visibles
- [ ] Nombres de planes aspiracionales (no "Basic/Standard/Premium")
- [ ] CTAs en lenguaje de accion ("Empezar a crecer" en vez de "Suscribirse")
- [ ] Comparativa con competidores o con el coste de no comprar
- [ ] "Ayudame a elegir" o quiz para los indecisos

### 4.4 Optimizacion del flujo de checkout/signup

**Auditoria de friccion:**

- Contar campos totales (objetivo: 3-5 lead gen, 5-8 checkout)
- Contar pasos (objetivo: 1-3)
- Comprobar barras de progreso en multi-step
- Verificar usabilidad movil (input types, autocomplete, tamano de boton)
- Buscar campos obligatorios innecesarios
- Verificar validacion inline (feedback de error en tiempo real)
- Revisar que los mensajes de error sean utiles (no solo "Invalid input")
- Comprobar si el usuario puede guardar progreso y volver

---

## Fase 5: Integracion con secuencias de nurture

### 5.1 Mapeo funnel-a-email

Por cada fase del funnel, recomienda la secuencia apropiada:

```
Fase del funnel           -> Secuencia de email
---------------------------------------------------
Visitante (anonimo)       -> Ninguna (usar retargeting)
Lead (ha opt-in)          -> Welcome (5-7 emails)
Lead engaged              -> Nurture (6-8 emails)
Usuario trial             -> Onboarding (5-7 emails)
Trial inactivo            -> Re-engagement (3-4 emails)
Cliente                   -> Post-compra / loyalty
Cliente churned           -> Win-back (3-4 emails)
```

### 5.2 Alineacion con fuente de trafico

Distintas fuentes necesitan puntos de entrada distintos:

| Fuente            | Nivel de intencion | Punto de entrada        | Funnel recomendado               |
| ----------------- | ------------------ | ----------------------- | -------------------------------- |
| Busqueda de marca | Alta               | Precios / signup        | Corto (directo a trial/compra)   |
| Busqueda no-marca | Media              | Blog / landing          | Medio (educar + convertir)       |
| Paid social       | Baja-media         | Lead magnet / contenido | Largo (capturar, nurture)        |
| Referral          | Media-alta         | Home / producto         | Medio (confianza pre-construida) |
| Directo           | Alta               | Home                    | Corto (ya te conocen)            |
| Email             | Media              | Landing especifica      | Targeted (coincide con email)    |

---

## Formato de salida: ANALISIS-FUNNEL.md

Escribe la salida completa en `ANALISIS-FUNNEL.md`:

```markdown
# Analisis de funnel: [Negocio]

**URL:** [url]
**Fecha:** [fecha actual]
**Tipo de negocio:** [tipo]
**Tipo de funnel:** [tipo]
**Salud global del funnel: [X]/100**

---

## Resumen ejecutivo

[3-4 parrafos: tipo de funnel, valoracion actual, mayor cuello de botella,
top 3 recomendaciones con impacto en revenue]

---

## Mapa del funnel

[Visualizacion ASCII con tasas de conversion estimadas por paso]

---

## Analisis pagina por pagina

### Paso 1: [Nombre]

[Analisis completo con scores, friccion, confianza, recomendaciones]

### Paso 2: [Nombre]

[Continuar por cada paso]

---

## Metricas del funnel

[Metricas actuales vs benchmarks, huecos destacados]

## Analisis de impacto en revenue

[Calculos de RPV, escenarios de mejora]

## Recomendaciones de optimizacion

### Prioridad 1 — Ahora (esta semana)

[Acciones concretas con lift esperado]

### Prioridad 2 — Planear (este mes)

[Acciones concretas con lift esperado]

### Prioridad 3 — Estrategico (este trimestre)

[Acciones concretas con lift esperado]

---

## Auditoria de la pagina de precios

[Auditoria detallada con checklist]

## Evaluacion del lead magnet

[Si aplica: scoring y recomendaciones]

## Integracion con email nurture

[Mapeo funnel-a-email]

## Alineacion con fuente de trafico

[Que trafico va a donde]

## Siguientes pasos

1. [Accion mas critica]
2. [Segunda prioridad]
3. [Tercera prioridad]
```

---

## Salida por terminal

```
=== ANALISIS DE FUNNEL COMPLETADO ===

Negocio: [nombre]
Tipo de funnel: [tipo]
Pasos: [cuantos]
Salud del funnel: [X]/100

Flujo de conversion:
  Visitantes  -> Leads:     [X]% (benchmark: [X]%)
  Leads       -> Trial:     [X]% (benchmark: [X]%)
  Trial       -> Paid:      [X]% (benchmark: [X]%)
  Global:                   [X]% (benchmark: [X]%)

Mayor cuello de botella: [fase] — [X]% de drop-off
Oportunidad de revenue: [X.XXX] EUR/mes con los fixes recomendados

Top 3 fixes:
  1. [fix] — lift estimado [X]%
  2. [fix] — lift estimado [X]%
  3. [fix] — lift estimado [X]%

Analisis completo guardado en: ANALISIS-FUNNEL.md
```

---

## Integracion con otras skills

- Si existe `AUDITORIA-MARKETING.md`, referencia los scores de conversion
- Si existe `COPY-SUGERENCIAS.md`, aplica las mejoras de copy a las paginas del funnel
- Si existe `SECUENCIAS-EMAIL.md`, verifica alineacion con las fases del funnel
- Si existe `INFORME-COMPETIDORES.md`, compara efectividad de funnel
- Sugiere siguiente paso: `/marketing copy` para copy por pagina, `/marketing emails` para secuencias, `/marketing landing` para deep dive de CRO
