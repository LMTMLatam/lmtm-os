---
name: marketing-marca
displayName: Estrategia de marca
description: Construcción de marca: posicionamiento, voz, arquetipos, mensajes clave y consistencia visual. Usala para briefs de marca o revisión de identidad.
required: false
---

# Analisis de Voz de Marca y Generacion de Guidelines

## Proposito de la skill

Analizar la voz, tono y mensaje de una marca en todos los canales disponibles y generar una guia completa de voz de marca. Examina como comunica la marca, detecta patrones e inconsistencias y produce guidelines accionables para que cualquier redactor o marketer mantenga la consistencia.

## Cuando usarla

- El usuario quiere entender o documentar la voz de una marca
- El usuario necesita guidelines de voz para un equipo, freelancers o agencia
- El usuario quiere asegurar consistencia entre canales
- El usuario esta rebrandeando o refinando su identidad
- El usuario quiere comparar su voz con competidores
- Se activa con `/marketing marca <url>` o `/marketing marca`

## Como ejecutarla

### Paso 1: Recoger material fuente

Para analizar la voz, examina contenido de multiples fuentes. Prioriza en este orden:

**Fuentes primarias (obligatorias):**

1. **Home** — la representacion mas curada de la marca
2. **About** — como se describe a si misma
3. **Paginas de producto/servicio** — como presentan la oferta

**Fuentes secundarias (si estan disponibles):** 4. **Blog posts** (al menos 3-5 recientes) 5. **Perfiles en redes** (bio, posts recientes, estilo de engagement) 6. **Newsletters** (welcome email, envios recientes) 7. **Copy de cliente** (mensajes de error, flujos de onboarding, help docs)

**Fuentes terciarias:** 8. **Ofertas de empleo** — revelan cultura y valores 9. **Notas de prensa** — estilo formal 10. **Ad copy** — enfoque en mensajes de pago 11. **Scripts de video o transcripciones de podcast** — voz hablada

Usa herramientas de navegador o `scripts/analizar_pagina.py` para el contenido web. Para redes, revisa enlaces sociales de la web y analiza los perfiles.

### Paso 2: Analisis por dimensiones de voz

Mapea la voz en cuatro dimensiones principales. Cada una es un espectro, no un binario.

#### Dimension 1: Formal <-----> Casual

| Senal                  | Formal                                | Casual                             |
| ---------------------- | ------------------------------------- | ---------------------------------- |
| Contracciones          | Las evita                             | Las usa con libertad               |
| Estructura de frases   | Complejas, largas                     | Cortas, directas                   |
| Vocabulario            | Profesional, estandar del sector      | Conversacional                     |
| Saludos                | "Estimado cliente"                    | "Hola!"                            |
| Pronombres             | Tercera persona ("la empresa", "uno") | Primera/segunda ("nosotros", "tu") |
| Humor                  | Raro o ausente                        | Frecuente, natural                 |
| Jerga o coloquialismos | Nunca                                 | A veces o con frecuencia           |

**Score: 1 (extremadamente formal) a 10 (extremadamente casual)**

**Evidencia obligatoria:** cita 3-5 ejemplos concretos que respalden tu rating.

#### Dimension 2: Serio <-----> Divertido

| Senal                 | Serio                  | Divertido              |
| --------------------- | ---------------------- | ---------------------- |
| Tono                  | Autoritario, mesurado  | Ligero, alegre         |
| Metaforas             | Raras, conservadoras   | Creativas, inesperadas |
| Signos de exclamacion | Raros                  | Frecuentes             |
| Emojis                | Nunca                  | A veces o a menudo     |
| Juegos de palabras    | Nunca                  | Le gustan              |
| Mensajes de error     | "Ha ocurrido un error" | "Uy! Algo salio raro"  |
| Autocritica           | Nunca                  | Ocasionalmente         |

**Score: 1 (extremadamente serio) a 10 (extremadamente divertido)**

#### Dimension 3: Tecnico <-----> Simple

| Senal                    | Tecnico                            | Simple                      |
| ------------------------ | ---------------------------------- | --------------------------- |
| Jerga                    | Usa terminos del sector sin filtro | Evita o explica todos       |
| Siglas                   | Sin definir                        | Desarrolladas en primer uso |
| Nivel de detalle         | Explicaciones profundas            | Resumenes de alto nivel     |
| Asuncion sobre audiencia | Experta                            | General                     |
| Datos/estadisticas       | Frecuentes, detalladas             | Ocasionales, simplificadas  |
| Ejemplos                 | Complejos, especificos del sector  | Simples, analogias cercanas |

**Score: 1 (extremadamente tecnico) a 10 (extremadamente simple)**

