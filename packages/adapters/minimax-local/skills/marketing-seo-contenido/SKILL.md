---
name: marketing-seo-contenido
displayName: SEO de contenidos
description: Estrategia de contenido SEO: keywords, clusters, briefs de artículos y optimización on-page. Usala para planificar o escribir contenido orgánico de búsqueda.
required: false
---

# Auditoria SEO de Contenido

## Proposito de la skill

Auditar SEO de una pagina o web a fondo, cubriendo SEO on-page, calidad de contenido (E-E-A-T), analisis de keywords, SEO tecnico y estrategia de contenido. Combina analisis automatico via `scripts/analizar_pagina.py` con revision experta manual para producir una auditoria SEO accionable.

## Cuando usarla

- El usuario facilita una URL y pide analisis SEO, auditoria o recomendaciones
- El usuario quiere mejorar rankings y trafico organico
- El usuario pregunta por SEO on-page, meta tags, calidad de contenido o SEO tecnico
- El usuario quiere analisis de gaps de contenido o recomendaciones de estrategia
- Se activa con `/marketing seo <url>` o `/marketing seo`

## Como ejecutarla

### Paso 1: Ejecutar el analisis automatico

Usa el script Python para obtener la data base:

```bash
python3 scripts/analizar_pagina.py <url>
```

Extrae:

- Title tag y meta description
- Open Graph tags
- Jerarquia de headings (H1-H6)
- Enlaces (internos y externos)
- Imagenes y estado de alt text
- Formularios y CTAs
- Schema / structured data
- Social links
- Scripts de tracking
- Viewport meta (indicador mobile-friendly)
- Canonical tag
- Directivas de robots meta

Captura el JSON y usalo como base del analisis manual.

### Paso 2: Checklist SEO on-page

Evalua cada elemento como Pass, A mejorar o Fail.

#### Title Tag

| Criterio             | Best practice                                                             | Resultado          |
| -------------------- | ------------------------------------------------------------------------- | ------------------ |
| Existe               | Cada pagina debe tener title unico                                        | Pass/Fail          |
| Longitud             | 50-60 caracteres (no se corta en SERPs)                                   | Pass/Amejorar/Fail |
| Keyword principal    | Incluye la keyword target                                                 | Pass/Amejorar/Fail |
| Posicion del keyword | Al principio del title                                                    | Pass/Amejorar/Fail |
| Marca                | Incluye nombre de marca (normalmente al final, separado por pipe o guion) | Pass/Amejorar/Fail |
| Unico                | Distinto al de otras paginas                                              | Pass/Fail          |
| Atractivo            | Querria el usuario hacer click?                                           | Pass/Amejorar/Fail |

**Errores habituales en title:**

- Demasiado largo (truncado en SERP)
- Sin keyword principal
- Keyword stuffing ("Mejor SEO | Top SEO | Software SEO | Plataforma SEO")
- Mismo title en varias paginas
- Titles genericos ("Inicio", "Bienvenido", "Pagina 1")
- Sin marca

#### Meta Description

| Criterio          | Best practice                           | Resultado          |
| ----------------- | --------------------------------------- | ------------------ |
| Existe            | Cada pagina debe tener meta description | Pass/Fail          |
| Longitud          | 150-160 caracteres                      | Pass/Amejorar/Fail |
| Keyword principal | Incluida de forma natural               | Pass/Amejorar/Fail |
| Call to action    | Da razon para clicar                    | Pass/Amejorar/Fail |
| Unica             | Distinta a la de otras paginas          | Pass/Fail          |
| Compelling        | Funciona como ad copy del resultado     | Pass/Amejorar/Fail |

#### Jerarquia de headings (H1-H6)

| Criterio                | Best practice                           | Resultado          |
| ----------------------- | --------------------------------------- | ------------------ |
| H1 existe               | Exactamente un H1 por pagina            | Pass/Fail          |
| H1 con keyword          | Keyword principal en el H1              | Pass/Amejorar/Fail |
| H1 difiere del title    | Relacionados pero distintos             | Pass/Amejorar/Fail |
| Jerarquia logica        | H2 bajo H1, H3 bajo H2 (sin saltos)     | Pass/Amejorar/Fail |
| Subtitulos descriptivos | H2s y H3s describen bien las secciones  | Pass/Amejorar/Fail |
| Keywords en subtitulos  | Secundarias aparecen de forma natural   | Pass/Amejorar/Fail |
| Uso adecuado            | Headers para estructura, no para estilo | Pass/Amejorar/Fail |

