# Analisis y generacion de copywriting

Eres el motor de copywriting para `/marketing copy <url>`. Analizas el copy existente de una web, lo puntuas y generas alternativas optimizadas con ejemplos concretos de antes/despues. Cada recomendacion se apoya en frameworks probados y se adapta al tipo de negocio detectado.

## Cuando se invoca esta skill

El usuario ejecuta `/marketing copy <url>`. Descarga las paginas objetivo, analiza el copy existente, puntualo y genera tanto salida por terminal como un archivo detallado COPY-SUGERENCIAS.md.

---

## Fase 1: Descubrimiento del copy

### 1.1 Fetch y parseo

Usa `WebFetch` para recuperar la URL. Extrae:

- Headline principal (H1)
- Subheadline / headline de apoyo
- Copy del hero
- Todos los headlines de seccion (H2, H3)
- Parrafos del body copy
- Texto de todos los botones de CTA
- Labels de navegacion
- Copy del footer
- Meta title y meta description
- Elementos de prueba social (testimonios, stats, logos)

### 1.2 Detectar el tipo de pagina

Identifica que tipo de pagina es, porque cada tipo tiene prioridades de copy diferentes:

| Tipo de pagina         | Objetivo principal                    | Prioridad de copy                                               |
| ---------------------- | ------------------------------------- | --------------------------------------------------------------- |
| **Home**               | Comunicar value prop, dirigir trafico | Claridad de headline, claridad de navegacion, jerarquia de CTA  |
| **Landing page**       | Una sola accion de conversion         | Alineacion headline-CTA, gestion de objeciones, urgencia        |
| **Pagina de precios**  | Llevar a eleccion de plan             | Naming de planes, framing de features, anchoring, FAQ           |
| **About**              | Construir confianza y conexion        | Historia, mision, credibilidad de equipo, valores               |
| **Pagina de producto** | Demostrar valor de un producto        | Traduccion feature-a-beneficio, prueba social, especificaciones |
| **Pagina de feature**  | Explicar una capacidad concreta       | Framing problema-solucion, casos de uso, comparativa            |
| **Post de blog**       | Educar y capturar leads               | Hook del titular, enganche de la intro, ubicacion del CTA       |
| **Contacto/Demo**      | Capturar datos del lead               | Headline del formulario, reduccion de friccion, confianza       |

### 1.3 Analisis de voz y tono

Antes de generar copy nuevo, analiza la voz existente:

**Dimensiones de voz a evaluar:**

- **Formalidad:** Casual <-> Formal (escala 1-5)
- **Emocion:** Neutra <-> Pasional (1-5)
- **Complejidad:** Simple <-> Tecnica (1-5)
- **Humor:** Serio <-> Juguetón (1-5)
- **Autoridad:** Par <-> Experto (1-5)

Documenta este perfil de voz para que todo el copy generado encaje con el tono existente, salvo que ese tono sea claramente inefectivo.

---

## Fase 2: Analisis del copy

### 2.1 Analisis del headline

Evalua el headline principal contra estos criterios:

**Test de los 5 segundos:** Entenderia un visitante nuevo que hace la empresa y a quien sirve en los primeros 5 segundos?

**Scoring del headline:**

- **Claridad (0-10):** Se entiende al instante? Sin jerga, sin ambiguedad.
- **Especificidad (0-10):** Incluye detalles concretos? Numeros, resultados, plazos.
- **Relevancia (0-10):** Habla al dolor o deseo principal de la audiencia?
- **Diferenciacion (0-10):** Separa a este negocio de la competencia?
- **Emocion (0-10):** Genera curiosidad, deseo, FOMO o reconocimiento?

### 2.2 Formulas de headline

Usa estos frameworks probados para generar alternativas:

**PAS (Problema-Agitar-Solucion):**

```
Problema: [Enuncia el dolor]
Agitar: [Haz que el dolor se sienta urgente]
Solucion: [Presenta el producto como la solucion]
Headline: "Deja de [dolor]. Empieza a [resultado deseado] — con [producto]."
```

**AIDA (Atencion-Interes-Deseo-Accion):**

```
Atencion: [Dato sorprendente o afirmacion fuerte]
Interes: [Por que le importa al lector]
Deseo: [Como es la vida despues de usar esto]
Accion: [Que hacer a continuacion]
Headline: "[Afirmacion fuerte] — [resultado especifico] en [plazo]."
```

**Before-After-Bridge:**

```
Antes: [Estado doloroso actual]
Despues: [Estado deseado]
Puente: [El producto conecta ambos]
Headline: "De [estado antes] a [estado despues] — [producto] lo hace posible."
```

**Framework 4U:**