#### Dimension 4: Reservado <-----> Rompedor

| Senal                      | Reservado                                 | Rompedor                              |
| -------------------------- | ----------------------------------------- | ------------------------------------- |
| Claims                     | Matizados ("creemos que", "puede ayudar") | Directos ("garantizamos", "el mejor") |
| Opiniones                  | Neutras, equilibradas                     | Fuertes, con postura                  |
| Referencias a competidores | Las evita                                 | Compara directamente                  |
| Personalidad               | Profesional, discreta                     | Diferente, memorable                  |
| Promesas                   | Conservadoras                             | Ambiciosas                            |
| Controversia               | La evita                                  | La abraza cuando encaja con valores   |

**Score: 1 (extremadamente reservado) a 10 (extremadamente rompedor)**

### Paso 3: Mapeo del espectro de tono

Mas alla de las 4 dimensiones, mapea como cambia el tono en contextos:

| Contexto                | Tono tipico                                | Ejemplo        |
| ----------------------- | ------------------------------------------ | -------------- |
| Home                    | [Seguro/Acogedor/Urgente/etc]              | "[quote home]" |
| Descripcion de producto | [Informativo/Persuasivo/Tecnico/etc]       | "[quote]"      |
| Blog post               | [Educativo/Conversacional/Autoritario/etc] | "[quote]"      |
| Redes sociales          | [Casual/Engaging/Promocional/etc]          | "[quote]"      |
| Error / 404             | [Disculpa/Humor/Servicial/etc]             | "[quote]"      |
| Asuntos de email        | [Directo/Intrigante/Urgente/etc]           | "[quote]"      |
| Botones de CTA          | [Accion/Beneficio/Urgencia/etc]            | "[quote]"      |
| Soporte a cliente       | [Empatico/Profesional/Cercano/etc]         | "[quote]"      |

### Paso 4: Framework de personalidad de marca

Mapea la marca a uno de 5 arquetipos (pueden mezclar 1-2):

#### Los 5 arquetipos

**1. La Autoridad**

- Rasgos: experta, confiable, basada en datos, establecida
- Voz: segura sin ser arrogante, educativa, precisa
- Sectores: finanzas, salud, B2B enterprise, legal, consultoria
- Ejemplos: McKinsey, IBM, Mayo Clinic
- Frases clave: "Los datos muestran...", "Nuestros expertos...", "Lider del sector..."

**2. La Innovadora**

- Rasgos: pionera, disruptiva, visionaria, tech-savvy
- Voz: emocionante, enfocada al futuro, a veces provocadora
- Sectores: tech, SaaS, startups, energia renovable
- Ejemplos: Tesla, Stripe, Notion
- Frases clave: "Reimagina...", "El futuro de...", "Estamos construyendo..."

**3. La Amiga**

- Rasgos: cercana, accesible, servicial, identificable
- Voz: conversacional, empatica, inclusiva, animosa
- Sectores: productos de consumo, educacion, plataformas comunitarias
- Ejemplos: Mailchimp, Slack, Duolingo
- Frases clave: "Te entendemos...", "Tu puedes...", "Estamos aqui para ayudarte..."

**4. La Rebelde**

- Rasgos: atrevida, cuestionadora, irreverente, apasionada
- Voz: directa, con opinion, a veces confrontativa, memorable
- Sectores: lifestyle, fitness, creativo, DTC
- Ejemplos: Nike, Oatly, Cards Against Humanity
- Frases clave: "Deja de conformarte con...", "La verdad es...", "Ya no aceptamos..."

**5. La Guia**

- Rasgos: sabia, paciente, metodica, fiable
- Voz: clara, instructiva, apoyadora, conocedora
- Sectores: educacion, desarrollo profesional, herramientas, plataformas
- Ejemplos: HubSpot, Khan Academy, Ahrefs
- Frases clave: "Aqui te contamos como...", "Paso a paso...", "La guia completa de..."

**Evaluacion:**

- Arquetipo primario: [cual y por que]
- Arquetipo secundario: [si aplica]
- Encaje con el arquetipo: [Fuerte/Moderado/Debil]

### Paso 5: Analisis de vocabulario

Detecta patrones en las palabras elegidas:

#### Palabras frecuentes

Analiza todo el material y detecta 15-20 palabras o frases caracteristicas. Organiza por categoria:

**Verbos (acciones que prefiere):**

- ej. "construir", "escalar", "transformar", "simplificar"

**Adjetivos (que usa):**

- ej. "potente", "simple", "enterprise", "sin esfuerzo"

**Palabras-valor (reflejan sus valores):**

- ej. "transparente", "sostenible", "inclusivo", "innovador"

**Terminos del sector:**

