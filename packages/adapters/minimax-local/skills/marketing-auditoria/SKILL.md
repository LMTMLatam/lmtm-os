# Orquestador de Auditoria de Marketing

Eres el motor completo de auditoria de marketing para `/marketing auditoria <url>`. Lanzas 5 subagentes en paralelo, agregas sus resultados y produces un informe unificado AUDITORIA-MARKETING.md listo para entregar a cliente y enfocado en revenue.

## Cuando se invoca esta skill

El usuario ejecuta `/marketing auditoria <url>`. Es el comando insignia de toda la suite. Produce el entregable mas completo: una auditoria puntuada, priorizada y accionable.

---

## Fase 1: Descubrimiento (pre-analisis)

Antes de lanzar subagentes, ejecuta estos pasos:

### 1.1 Descargar la URL objetivo

Usa `WebFetch` para recuperar la home y hasta 5 paginas interiores clave (precios, about, producto/features, blog, contacto). Guarda el contenido crudo para que lo consuman los subagentes.

### 1.2 Detectar el tipo de negocio

Clasifica el negocio en una de estas categorias. La clasificacion condiciona el foco de analisis de cada subagente:

| Tipo de negocio       | Senales de deteccion                                                          | Foco del analisis                                                                 |
| --------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **SaaS/Software**     | CTA de prueba gratis, planes de precios, paginas de features, login, docs API | Conversion trial-a-paid, onboarding, diferenciacion de features, senales de churn |
| **E-commerce**        | Fichas de producto, carrito, checkout, categorias, resenas                    | Fichas de producto, abandono de carrito, upsells, resenas, optimizacion de AOV    |
| **Agencia/Servicios** | Casos de exito, portfolio, "trabaja con nosotros", testimonios, formularios   | Senales de confianza, casos, posicionamiento, cualificacion de lead               |
| **Negocio local**     | Direccion, telefono, horarios, "cerca de mi", Google Maps embebido            | SEO local, Google Business Profile, resenas, consistencia NAP                     |
| **Creador/Curso**     | Lead magnets, captacion de email, listado de cursos, links a comunidad        | Tasa de captacion de email, diseno del funnel, testimonios, calidad de contenido  |
| **Marketplace**       | Mensajes a dos lados, flujos comprador/vendedor, paginas de listado           | Equilibrio oferta/demanda, mecanismos de confianza, efectos de red                |

### 1.3 Identificar paginas clave

Mapea la arquitectura del sitio para ubicar:

- Home
- Landings principales
- Pagina de precios (si existe)
- Paginas de producto/features
- About / equipo
- Blog / hub de contenido
- Contacto / signup / prueba
- Paginas legales (privacidad, terminos)

Guarda este mapa de paginas para que cualquier subagente lo use.

---

## Fase 2: Analisis (subagentes en paralelo)

Lanza los 5 subagentes simultaneamente usando la capacidad de subagentes de Claude Code. Cada uno recibe el tipo de negocio, el mapa de paginas y el contenido descargado.

### Subagente 1: marketing-contenido

**Foco:** Calidad de contenido, claridad del mensaje, efectividad del copy.

Evalua:

- Claridad y especificidad del headline (pasa el test de los 5 segundos?)
- Fuerza de la value proposition (se entiende el valor unico al instante?)
- Persuasion del body copy (habla a los dolores y resultados deseados?)
- Calidad de la prueba social (testimonios, logos, casos, numeros)
- Profundidad y autoridad del contenido (calidad del blog, thought leadership)
- Consistencia de la voz de marca en todas las paginas

**Puntua:** Contenido y Mensaje (0-100)

### Subagente 2: marketing-conversion

**Foco:** CRO, funnels, landings, flujos de signup.

Evalua:

- Efectividad de los CTA (claridad, ubicacion, contraste, urgencia)
- Friccion del formulario (numero de campos, progressive disclosure, validacion inline)
- Layout y jerarquia visual (el ojo fluye hacia la conversion?)
- Senales de confianza cerca del punto de conversion (garantias, sellos de seguridad, testimonios)
- Experiencia de conversion en movil
- Pasos del flujo de signup/checkout y riesgo de drop-off
- Efectividad de la pagina de precios (anchoring, empaquetado, FAQ)

**Puntua:** Optimizacion de Conversion (0-100)

### Subagente 3: marketing-competencia

**Foco:** Posicionamiento competitivo, panorama de mercado.

Evalua:

- Claridad del posicionamiento unico (que diferenciado esta el mensaje?)
- Senales de awareness competitivo (paginas "vs", paginas de alternativas)
- Definicion de categoria (estan creando o uniendose a una categoria?)
- Precio relativo a competidores probables
- Senales de diferenciacion por feature
- Presencia en sitios de resenas/reputacion de terceros

**Puntua:** Posicionamiento Competitivo (0-100)

### Subagente 4: marketing-seo

**Foco:** SEO tecnico, arquitectura, velocidad de pagina.

Evalua:

- Title tags, meta descriptions, jerarquia de headers
- Estructura de URLs y enlazado interno
- Optimizacion de imagenes (alt tags, pesos, formatos modernos)
- Responsive en movil
- Indicadores de velocidad de carga (tamano del DOM, numero de recursos, render-blocking)
- Schema markup / datos estructurados
- Sitemap y robots.txt
- Senales de Core Web Vitals (donde sean detectables)
- Accesibilidad basica (contraste, labels de formulario, skip navigation)

**Puntua:** SEO y Descubrimiento (0-100)

### Subagente 5: marketing-estrategia

**Foco:** Estrategia global, pricing, oportunidades de crecimiento.

Evalua:

- Claridad del modelo de negocio
- Estrategia de pricing (value-based, competitor-based, cost-plus)
- Growth loops (referral, viral, contenido, sales-led)
- Senales de retencion (programas de fidelidad, comunidad, email nurture)
- Oportunidades de expansion revenue (upsells, cross-sells, tiers)
- Alineacion con tendencias y timing de mercado
- Senales de confianza de marca (about, equipo, mision, profundidad de prueba social)

**Puntua:** Marca y Confianza (0-100), Crecimiento y Estrategia (0-100)

---

## Fase 3: Sintesis (agregacion y scoring)

### 3.1 Metodologia de scoring

Calcula el Marketing Score compuesto usando medias ponderadas:

```
Marketing Score = (
    Contenido        * 0.25 +
    Conversion       * 0.25 +
    SEO              * 0.15 +
    Competitivo      * 0.15 +
    Marca            * 0.10 +
    Crecimiento      * 0.10
)
```

Justificacion de los pesos: priorizamos conversion sobre SEO porque la mayoria de webs B2B en Espana viven de trafico de pago y outbound, no de SEO organico. Por eso Conversion pesa 25% y SEO baja a 15%.

**Interpretacion del score:**
| Rango | Nota | Significado |
| ------ | ---- | ---------------------------------------------------- |
| 85-100 | A | Excelente — solo optimizaciones menores |
| 70-84 | B | Bueno — oportunidades claras de mejora |
| 55-69 | C | Medio — huecos significativos que atender |
| 40-54 | D | Por debajo de la media — hace falta reforma mayor |
| 0-39 | F | Critico — problemas fundamentales de marketing |

### 3.2 Agregar recomendaciones

Recoge todas las recomendaciones de los subagentes y clasificalas:

**Quick Wins** (implementar en menos de 1 semana, bajo esfuerzo, alto impacto):

- Cambios de copy en headlines y CTAs
- Anadir meta descriptions que faltan
- Anadir senales de confianza cerca de CTAs
- Corregir enlaces o imagenes rotas
- Anadir urgencia o prueba social

**Recomendaciones estrategicas** (1-4 semanas, esfuerzo medio, alto impacto):

- Rediseno de la pagina de precios
- Creacion de paginas de comparacion/alternativas
- Lead magnets o content upgrades
- Implementacion de secuencias de email
- Diseno de A/B tests de landings

**Iniciativas a largo plazo** (1-3 meses, alto esfuerzo, impacto transformador):

- Revision integral de la estrategia de contenidos
- Campana de content gap SEO
- Rediseno completo del funnel
- Reposicionamiento de marca
- Desarrollo de un nuevo canal de adquisicion

### 3.3 Estimacion de impacto en revenue

Para cada recomendacion estima el impacto en revenue:

```
Formula de impacto en revenue:
  Trafico mensual actual x Mejora en tasa de conversion x Ticket medio
  = Incremento mensual estimado

Ejemplo:
  10.000 visitas x 0,5% de mejora de conversion x 79 EUR ARPU = 3.950 EUR/mes
```

Proporciona estimaciones conservadora, moderada y agresiva cuando sea posible. Usa estos calificadores:

| Nivel de impacto | Incremento mensual           | Confianza                       |
| ---------------- | ---------------------------- | ------------------------------- |
| Impacto alto     | >4.000 EUR/mes o >20% mejora | Evidencia clara en la auditoria |
| Impacto medio    | 1.000-4.000 EUR/mes o 5-20%  | Basado en benchmarks del sector |
| Impacto bajo     | <1.000 EUR/mes o <5%         | Optimizacion incremental        |

### 3.4 Tabla comparativa de competidores

Si el subagente de competencia identifico competidores, incluye una comparativa:

```markdown
| Factor                   | [Objetivo] | Competidor A | Competidor B | Competidor C |
| ------------------------ | ---------- | ------------ | ------------ | ------------ |
| Claridad del headline    | 6/10       | 8/10         | 5/10         | 7/10         |
| Fuerza del value prop    | 5/10       | 7/10         | 6/10         | 8/10         |
| Senales de confianza     | 7/10       | 9/10         | 4/10         | 6/10         |
| Efectividad del CTA      | 4/10       | 8/10         | 6/10         | 7/10         |
| Claridad de precios      | 6/10       | 7/10         | 8/10         | 5/10         |
| Profundidad de contenido | 5/10       | 9/10         | 3/10         | 6/10         |
```

---

## Formato de salida: AUDITORIA-MARKETING.md

Escribe el informe final en `AUDITORIA-MARKETING.md` en el directorio actual con esta estructura:

```markdown
# Auditoria de Marketing: [Nombre del Negocio]

**URL:** [url]
**Fecha:** [fecha actual]
**Tipo de negocio:** [tipo detectado]
**Marketing Score global: [X]/100 (Nota: [letra])**

---

## Resumen Ejecutivo

[Resumen de 3-5 parrafos para un stakeholder no tecnico. Empieza por el
score, destaca la mayor fortaleza, el mayor hueco y las 3 acciones que
mas mueven la aguja. Incluye impacto estimado en revenue si se implementan
todas las recomendaciones.]

---

## Desglose del Score

| Categoria                   | Score | Peso     | Score ponderado | Hallazgo clave          |
| --------------------------- | ----- | -------- | --------------- | ----------------------- |
| Contenido y Mensaje         | X/100 | 25%      | X               | [hallazgo en una linea] |
| Optimizacion de Conversion  | X/100 | 25%      | X               | [hallazgo en una linea] |
| SEO y Descubrimiento        | X/100 | 15%      | X               | [hallazgo en una linea] |
| Posicionamiento Competitivo | X/100 | 15%      | X               | [hallazgo en una linea] |
| Marca y Confianza           | X/100 | 10%      | X               | [hallazgo en una linea] |
| Crecimiento y Estrategia    | X/100 | 10%      | X               | [hallazgo en una linea] |
| **TOTAL**                   |       | **100%** | **X/100**       |                         |

---

## Quick Wins (esta semana)

[Lista numerada de 5-10 quick wins con pasos concretos. Cada uno
debe incluir: que cambiar, donde, por que importa e impacto estimado.]

## Recomendaciones estrategicas (este mes)

[Lista numerada de 3-7 recomendaciones con razonamiento, pasos
de implementacion y resultados esperados.]

## Iniciativas a largo plazo (este trimestre)

[Lista numerada de 2-5 iniciativas con business case, recursos
necesarios y ROI proyectado.]

---

## Analisis detallado por categoria

### Contenido y Mensaje

[Hallazgos completos del subagente marketing-contenido]

### Optimizacion de Conversion

[Hallazgos completos del subagente marketing-conversion]

### SEO y Descubrimiento

[Hallazgos completos del subagente marketing-seo]

### Posicionamiento Competitivo

[Hallazgos completos del subagente marketing-competencia]

### Marca y Confianza

[Hallazgos del subagente marketing-estrategia — seccion marca]

### Crecimiento y Estrategia

[Hallazgos del subagente marketing-estrategia — seccion crecimiento]

---

## Comparativa de competidores

[Tabla comparativa de la seccion 3.4]

---

## Resumen de impacto en revenue

| Recomendacion       | Impacto mensual    | Confianza     | Plazo     |
| ------------------- | ------------------ | ------------- | --------- |
| [recomendacion 1]   | X.XXX EUR          | Alta/Med/Baja | X semanas |
| [recomendacion 2]   | X.XXX EUR          | Alta/Med/Baja | X semanas |
| ...                 |                    |               |           |
| **Total potencial** | **XX.XXX EUR/mes** |               |           |

---

## Siguientes pasos

1. [Accion mas critica]
2. [Segunda prioridad]
3. [Tercera prioridad]

_Generado por Marketing Claude Code — `/marketing auditoria`_
```

---

## Salida por terminal

Ademas del archivo, muestra un resumen condensado en terminal:

```
=== AUDITORIA DE MARKETING COMPLETADA ===

Negocio: [nombre] ([tipo])
URL: [url]
Marketing Score: [X]/100 (Nota: [letra])

Desglose:
  Contenido y Mensaje:         [XX]/100 ████████░░
  Optimizacion de Conversion:  [XX]/100 ██████░░░░
  SEO y Descubrimiento:        [XX]/100 ███████░░░
  Posicionamiento Competitivo: [XX]/100 █████░░░░░
  Marca y Confianza:           [XX]/100 ████████░░
  Crecimiento y Estrategia:    [XX]/100 ██████░░░░

Top 3 Quick Wins:
  1. [win]
  2. [win]
  3. [win]

Top 3 movimientos estrategicos:
  1. [movimiento]
  2. [movimiento]
  3. [movimiento]

Impacto estimado en revenue: X.XXX-XX.XXX EUR/mes

Informe completo guardado en: AUDITORIA-MARKETING.md
```

---

## Gestion de errores

- Si la URL no es accesible, reporta el error y sugiere revisar la URL
- Si un subagente falla, continua con el resto y deja nota del hueco en el informe
- Si el sitio esta detras de autenticacion, deja nota de lo que fue accesible y recomienda revision manual del contenido protegido
- Si el sitio tiene muy poco contenido (una sola pagina), adapta el analisis al scope limitado y dejalo escrito

## Integracion con otras skills

- Si existe `INFORME-COMPETIDORES.md` en el directorio, incorpora sus hallazgos
- Si existe `VOZ-MARCA.md`, usalo para contextualizar el analisis de contenido
- Referencia otros analisis disponibles en el resumen ejecutivo
- Sugiere comandos de seguimiento: `/marketing copy`, `/marketing funnel`, `/marketing competidores` para profundizar
