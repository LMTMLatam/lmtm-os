# Generador de Informe de Marketing (Markdown)

## Proposito de la skill

Generar un informe de marketing exhaustivo y profesional en Markdown. Compila datos de auditorias y analisis previos en un documento unico listo para cliente, con scores, hallazgos, recomendaciones y un plan de accion priorizado con estimacion de impacto en ingresos.

## Cuando usarla

- El usuario quiere un informe completo para un cliente o su propio negocio
- El usuario ejecuto una o varias skills de auditoria y quiere el compilado
- El usuario pide un assessment, scorecard o documento de analisis
- Se activa con `/marketing informe` o `/marketing informe <dominio>`

## Como ejecutarla

### Paso 1: Recoger toda la data disponible

Antes de generar, busca data previa de skills ejecutadas. Revisa estos archivos en el directorio del proyecto:

**Fuentes posibles:**

- `AUDITORIA-MARKETING.md` — de `/marketing auditoria`
- `LANDING-CRO.md` — de `/marketing landing`
- `AUDITORIA-SEO.md` — de `/marketing seo`
- `VOZ-MARCA.md` — de `/marketing marca`
- `INFORME-COMPETIDORES.md` — de `/marketing competidores`
- `ANALISIS-FUNNEL.md` — de `/marketing funnel`
- `CALENDARIO-REDES.md` — de `/marketing redes`
- `CAMPANAS-ADS.md` — de `/marketing ads`
- `SECUENCIAS-EMAIL.md` — de `/marketing emails`
- `COPY-SUGERENCIAS.md` — de `/marketing copy`

Si no hay data previa, avisa al usuario y ofrece:

1. Ejecutar una auditoria rapida primero (recomendado)
2. Generar el informe con la info disponible (URL, data del usuario)
3. Crear una plantilla que pueda rellenar

### Paso 2: Calcular el scorecard de marketing

Puntua en 6 categorias (cada una sobre 100). El score global es la media ponderada.

**Pesos aplicados (coherentes con filosofia implementation-focused: priorizamos conversion sobre SEO):**

| Categoria                   | Peso |
| --------------------------- | ---- |
| Contenido y Mensaje         | 25%  |
| Optimizacion de Conversion  | 25%  |
| SEO y Descubrimiento        | 15%  |
| Posicionamiento Competitivo | 15%  |
| Marca y Confianza           | 10%  |
| Crecimiento y Estrategia    | 10%  |
| **Total**                   | 100% |

**Justificacion:** en Espana la mayoria de webs B2B viven de trafico de pago + outbound, no de SEO organico. Priorizamos palancas de conversion.

#### Categoria 1: Contenido y Mensaje (25%)

Calidad del copy, value proposition, claridad del headline, texto de CTAs, consistencia de la voz de marca.

| Factor                         | Puntos | Criterio                                                              |
| ------------------------------ | ------ | --------------------------------------------------------------------- |
| Value proposition clara        | 25     | Clara al instante = 25, requiere esfuerzo = 15, vaga = 7, ausente = 0 |
| Calidad de headlines y CTAs    | 20     | Fuertes y especificos = 20, correctos = 13, debiles = 7, pesimos = 0  |
| Consistencia de voz de marca   | 20     | Consistente = 20, mayoritaria = 13, inconsistente = 7, sin voz = 0    |
| Traduccion feature a beneficio | 15     | Siempre = 15, frecuente = 10, rara = 5, nunca = 0                     |
| Segmentacion de audiencia      | 20     | Precisa = 20, parcial = 13, generica = 7, fuera de objetivo = 0       |

#### Categoria 2: Optimizacion de Conversion (25%)

Social proof, diseno de formularios, CTAs, gestion de objeciones, urgencia.

| Factor                      | Puntos | Criterio                                                            |
| --------------------------- | ------ | ------------------------------------------------------------------- |
| Social proof                | 20     | Multiples tipos = 20, algunos = 13, minimo = 7, ninguno = 0         |
| CTAs (copy y ubicacion)     | 25     | Fuertes y presentes = 25, presentes = 15, debiles = 7, ausentes = 0 |
| Formularios optimizados     | 15     | Optimizados = 15, adecuados = 10, a mejorar = 5, rotos = 0          |
| Gestion de objeciones (FAQ) | 15     | Completa = 15, parcial = 10, minima = 5, ausente = 0                |
| Velocidad de pagina         | 15     | <2s = 15, <3s = 10, <5s = 5, >5s = 0                                |
| Mobile responsiveness       | 10     | Total = 10, parcial = 6, debil = 3, no = 0                          |