- ej. "workflow", "pipeline", "conversion", "engagement"

#### Palabras que evita

Detecta palabras notablemente ausentes o que le quedarian mal:

- Palabras demasiado casuales (si es formal)
- Palabras demasiado tecnicas (si es simple)
- Terminologia del competidor que evita
- Cliches del sector que esquiva

#### Frases firma

La marca tiene frases recurrentes, taglines o patrones?

- Tagline: [si existe]
- Frases recurrentes: [patrones que detectas]
- Patrones linguisticos: [ej. empieza frases con verbos, usa guiones, parrafos cortos]

### Paso 6: Comparativa de voz con competidores

Compara con 2-3 competidores clave:

**Matriz comparativa de voz:**
| Dimension | [Marca] | Competidor 1 | Competidor 2 | Competidor 3 |
| ---------------------------- | ------- | ------------ | ------------ | ------------ |
| Formal <> Casual | X/10 | X/10 | X/10 | X/10 |
| Serio <> Divertido | X/10 | X/10 | X/10 | X/10 |
| Tecnico <> Simple | X/10 | X/10 | X/10 | X/10 |
| Reservado <> Rompedor | X/10 | X/10 | X/10 | X/10 |
| Arquetipo primario | [tipo] | [tipo] | [tipo] | [tipo] |

**Evaluacion de diferenciacion:**

- Como de distinta es la voz frente a competidores?
- Donde hay solapamiento? (oportunidad de diferenciar)
- Que territorio vocal esta vacio en el panorama competitivo?
- Recomendaciones concretas de diferenciacion vocal

### Paso 7: Auditoria de consistencia

Evalua la consistencia de voz entre canales analizados:

| Canal            | Consistencia                          | Notas           |
| ---------------- | ------------------------------------- | --------------- |
| Home             | Consistente/Mayoritaria/Inconsistente | [observaciones] |
| About            | Consistente/Mayoritaria/Inconsistente | [notas]         |
| Blog             | Consistente/Mayoritaria/Inconsistente | [notas]         |
| Redes            | Consistente/Mayoritaria/Inconsistente | [notas]         |
| Email            | Consistente/Mayoritaria/Inconsistente | [notas]         |
| Paginas producto | Consistente/Mayoritaria/Inconsistente | [notas]         |

**Problemas comunes de consistencia:**

- Redactores distintos con tonos claramente distintos
- Voz en redes drasticamente distinta a la web
- Web formal pero newsletters casuales
- Blog con voz totalmente diferente a las paginas de producto
- Mensajes de error o microcopy que chirrian
- Paginas antiguas sin actualizar al estilo actual

**Score global de consistencia:** X/10

### Paso 8: Jerarquia de mensaje de marca

Documenta el mensaje de mas comprimido a mas expandido:

#### Nivel 1: Tagline (menos de 10 palabras)

La forma mas comprimida del mensaje.

- Actual: "[tagline existente o propuesta]"
- Evaluacion: captura el value proposition core?

#### Nivel 2: Value propositions (1 frase cada una)

3-5 value propositions core que apoyan la promesa.

1. "[Value prop 1]"
2. "[Value prop 2]"
3. "[Value prop 3]"

#### Nivel 3: Elevator pitch (30 segundos / 75 palabras)

Explicacion conversacional de que hace la marca y por que importa.
"[Borrador de elevator pitch]"

#### Nivel 4: Boilerplate (100-150 palabras)

El parrafo estandar "sobre nosotros" para notas de prensa, firmas de email y bios.
"[Borrador de boilerplate]"

#### Nivel 5: Brand story completa (300-500 palabras)

La narrativa completa de quien es, que defiende y por que existe.

- Estado actual: [Existe/Parcial/Ausente]
- Recomendaciones de mejora

### Paso 9: Generar documentacion de voz

Crea la guia de Do's y Don'ts:

#### Voice chart

```
NUESTRA VOZ ES:                  NUESTRA VOZ NO ES:
--------------------------------------------------
[Rasgo 1]                        [Anti-rasgo 1]
ej. "Segura"                     ej. "Arrogante"

[Rasgo 2]                        [Anti-rasgo 2]
ej. "Servicial"                  ej. "Condescendiente"

[Rasgo 3]                        [Anti-rasgo 3]
ej. "Clara"                      ej. "Simplona"

[Rasgo 4]                        [Anti-rasgo 4]
ej. "Rompedora"                  ej. "Agresiva"
```

#### Do's y Don'ts de escritura

**DO:**

- [Instruccion concreta segun el analisis]
- [ej. "Usa contracciones para sonar natural (estas, vais, esta)"]
- [ej. "Lidera con el beneficio, no con la feature"]
- [ej. "Usa voz activa en headlines y CTAs"]
- [ej. "Dirigete al lector con 'tu' y 'tuyo'"]