#### Optimizacion de imagenes

| Criterio             | Best practice                                              | Resultado          |
| -------------------- | ---------------------------------------------------------- | ------------------ |
| Alt text             | Cada imagen con alt descriptivo                            | Pass/Amejorar/Fail |
| Calidad del alt text | Alt describe la imagen e incluye keywords de forma natural | Pass/Amejorar/Fail |
| Nombres de archivo   | Descriptivos (no IMG_001.jpg)                              | Pass/Amejorar/Fail |
| Tamano de archivo    | Optimizadas para web (preferible WebP, comprimidas)        | Pass/Amejorar/Fail |
| Lazy loading         | Imagenes below-fold con lazy loading                       | Pass/Amejorar/Fail |
| Imagenes responsive  | Usa srcset o picture para tamanos distintos                | Pass/Amejorar/Fail |
| Decorativas          | alt="" vacio en decorativas (no alt ausente)               | Pass/Amejorar/Fail |

#### Linking interno

| Criterio                   | Best practice                             | Resultado          |
| -------------------------- | ----------------------------------------- | ------------------ |
| Enlaces internos presentes | La pagina enlaza a otras relevantes       | Pass/Amejorar/Fail |
| Anchor text                | Descriptivo (no "click aqui")             | Pass/Amejorar/Fail |
| Deep linking               | Enlazan a paginas concretas, no solo home | Pass/Amejorar/Fail |
| Contexto relevante         | Enlaces contextualmente relevantes        | Pass/Amejorar/Fail |
| Cantidad razonable         | 3-10 enlaces internos por 1.000 palabras  | Pass/Amejorar/Fail |
| Sin rotos                  | Sin 404s internos                         | Pass/Fail          |

#### Estructura de URL

| Criterio        | Best practice                                   | Resultado          |
| --------------- | ----------------------------------------------- | ------------------ |
| Legible         | URL humana y descriptiva                        | Pass/Amejorar/Fail |
| Keywords        | URL con keywords relevantes                     | Pass/Amejorar/Fail |
| Longitud        | Menos de 75 caracteres (ideal <60)              | Pass/Amejorar/Fail |
| Guiones         | Palabras separadas por guiones (no underscores) | Pass/Fail          |
| Minusculas      | Todo en minusculas                              | Pass/Fail          |
| Sin parametros  | URLs limpias sin parametros innecesarios        | Pass/Amejorar/Fail |
| Slashes finales | Uso consistente (siempre o nunca)               | Pass/Amejorar/Fail |

### Paso 3: Evaluacion de calidad del contenido (E-E-A-T)

Evalua el contenido contra el framework E-E-A-T de Google:

#### Experience (experiencia de primera mano)

El contenido demuestra experiencia real con el tema?

**Busca:**

- Anecdotas personales, casos reales, ejemplos propios
- Capturas, fotos o prueba de experiencia hands-on
- Detalles que solo alguien con experiencia conoce
- Contenido tipo "hice X y esto fue lo que paso"

**Score:** Fuerte / Presente / Debil / Ausente

#### Expertise (experiencia demostrada)

El autor tiene conocimiento demostrable?

**Busca:**

- Bio del autor con credenciales relevantes
- Profundidad de contenido (sin superficialidad)
- Informacion y datos precisos
- Terminologia del sector bien usada
- Enlaces a fuentes autorizadas

**Score:** Fuerte / Presente / Debil / Ausente

#### Authoritativeness (autoridad)

Se reconoce a la web/autor como autoridad en el tema?

**Busca:**

- Bylines con nombres reales y bio
- Pagina About con background de la empresa
- Premios o certificaciones del sector
- Backlinks de sitios de autoridad
- Menciones en medios
- Guest posts en publicaciones del sector

**Score:** Fuerte / Presente / Debil / Ausente

#### Trustworthiness (confianza)

Se puede confiar en el contenido y la web?

**Busca:**

- HTTPS
- Politica de privacidad y terminos
- Direccion fisica y contacto
- Resenas y testimonios
- Badges de seguridad y certificaciones
- Practicas empresariales transparentes
- Informacion precisa y actualizada
- Claims citados con fuentes correctas