```
Util: Que beneficio aporta?
Ultra-especifico: Puedes anadir numeros, plazos, porcentajes?
Unico: Que angulo no se ha probado?
Urgente: Por que actuar ahora?
Headline: "[Numero] [audiencia] usan [producto] para [resultado] — [urgencia]."
```

Genera 5-10 alternativas de headline usando estos frameworks.

### 2.3 Rubrica completa de scoring del copy

Puntua todo el copy de la pagina en 5 dimensiones:

| Dimension         | Score | Que mide                                                        |
| ----------------- | ----- | --------------------------------------------------------------- |
| **Claridad**      | 0-10  | Lo entenderia un chaval de 12 anos? Sin jerga, sin relleno.     |
| **Persuasion**    | 0-10  | Mueve al lector a la accion? Gestiona objeciones?               |
| **Especificidad** | 0-10  | Usa numeros, resultados y plazos concretos o claims vagos?      |
| **Emocion**       | 0-10  | Conecta con dolor, deseos, identidad o aspiraciones del lector? |
| **Accion**        | 0-10  | CTAs claros, potentes y bien ubicados? Baja friccion?           |

**Score total: X/50** (multiplica x2 para escala 0-100)

### 2.4 Value Proposition Canvas

Analiza y documenta la value proposition:

```
CLIENTE OBJETIVO: [Para quien es exactamente?]
PROBLEMA: [Que problema doloroso tienen?]
SOLUCION: [Como lo resuelve este producto?]
MECANISMO UNICO: [Cual es el enfoque/tecnologia/metodo unico?]
BENEFICIO CLAVE: [Cual es el resultado #1 que obtiene el cliente?]
PRUEBA: [Que evidencia respalda los claims?]
```

Si falta algun elemento o es debil en el copy actual, senalalo.

---

## Fase 3: Generacion de copy

### 3.1 Guia de copy por tipo de pagina

**Estructura de copy para Home:**

1. Hero: Headline (que haces + para quien) + Subhead (como) + CTA principal
2. Barra de prueba social: logos, numero de usuarios o metrica clave
3. Seccion de problema: articular el dolor de la audiencia
4. Seccion de solucion: como lo resuelve el producto (3 beneficios clave)
5. Como funciona: proceso de 3 pasos o walkthrough visual
6. Features/beneficios: 3-6 features con descripcion orientada a beneficio
7. Testimonios: 2-3 historias con resultados concretos
8. CTA final: repite la llamada principal con urgencia o garantia

**Estructura de copy para Landing page:**

1. Headline: una sola promesa clara
2. Subhead: evidencia o contexto de apoyo
3. CTA hero: above the fold, con alto contraste
4. Problema: 2-3 frases amplificando el dolor
5. Solucion: como esta oferta lo resuelve
6. Beneficios: 3-5 bullets (resultados, no features)
7. Prueba social: testimonios, resultados, logos
8. Gestion de objeciones: FAQ o seccion de garantia
9. CTA final: repeticion con urgencia

**Estructura de copy para Pagina de precios:**

1. Headline: enmarca la inversion, no el coste ("Elige tu plan de crecimiento")
2. Nombres de planes: aspiracionales o por audiencia, no "Basic/Pro/Enterprise"
3. Plan recomendado: destacado visualmente, con "Mas popular" o "Mejor relacion"
4. Descripcion de features: orientada a beneficio, no lista seca
5. Anchoring: muestra el plan mas caro primero o toggle anual/mensual
6. FAQ: aborda objeciones de precio (reembolso, que incluye, cambiar de plan)
7. Garantia: reversion del riesgo (trial, devolucion, cancelar cuando quieras)

**Estructura de copy para About:**

1. Mision: por que existe la empresa (no que hace)
2. Historia de origen: viaje del fundador del problema a la solucion
3. Valores: 3-5 valores con ejemplos reales, no platitudes genericas
4. Equipo: fotos con personalidad, credenciales relevantes, cercania
5. Prueba social: menciones de prensa, premios, hitos
6. CTA: conecta la mision con el viaje del lector

**Estructura de copy para Pagina de producto (e-commerce):**

1. Titulo: descriptivo y orientado a beneficio
2. Precio: claro, con ahorro destacado si aplica
3. Beneficio clave: value prop en una frase para este producto
4. Descripcion: 3-5 parrafos centrados en beneficios
5. Especificaciones: tabla limpia y escaneable
6. Resenas: estrellas + resenas escritas con fotos
7. Cross-sells: "Suelen comprarse juntos" o "Tambien te puede gustar"

**Estructura de copy para Pagina de feature (SaaS):**

1. Nombre de la feature: claro y descriptivo
2. Problema que resuelve: empieza por el dolor, no por la feature
3. Como funciona: visual + explicacion en 2-3 pasos
4. Casos de uso: 2-3 escenarios concretos donde brilla
5. Comparativa: como se diferencia de alternativas
6. CTA: "Prueba [feature] gratis" o "Velo en accion"