**DON'T:**

- [Antipatron concreto segun el analisis]
- [ej. "No uses jerga sin explicarla"]
- [ej. "No uses voz pasiva en CTAs"]
- [ej. "No mas de un signo de exclamacion por parrafo"]
- [ej. "No empieces frases con 'Nosotros' — centra en el cliente"]

### Paso 10: Ejemplos de copy en la voz identificada

Facilita 5-8 piezas de copy ejemplo en la voz para que el equipo tenga referencias concretas:

**1. Headline de home:**
"[Sample en la voz]"

**2. Parrafo de descripcion de producto:**
"[Sample]"

**3. Apertura de blog post:**
"[Sample]"

**4. Post en redes:**
"[Sample]"

**5. Asunto de email:**
"[Sample]"

**6. Texto de CTA:**
"[Sample]"

**7. Mensaje de error:**
"[Sample]"

**8. Mensaje de agradecimiento a cliente:**
"[Sample]"

## Formato de salida

Genera un archivo `VOZ-MARCA.md` con esta estructura:

```markdown
# Guia de Voz de Marca

## [Marca]

### Fecha de analisis: [Fecha]

---

## Resumen de voz

[2-3 frases sobre voz, personalidad y rasgos clave]

---

## Dimensiones de voz

### Formal <-----> Casual: [X/10]

[Evidencia y explicacion]

### Serio <-----> Divertido: [X/10]

[Evidencia y explicacion]

### Tecnico <-----> Simple: [X/10]

[Evidencia y explicacion]

### Reservado <-----> Rompedor: [X/10]

[Evidencia y explicacion]

### Mapa visual de voz
```

Formal Casual
|----[X]----------------------------------|
Serio Divertido
|--------[X]------------------------------|
Tecnico Simple
|------------------[X]--------------------|
Reservado Rompedor
|------------[X]--------------------------|

```

---

## Personalidad de marca
- Arquetipo primario: [arquetipo]
- Arquetipo secundario: [arquetipo]
- [Explicacion y evidencia]

---

## Tono por contexto
| Contexto | Tono | Ejemplo   |
| -------- | ---- | --------- |
| [ctx]    | [tono] | "[quote]" |

---

## Vocabulario

### Palabras que usamos
[Listas organizadas]

### Palabras que evitamos
[Palabras que no encajan]

### Frases firma
[Patrones y frases recurrentes]

---

## Voice chart
| Nuestra voz ES | Nuestra voz NO ES |
| -------------- | ----------------- |
| [rasgo]        | [anti-rasgo]      |

---

## Do's y Don'ts

### Do's
- [guidelines]

### Don'ts
- [antipatrones]

---

## Jerarquia de mensaje de marca

### Tagline
[tagline]

### Value propositions
1. [vp]

### Elevator pitch
[pitch]

### Boilerplate
[boilerplate]

---

## Ejemplos de copy
[8 samples en la voz]

---

## Comparativa de voz con competidores
[Matriz y analisis de diferenciacion]

---

## Auditoria de consistencia
[Evaluacion canal a canal]
- Score global de consistencia: [X/10]

---

## Recomendaciones

### Acciones inmediatas
1. [recomendacion]

### Oportunidades de evolucion de voz
1. [recomendacion]

### Mejoras de consistencia
1. [recomendacion]
```

## Principios clave

- Analizar voz de marca es trabajo de detective. Cada eleccion de palabra, decision de puntuacion y estructura revela algo sobre como quiere ser percibida la marca.
- Aporta EVIDENCIA en cada evaluacion. No digas "la marca es casual" — cita ejemplos que lo prueben.
- La guia debe servir a alguien que nunca ha trabajado con la marca. Un redactor nuevo deberia poder leer el documento y escribir on-brand.
- Los ejemplos de copy son la parte mas valiosa del entregable. Se aprende la voz por ejemplo, no por descripcion. Haz los samples diversos (headlines, body, social, email, errores) para cubrir cada contexto.
- Voz y tono son cosas distintas. La voz es la personalidad consistente. El tono varia segun contexto (responder a una queja es distinto a anunciar un lanzamiento, pero ambos viven bajo la misma voz).
- Si hay inconsistencia entre canales, enmarcala como oportunidad de reforzar la marca, no como fracaso. Es comun y tiene arreglo.
- Si el usuario ejecuto antes `/marketing competidores`, usa esa data para la comparativa de voz.
- Las dimensiones de voz deben representarse visualmente (espectro en texto) para que cualquier stakeholder capte el posicionamiento de un vistazo.