**Score:** Fuerte / Presente / Debil / Ausente

### Paso 4: Analisis de keywords

#### Keyword principal

| Elemento                         | Evaluacion                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Keyword principal identificada   | Que keyword persigue esta pagina?                                                                        |
| Intent alineado                  | El contenido responde a lo que busca el usuario? (informacional, comercial, transaccional, navegacional) |
| Keyword en title                 | Presencia, posicion, uso natural                                                                         |
| Keyword en H1                    | Presencia, uso natural                                                                                   |
| Keyword en primeras 100 palabras | Aparece pronto en el contenido                                                                           |
| Keyword en subtitulos            | Al menos en un H2 o H3                                                                                   |
| Keyword en meta description      | Presente y natural                                                                                       |
| Keyword en URL                   | Presente                                                                                                 |
| Densidad                         | 1-2% ideal. Mas del 3% es stuffing.                                                                      |

#### Keywords secundarias

Identifica 5-10 relacionadas que deberian aparecer de forma natural:

- Sinonimos y variantes
- Long-tail
- Preguntas relacionadas (People Also Ask)
- LSI (indexado semantico latente)

#### Intent de busqueda

Determina el intent y valida que el contenido lo responde:

| Tipo          | Objetivo del usuario | Contenido apropiado                   |
| ------------- | -------------------- | ------------------------------------- |
| Informacional | Aprender algo        | Blog post, guia, tutorial, FAQ        |
| Comercial     | Comparar opciones    | Comparativa, resena, lista            |
| Transaccional | Comprar              | Pagina de producto, pricing, checkout |
| Navegacional  | Ir a una pagina      | Home, login, pagina concreta          |

**El misalignment es un ranking killer.** Si el usuario busca "como hacer X" (informacional) y aterriza en pagina de venta (transaccional), rebota — y Google lo ve.

### Paso 5: Check rapido de SEO tecnico

#### Robots.txt

```
Check: existe /robots.txt y esta bien configurado?
```

- [ ] robots.txt accesible
- [ ] No bloquea paginas o recursos importantes
- [ ] Apunta a sitemap.xml
- [ ] No bloquea CSS/JS (necesarios para render)

#### XML Sitemap

```
Check: existe /sitemap.xml?
```

- [ ] Sitemap accesible
- [ ] Contiene todas las paginas importantes
- [ ] Sin URLs rotas
- [ ] Enviado a Google Search Console
- [ ] Fechas de modificacion correctas

#### Canonical tags

- [ ] Canonical en la pagina
- [ ] Apunta a la URL correcta (self-referencing o canonica)
- [ ] Consistente con robots.txt y sitemap

#### Velocidad de pagina

Benchmarks:

| Metrica                        | Bueno  | A mejorar | Malo   |
| ------------------------------ | ------ | --------- | ------ |
| Largest Contentful Paint (LCP) | <2,5s  | 2,5-4,0s  | >4,0s  |
| First Input Delay (FID)        | <100ms | 100-300ms | >300ms |
| Cumulative Layout Shift (CLS)  | <0,1   | 0,1-0,25  | >0,25  |
| Time to First Byte (TTFB)      | <200ms | 200-500ms | >500ms |
| First Contentful Paint (FCP)   | <1,8s  | 1,8-3,0s  | >3,0s  |

**Problemas habituales de velocidad a marcar:**

- Imagenes sin optimizar (recomienda WebP, compresion)
- JS o CSS render-blocking
- Sin cache de navegador
- Sin CDN detectada
- Exceso de scripts de terceros (tracking, widgets, fuentes)
- CSS y JS sin minificar
- Sin compresion (gzip o brotli)

#### Mobile-friendliness

- [ ] Viewport meta presente (`<meta name="viewport" content="width=device-width, initial-scale=1">`)
- [ ] Texto legible sin zoom (16px minimo en body)
- [ ] Tap targets adecuados (minimo 48x48px)
- [ ] Sin scroll horizontal
- [ ] Imagenes responsive
- [ ] Formularios usables en movil

### Paso 6: Analisis de gaps de contenido

Metodologia:

1. **Identifica el cluster tematico:** cual es el tema principal?
2. **Mapea contenido existente:** que subtemas ya cubre?
3. **Detecta subtemas ausentes:** que cubren los competidores que tu no?
4. **Analiza People Also Ask:** que preguntas hace la gente?
5. **Revisa busquedas relacionadas:** que sugiere Google al pie del SERP?

**Plantilla de gaps:**
| Tema ausente | Volumen potencial | Competencia | Tipo de contenido | Prioridad |
| ------------ | ----------------- | ----------- | -------------------- | --------- |
| [Tema] | Alto/Medio/Bajo | Alta/Media/Baja | Blog/Guia/Tool/Pagina | 1-5 |

### Paso 7: Optimizacion para featured snippets

Oportunidades para capturar featured snippets:

**Tipos:**

1. **Parrafo** — respuesta en 40-60 palabras. Pregunta clara en H2/H3 seguida de respuesta concisa.
2. **Lista** — lista ordenada o desordenada con H2 que contiene la query.
3. **Tabla** — tablas HTML con headers claros.
4. **Video** — video con titulo descriptivo y timestamps.

**Checklist:**

- [ ] Ataca queries tipo pregunta ("como", "que es", "por que")
- [ ] Respuesta justo despues del heading
- [ ] Respuestas-parrafo entre 40-60 palabras
- [ ] Usa listas y tablas estructuradas cuando aplica
- [ ] Query objetivo en H2 o H3

### Paso 8: Auditoria de schema markup

| Tipo de schema         | Aplicable a                 | Estado              |
| ---------------------- | --------------------------- | ------------------- |
| Organization           | Home, About                 | Presente/Ausente    |
| LocalBusiness          | Negocios locales            | Presente/Ausente/NA |
| Product                | Paginas de producto         | Presente/Ausente/NA |
| Article                | Blog, noticias              | Presente/Ausente/NA |
| FAQ                    | Secciones FAQ               | Presente/Ausente    |
| HowTo                  | Tutoriales                  | Presente/Ausente/NA |
| Review/AggregateRating | Resenas, testimonios        | Presente/Ausente/NA |
| BreadcrumbList         | Paginas con migas           | Presente/Ausente    |
| WebSite/SearchAction   | Home (sitelinks search box) | Presente/Ausente    |
| Event                  | Paginas de eventos          | Presente/Ausente/NA |

**Guia:**

- Usa JSON-LD (formato preferido por Google)
- Valida con Google Rich Results Test
- No marques contenido invisible
- Mantenlo consistente con lo visible en pagina

### Paso 9: Oportunidades de linking interno

1. **Paginas huerfanas** — sin enlaces internos apuntando a ellas
2. **Hub pages** — paginas con autoridad que deberian enlazar a contenido relacionado
3. **Clusters tematicos** — agrupa contenido relacionado y crea estructura de linking
4. **CTA links** — contenido de blog que enlaza a paginas de producto/servicio
5. **Footer/sidebar** — enlaces sitewide a paginas importantes

**Arquitectura de linking:**

```
Home
  |-- Paginas de categoria/servicio (pillar content)
       |-- Posts/articulos concretos (cluster content)
            |-- Enlaces de vuelta al pillar
  |-- Paginas clave de conversion (pricing, signup, contacto)
       |-- Enlazadas desde contenido relevante
```

### Paso 10: Impacto de Core Web Vitals

Impacto en ingresos de Core Web Vitals:

**Impactos respaldados por data:**

- Webs que pasan todos los Core Web Vitals tienen 24% menos abandonos
- Reducir LCP 100ms correlaciona con +1,1% en CR
- Reducir CLS en 0,1 correlaciona con -15% de bounce rate
- Paginas que cargan en <2s tienen bounce rate medio del 9%; en 5s, del 38%

**Recomendaciones por metrica:**
| Metrica | Si falla | Fixes tipicos |
| -------- | ----------- | ------------------------------------------------------------------------------ |
| LCP | >2,5s | Optimizar hero image, preload de recursos criticos, CDN, reducir TTFB |
| FID/INP | >100ms | Reducir ejecucion de JS, diferir scripts no criticos, web workers |
| CLS | >0,1 | Fijar dimensiones de imagenes, reservar espacio para ads/embeds, no meter contenido sobre existente |

### Paso 11: Estrategia de contenido y blog

Segun los hallazgos, recomienda:

1. **Cadencia de publicacion** — con que frecuencia segun competencia y recursos
2. **Tipos de contenido** — blog, guias, tools, videos, infografias
3. **Estrategia de targeting de keywords** — balance entre volumen alto y long-tail
4. **Longitud de contenido** — benchmark contra el contenido top-rank del keyword
5. **Estrategia de actualizacion** — con que frecuencia refrescar existente
6. **Plan de distribucion** — como promocionar mas alla de organico

**Matriz de priorizacion de contenido:**
| Idea | Volumen | Competencia | Valor de negocio | Score de prioridad |
| ------ | --------------- | --------------- | ---------------- | ------------------ |
| [Tema] | Alto/Medio/Bajo | Alto/Medio/Bajo | Alto/Medio/Bajo | 1-10 |

Scoring: alto volumen + baja competencia + alto valor de negocio = prioridad maxima

## Formato de salida

Genera un archivo `AUDITORIA-SEO.md` con esta estructura:

```markdown
# Auditoria SEO de Contenido

## [URL]

### Fecha: [Fecha]

---

## SEO Health Score: [X/100]

---

## Checklist SEO on-page

### Title Tag

- Estado: [Pass/Amejorar/Fail]
- Actual: "[title actual]"
- Recomendado: "[title mejorado]"
- Issues: [lista de problemas]

### Meta Description

- Estado: [Pass/Amejorar/Fail]
- Actual: "[meta actual]"
- Recomendada: "[meta mejorada]"

### Jerarquia de headings

[Analisis de estructura H1-H6]

### Optimizacion de imagenes

[Resultados de auditoria de alt text]

### Linking interno

[Analisis de enlaces]

### Estructura de URL

[Assessment]

---

## Calidad de contenido (E-E-A-T)

| Dimension         | Score                           | Evidencia |
| ----------------- | ------------------------------- | --------- |
| Experience        | [Fuerte/Presente/Debil/Ausente] | [detalle] |
| Expertise         | [Fuerte/Presente/Debil/Ausente] | [detalle] |
| Authoritativeness | [Fuerte/Presente/Debil/Ausente] | [detalle] |
| Trustworthiness   | [Fuerte/Presente/Debil/Ausente] | [detalle] |

---

## Analisis de keywords

- Keyword principal: [keyword]
- Intent: [tipo]
- Ubicacion de keyword: [resultados del checklist]
- Keywords secundarias: [lista]

---

## SEO tecnico

[Resultados del check]

---

## Analisis de gaps de contenido

[Tabla de temas ausentes]

---

## Oportunidades de featured snippet

[Oportunidades concretas]

---

## Schema markup

[Actual vs recomendado]

---

## Oportunidades de linking interno

[Recomendaciones concretas]

---

## Core Web Vitals

[Assessment con impacto en ingresos]

---

## Recomendaciones de estrategia de contenido

[Plan de publicacion, prioridades]

---

## Recomendaciones priorizadas

### Criticas (fix inmediato)

1. [recomendacion con impacto esperado]

### Alta prioridad (este mes)

1. [recomendacion]

### Media prioridad (este trimestre)

1. [recomendacion]

### Baja prioridad (cuando haya recursos)

1. [recomendacion]
```

## Principios clave

- Las auditorias SEO deben ser educativas, no solo diagnosticas. Explica POR QUE importa cada elemento.
- Aporta siempre "antes" (estado actual) y "despues" (cambio recomendado) para que el cliente vea exactamente que cambiar.
- Ata las mejoras SEO a outcomes de negocio. "Optimizar tu title tag" no le dice nada a un dueno de negocio. "Optimizar tu title tag puede subir el CTR 20-35%, lo que son ~500 visitas extra al mes a esta pagina" si.
- Usa la data del script como punto de partida, pero anade analisis experto encima. El script encuentra los datos; la skill interpreta lo que significan.
- Prioriza por ratio esfuerzo-impacto. Cambiar un title es 5 minutos y afecta a cada impresion. Reescribir contenido son semanas.
- Si el usuario ejecuto `/marketing auditoria` o `/marketing landing`, cruza los hallazgos para un analisis mas completo.

**Nota contexto mercado hispanohablante:** el analisis funciona en cualquier idioma. En Espana B2B, priorizamos conversion sobre SEO organico en el scoring general.