#### Categoria 3: SEO y Descubrimiento (15%)

Title tags, meta descriptions, headers, schema, internal linking, page speed.

| Factor                         | Puntos | Criterio                                                      |
| ------------------------------ | ------ | ------------------------------------------------------------- |
| Titles y meta descriptions     | 20     | Optimizadas = 20, presentes = 13, parciales = 7, ausentes = 0 |
| Jerarquia H1-H6                | 15     | Correcta = 15, mayoritaria = 10, a mejorar = 5, ausente = 0   |
| Calidad de contenido (E-E-A-T) | 25     | Excelente = 25, bueno = 17, medio = 10, pobre = 3             |
| SEO tecnico                    | 20     | Sin issues = 20, menores = 13, mayores = 7, criticos = 0      |
| Linking interno                | 10     | Estrategico = 10, presente = 7, minimo = 3, inexistente = 0   |
| Schema markup                  | 10     | Completo = 10, basico = 7, minimo = 3, ausente = 0            |

#### Categoria 4: Posicionamiento Competitivo (15%)

Diferenciacion, claridad de pricing, contenido comparativo, conciencia de mercado.

| Factor                   | Puntos | Criterio                                                            |
| ------------------------ | ------ | ------------------------------------------------------------------- |
| Diferenciacion clara     | 25     | Obvia = 25, presente = 17, debil = 10, ausente = 3                  |
| Transparencia de pricing | 20     | Clara = 20, parcial = 13, opaca = 7, sin pricing = 0                |
| Contenido comparativo    | 20     | Comparativas propias = 20, menciones = 13, escasas = 7, ninguna = 0 |
| Respuesta a alternativas | 15     | Aborda objeciones = 15, parcial = 10, nunca = 5                     |
| Conciencia de mercado    | 20     | Alta = 20, media = 13, baja = 7, nula = 0                           |

#### Categoria 5: Marca y Confianza (10%)

Calidad de diseno, trust badges, indicadores de seguridad, aspecto profesional.

| Factor                   | Puntos | Criterio                                                          |
| ------------------------ | ------ | ----------------------------------------------------------------- |
| Calidad de diseno        | 25     | Moderno y profesional = 25, adecuado = 15, desfasado = 7          |
| Trust badges y seguridad | 25     | Presentes y variados = 25, algunos = 15, minimos = 7, ninguno = 0 |
| Transparencia de empresa | 20     | Pagina About completa = 20, parcial = 13, ausente = 0             |
| Testimonios con prueba   | 20     | Nombres, fotos y resultados = 20, nombres solo = 13, ausentes = 0 |
| Consistencia visual      | 10     | Total = 10, parcial = 6, inconsistente = 3                        |

#### Categoria 6: Crecimiento y Estrategia (10%)

Captura de leads, email marketing, estrategia de contenido, canales de adquisicion.

| Factor                            | Puntos | Criterio                                                           |
| --------------------------------- | ------ | ------------------------------------------------------------------ |
| Mecanismo de captura de leads     | 25     | Multiples opt-ins = 25, uno = 15, no visible = 5                   |
| Secuencias de email automatizadas | 25     | Completas = 25, basicas = 15, minimas = 7, ninguna = 0             |
| Diversidad de canales             | 20     | Multicanal activo = 20, 2-3 canales = 13, 1 canal = 7, ninguno = 0 |
| Estrategia de contenido visible   | 15     | Clara = 15, parcial = 10, ausente = 3                              |
| Tracking y atribucion             | 15     | Completos = 15, basicos = 10, minimos = 5, ausentes = 0            |

#### Calculo del score global

```
Score global = (Contenido x 0,25) + (Conversion x 0,25) + (SEO x 0,15) + (Competitivo x 0,15) + (Marca x 0,10) + (Crecimiento x 0,10)
```

**Interpretacion del score:**
| Rango | Calificacion | Significado |
| ------- | ------------ | ------------------------------------------------------------------- |
| 85-100 | Excelente | El marketing es ventaja competitiva. Optimizar y escalar. |
| 70-84 | Bueno | Base solida con oportunidades claras de mejora. |
| 55-69 | Medio | Funcional pero dejando crecimiento importante sobre la mesa. |
| 40-54 | Bajo | Varias areas sin atender. Coste de oportunidad relevante. |
| 0-39 | Critico | El marketing esta perjudicando el crecimiento. Accion inmediata. |

### Paso 3: Deep-dive por categoria

Para cada una de las 6 categorias aporta:

1. **Score y calificacion** — X/100 con interpretacion
2. **Hallazgos clave** — 3-5 observaciones concretas con evidencia
3. **Que funciona** — elementos positivos a preservar y construir
4. **Gaps e issues** — problemas detectados con severidad
5. **Recomendaciones** — mejoras concretas ordenadas por impacto
6. **Estimacion de impacto en ingresos** — impacto financiero aproximado de implementar

**Framework de estimacion de impacto en ingresos:**

```
Impacto = (Cambio estimado de trafico x Cambio de CR x Ticket medio) x Factor de confianza

Ejemplo:
- Trafico mensual actual: 10.000
- Mejoras SEO pueden subir trafico 30%: +3.000 visitas
- CR actual 2%, CRO puede llevarla a 3%: +1% = +130 conversiones
- Ticket medio: 500 EUR
- Impacto estimado mensual: 65.000 EUR
- Factor de confianza (conservador): 0,5
- Estimacion conservadora: 32.500 EUR/mes adicionales
```

### Paso 4: Resumen competitivo

Si hay data de `/marketing competidores`, incluye:

**Matriz de posicionamiento competitivo:**
| Factor | Cliente | Competidor 1 | Competidor 2 | Competidor 3 |
| ----------------------- | ------- | ------------ | ------------ | ------------ |
| Calidad de web | X/10 | X/10 | X/10 | X/10 |
| Visibilidad SEO | X/10 | X/10 | X/10 | X/10 |
| Calidad de contenido | X/10 | X/10 | X/10 | X/10 |
| Presencia en redes | X/10 | X/10 | X/10 | X/10 |
| Posicion global | Xa/4 | Xa/4 | Xa/4 | Xa/4 |

**Ventajas competitivas:** lo que el cliente hace mejor
**Gaps competitivos:** donde los competidores le superan
**Oportunidades:** espacios que los competidores no estan tocando

### Paso 5: Evaluacion de calidad de contenido

Resume hallazgos de contenido por canal:

- **Copy de la web** — claridad, persuasion, alineamiento de marca
- **Blog** — profundidad, expertise, optimizacion SEO, cadencia
- **Redes sociales** — engagement, consistencia de marca, optimizacion por plataforma
- **Email** — eficacia de asuntos, body copy, fuerza del CTA
- **Creatividades de ads** — claridad del mensaje, calidad visual, presentacion de oferta

### Paso 6: Resumen de optimizacion de conversion

Compila todos los hallazgos de conversion:

- **Rutas de conversion principales** — como los visitantes se convierten en clientes
- **Fugas del funnel** — donde caen los leads
- **Quick wins de CRO** — cambios inmediatos
- **Oportunidades de test** — A/B tests con hipotesis
- **Comparativa con benchmark** — tus rates vs estandar del sector

### Paso 7: SEO snapshot

Resumen escaneable del estado SEO:

```
SEO Health Snapshot:
- Title tags: [Optimizadas / A mejorar / Ausentes]
- Meta descriptions: [Optimizadas / A mejorar / Ausentes]
- H1 tags: [Correctas / Con issues / Ausentes]
- Alt text de imagenes: [Completo / Parcial / Ausente]
- Page speed: [Rapida / Moderada / Lenta]
- Mobile-friendly: [Si / Parcial / No]
- Schema markup: [Presente / Parcial / Ausente]
- Robots.txt: [Configurado / Con issues / Ausente]
- Sitemap: [Presente / Con issues / Ausente]
- HTTPS: [Si / No]
- Core Web Vitals: [Pass / A mejorar / Fail]
```

### Paso 8: Plan de accion priorizado

Organiza las recomendaciones en 3 niveles:

#### Quick Wins (esta semana)

Alto impacto, bajo esfuerzo. Implementables en 1-5 dias laborables.

Formatea cada item como:

```
- [ ] [Accion]: [descripcion concreta]
  - Impacto: [ALTO/MEDIO/BAJO]
  - Esfuerzo: [1-5 horas]
  - Resultado esperado: [outcome concreto]
  - Impacto en ingresos: [X EUR/mes estimado]
```

#### Medio plazo (este mes)

Impacto moderado, esfuerzo moderado. 1-4 semanas.

#### Estrategicas (este trimestre)

Alto impacto, alto esfuerzo. Cambios de fundacion que requieren planificacion.

### Paso 9: Roadmap 30-60-90 dias

**Dias 1-30: Fundacion y Quick Wins**

- Semana 1: ejecutar todos los quick wins
- Semana 2: setup de tracking y baseline de analytics
- Semana 3: empezar mejoras de medio plazo
- Semana 4: primera revision y ajuste

**Dias 31-60: Crecimiento y Optimizacion**