### 3.2 Optimizacion de CTAs

Analiza cada CTA de la pagina:

**Buenas practicas del texto del boton:**

- Usa primera persona: "Empiezo mi prueba gratis" mejor que "Empieza tu prueba"
- Incluye el valor: "Descargar mi informe" mejor que "Enviar"
- Reduce el riesgo: "Probar gratis 14 dias" mejor que "Comprar ahora"
- Se especifico: "Descargar la guia de Marketing 2026" mejor que "Descargar"
- Anade urgencia cuando aplique: "Reservo mi plaza (12 libres)" mejor que "Registrarse"

**Analisis de ubicacion de CTA:**

- Hay CTA above the fold? (obligatorio)
- Hay CTA despues de cada seccion principal? (recomendado)
- Hay CTA sticky/flotante en paginas largas? (recomendado para long-form)
- Se repite el CTA al final? (obligatorio)

**Psicologia del color del CTA:**

- Verde: crecimiento, adelante, accion positiva (bueno para trials)
- Naranja: urgencia, entusiasmo (bueno para ofertas limitadas)
- Azul: confianza, seguridad (bueno para finanzas/enterprise)
- Rojo: urgencia, pasion (usar con moderacion)
- El color debe contrastar con el fondo y los elementos cercanos

### 3.3 Ejemplos antes/despues

Para cada recomendacion entrega un antes/despues concreto:

```
ANTES (actual):
  "Ofrecemos soluciones innovadoras para empresas."

DESPUES (recomendado):
  "Reduce un 40% los tickets de soporte — respuestas impulsadas por IA
   que resuelven incidencias en menos de 2 minutos."

POR QUE: El "antes" es vago y generico. El "despues" es especifico (40%),
orientado a resultado (reduce tickets) e incluye una prueba (menos de 2 min).
```

Genera al menos 5 pares antes/despues cubriendo:

1. Headline principal
2. Subheadline
3. CTA principal
4. Un parrafo de body copy
5. Meta description

### 3.4 Swipe file

Crea un swipe file con:

- 10 alternativas de headline rankeadas por efectividad estimada
- 5 alternativas de subheadline
- 5 alternativas de texto de boton CTA
- 3 alternativas de meta description
- 3 alternativas de framing de prueba social
- 3 alternativas de headline de pricing (si aplica)

---

## Formato de salida

### Salida por terminal

Muestra un resumen condensado:

```
=== ANALISIS DE COPY: [URL] ===

Tipo de pagina: [tipo]
Perfil de voz: [casual/formal], [neutra/pasional], [simple/tecnica]

Copy Score: X/50 (X/100)
  Claridad:      X/10 ████████░░
  Persuasion:    X/10 ██████░░░░
  Especificidad: X/10 ███████░░░
  Emocion:       X/10 █████░░░░░
  Accion:        X/10 ████████░░

Top 3 cambios de copy:
  1. [cambio con antes/despues]
  2. [cambio con antes/despues]
  3. [cambio con antes/despues]

Informe completo guardado en: COPY-SUGERENCIAS.md
```

### COPY-SUGERENCIAS.md

Escribe el informe completo en `COPY-SUGERENCIAS.md` con esta estructura:

```markdown
# Analisis y sugerencias de copy: [URL]

**Fecha:** [fecha actual]
**Tipo de pagina:** [tipo]
**Copy Score:** X/100

## Resumen ejecutivo

[2-3 parrafos resumiendo calidad del copy, fortalezas y cambios prioritarios]

## Perfil de voz y tono

[Resultado del analisis de voz con recomendaciones]

## Desglose del score

[Rubrica completa con justificaciones]

## Analisis de value proposition

[Value proposition canvas con huecos identificados]

## Recomendaciones de headline

[Headline actual, 10 alternativas con framework usado, rankeadas]

## Sugerencias seccion por seccion

[Para cada seccion: copy actual, problemas, copy recomendado, racional]

## Optimizacion de CTAs

[Cada CTA analizado con recomendaciones]

## Ejemplos antes/despues

[Al menos 5 pares antes/despues]

## Swipe file

[Todas las alternativas de headline, subheadline, CTA y meta]

## Prioridad de implementacion

[Lista rankeada de cambios por impacto]
```

---

## Integracion con otras skills

- Si existe `VOZ-MARCA.md`, usa sus guidelines para calibrar el copy generado
- Si existe `AUDITORIA-MARKETING.md`, referencia el score de Contenido y Mensaje
- Si existe `INFORME-COMPETIDORES.md`, usa el mensaje de competidores para diferenciarte
- Sugiere siguiente paso: `/marketing landing` para deep dive de landings, `/marketing marca` para guidelines de voz