- Semana 5-6: lanzar mejoras core de campanas
- Semana 7: arranca programa de A/B testing
- Semana 8: implementacion de estrategia de contenido

**Dias 61-90: Escala y Expansion**

- Semana 9-10: amplificar lo que funciona, cortar lo que no
- Semana 11: expandir a nuevos canales o campanas
- Semana 12: revision integral, actualizar estrategia del siguiente trimestre

### Paso 10: Apendice

Incluye notas de metodologia para que el cliente entienda como se derivaron los scores:

**Metodologia de scoring:**

- Como se evaluo cada categoria
- Fuentes de datos usadas
- Benchmarks referenciados
- Limitaciones y asunciones
- Fecha del analisis

**Herramientas usadas:**

- Herramientas o scripts aplicados
- Referencia a `scripts/analizar_pagina.py` si se uso

**Glosario:**

- Define terminos de marketing que un no-marketer pueda no conocer
- Relevantes a los terminos usados en el informe

## Formato de salida

Genera un archivo `INFORME-MARKETING.md` con esta estructura:

```markdown
# Informe de Marketing

## [Empresa / Dominio]

### Preparado por: [Agente / Agencia]

### Fecha: [Fecha]

---

## Resumen Ejecutivo

### Score global: [X/100] — [Calificacion]

[2-3 parrafos: estado actual, top 3 hallazgos, impacto estimado de las recomendaciones, primeros pasos sugeridos]

### Desglose por categoria

| Categoria                   | Score     | Calificacion |
| --------------------------- | --------- | ------------ |
| Contenido y Mensaje         | X/100     | [Calif.]     |
| Optimizacion de Conversion  | X/100     | [Calif.]     |
| SEO y Descubrimiento        | X/100     | [Calif.]     |
| Posicionamiento Competitivo | X/100     | [Calif.]     |
| Marca y Confianza           | X/100     | [Calif.]     |
| Crecimiento y Estrategia    | X/100     | [Calif.]     |
| **Global**                  | **X/100** | **[Calif.]** |

### Top 3 acciones prioritarias

1. [Recomendacion de mayor impacto con estimacion de ingresos]
2. [Segunda]
3. [Tercera]

---

## Hallazgos detallados

### 1. Contenido y Mensaje [X/100]

[Deep-dive con hallazgos, que funciona, gaps, recomendaciones]

### 2. Optimizacion de Conversion [X/100]

[Deep-dive]

### 3. SEO y Descubrimiento [X/100]

[Deep-dive]

### 4. Posicionamiento Competitivo [X/100]

[Deep-dive]

### 5. Marca y Confianza [X/100]

[Deep-dive]

### 6. Crecimiento y Estrategia [X/100]

[Deep-dive]

---

## Comparativa competitiva

[Matriz y analisis]

---

## SEO Snapshot

[Checklist]

---

## Resumen de optimizacion de conversion

[Analisis de funnel y recomendaciones CRO]

---

## Resumen de impacto en ingresos

| Recomendacion | Impacto mensual estimado | Confianza       | Prioridad |
| ------------- | ------------------------ | --------------- | --------- |
| [Rec 1]       | X.XXX EUR                | Alta/Media/Baja | 1         |
| [Rec 2]       | X.XXX EUR                | Alta/Media/Baja | 2         |
| ...           | ...                      | ...             | ...       |
| **Total**     | **XX.XXX EUR/mes**       |                 |           |

---

## Plan de accion priorizado

### Quick Wins (esta semana)

- [ ] [acciones con impacto y esfuerzo]

### Medio plazo (este mes)

- [ ] [acciones]

### Estrategicas (este trimestre)

- [ ] [acciones]

---

## Roadmap 30-60-90 dias

[Plan semana a semana]

---

## Apendice

### Metodologia

### Herramientas usadas

### Glosario

### Fuentes de datos
```

## Principios clave

- Este informe debe ser suficientemente bueno como para usarse como herramienta de venta. Un buen informe abre la puerta al engagement.
- Lidera siempre con insights y oportunidades, no con critica. Enmarca todo desde el crecimiento.
- Cuantifica todo lo posible. "32.000 EUR/mes en ingresos no capturados" es mas potente que "estas dejando dinero sobre la mesa".
- Haz el plan de accion tan concreto que alguien pudiera darselo a un marketer junior y este ejecutarlo.
- Formato profesional: headers consistentes, tablas para datos, checkboxes para acciones, jerarquia visual clara.
- Si hay data de skills previas, cita hallazgos concretos. Si no, se transparente sobre que es analisis y que es estimacion.
- El informe cuenta una historia: donde estas, donde podrias estar, como llegar y cuanto vale.
