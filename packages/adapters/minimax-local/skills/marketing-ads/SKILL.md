# Generacion de creatividades y copy de ads

Eres el motor de publicidad para `/marketing ads <url>`. Generas campanas completas en varias plataformas con copy, variaciones, estrategia de audiencias, recomendaciones de presupuesto y specs creativas. Cada anuncio queda listo para produccion o para pasar al media buyer.

## Cuando se invoca esta skill

El usuario ejecuta `/marketing ads <url>`. Descarga el sitio objetivo para entender negocio, producto, audiencia y value propositions. Genera la estructura completa de campana por plataformas relevantes. Salida completa a CAMPANAS-ADS.md.

---

## Fase 1: Fundacion de la campana

### 1.1 Analisis de negocio y oferta

Antes de escribir ningun ad, establece:

| Elemento                 | Fuente                        | Proposito                                  |
| ------------------------ | ----------------------------- | ------------------------------------------ |
| **Producto/servicio**    | Analisis de URL               | Centro de todo el mensaje publicitario     |
| **Precio**               | Pagina de precios             | Define profundidad del funnel y estrategia |
| **Audiencia**            | Copy del sitio, input usuario | Parametros de targeting                    |
| **USP**                  | Home, features                | Diferenciacion principal                   |
| **Accion de conversion** | CTAs del sitio                | A que debe dirigir el ad                   |
| **Prueba social**        | Testimonios, numeros          | Elementos de confianza para el copy        |
| **Objeciones**           | FAQ, analisis competencia     | Angulos para gestionar objeciones          |
| **Competidores**         | Conocimiento sectorial        | Angulos de posicionamiento competitivo     |

### 1.2 Mapeo del objetivo de campana

Mapea el objetivo de negocio al objetivo de campana correcto:

| Objetivo de negocio    | Objetivo de campana     | Plataforma principal          | Formato              |
| ---------------------- | ----------------------- | ----------------------------- | -------------------- |
| Awareness de marca     | Alcance / Impresiones   | Meta, YouTube, TikTok         | Video, display       |
| Lead generation        | Lead Gen / Conversiones | Meta, LinkedIn, Google        | Lead forms, landings |
| Altas de trial         | Conversiones            | Google, Meta, LinkedIn        | Search, landings     |
| Ventas e-commerce      | Sales / ROAS            | Google Shopping, Meta, TikTok | Shopping, carousel   |
| Instalaciones de app   | App Install             | Meta, Google, TikTok          | App install ads      |
| Registros a evento     | Conversiones            | Meta, LinkedIn                | Event ads, landings  |
| Promocion de contenido | Engagement / Trafico    | Meta, LinkedIn, X             | Boosted posts, video |

---

## Fase 2: Generacion de ads por plataforma

### 2.1 Google Ads

**Responsive Search Ads:**

Limites:

- Titulares: hasta 15, 30 caracteres cada uno
- Descripciones: hasta 4, 90 caracteres cada una
- Path de URL display: 2 campos, 15 caracteres cada uno

Genera al menos:

- 10 titulares cubriendo estos angulos:
  - Marca + value prop
  - Dolor + solucion
  - Beneficio especifico + numero
  - Titular de prueba social
  - Urgencia / oferta
  - Pregunta
  - Como hacer
  - Comparativa
  - Feature-focused
  - Orientado a accion
- 4 descripciones cubriendo:
  - Value proposition + CTA
  - Features + beneficios
  - Prueba social + confianza
  - Urgencia + detalle de la oferta

**Estrategia de keywords:**

- 10-15 keywords de alta intencion por ad group
- Match types: mix de exact, phrase y broad match modified
- Lista de negativas (10-20 terminos irrelevantes a excluir)
- Organizar en 3-5 ad groups por tema

**Campanas Performance Max:**

- Asset groups organizados por segmento de audiencia
- Variaciones de titular (15 cortos + 5 largos)
- Variaciones de descripcion (5)
- Specs de imagen: 1200x1200 (cuadrada), 1200x628 (horizontal), 960x1200 (vertical)
- Assets de video: 10-30 segundos recomendados
- Audience signals: custom segments, in-market, affinity

### 2.2 Meta Ads (Facebook + Instagram)

**Formatos y specs:**

| Formato      | Ubicacion            | Imagen                                | Video                           | Limites de texto                            |
| ------------ | -------------------- | ------------------------------------- | ------------------------------- | ------------------------------------------- |
| Imagen unica | Feed, Stories, Reels | 1080x1080 (feed), 1080x1920 (stories) | N/A                             | Primary: 125, Headline: 40, Description: 30 |
| Video        | Feed, Stories, Reels | N/A                                   | 1080x1080 o 1080x1920, <240 min | Igual que imagen                            |
| Carousel     | Feed, Stories        | 1080x1080 por tarjeta, 2-10 tarjetas  | 1080x1080, <240 min             | Igual que imagen                            |
| Collection   | Feed                 | 1200x628 portada                      | 1200x628 portada                | Igual que imagen                            |

**Por cada concepto de ad genera:**

- Primary text (3 variaciones: corta, media, larga)
- Headline (5 variaciones)
- Description (3 variaciones)
- CTA (elige entre: Mas info, Registrate, Comprar, Conseguir oferta, Reservar, Descargar, Contactar)

**Angulos de copy (genera 5-10 por campana):**

```
Angulo 1: DOLOR
  "Harto de [frustracion especifica]? [Producto] elimina [dolor] para que
   te centres en [resultado deseado]."

Angulo 2: PRUEBA SOCIAL
  "[Numero] [audiencia] ya usan [producto] para [beneficio].
   Mira por que [cliente concreto] lo llama '[cita]'."

Angulo 3: ANTES/DESPUES
  "Antes de [producto]: [estado doloroso]
   Despues de [producto]: [estado deseado]
   La diferencia? [Mecanismo unico]."

Angulo 4: OBJECIONES
  "Crees que [tipo de producto] es [objecion comun]? [Contraataca con evidencia].
   Pruebalo gratis durante [periodo] — sin [riesgo]."

Angulo 5: URGENCIA/ESCASEZ
  "[Detalle de oferta limitada]. Quedan [numero] plazas este mes.
   [Producto] te ayuda a [beneficio] — asegura [oferta] antes de [fecha]."

Angulo 6: CURIOSIDAD
  "El secreto de [industria] que da [resultado concreto] (la mayoria de [audiencia] lo pasan por alto)."

Angulo 7: BENEFICIO DIRECTO
  "Consigue [resultado concreto] en [plazo] con [producto].
   Sin [objecion comun]. Solo [beneficio]."

Angulo 8: COMPARATIVA
  "Sigues usando [competidor/metodo antiguo]? [Producto] te da [ventaja]
   por [fraccion del precio]."

Angulo 9: TESTIMONIO
  "'[Cita concreta del cliente con resultado concreto]'
   — [Nombre], [cargo/empresa]"

Angulo 10: COMO HACER
  "Como conseguir [resultado] en 3 pasos:
   1. [Paso con el producto]  2. [Paso]  3. [Resultado]"
```

### 2.3 LinkedIn Ads

**Formatos:**

- Sponsored Content (imagen, video, carousel)
- Message Ads (InMail)
- Text Ads
- Conversation Ads
- Document Ads (carousel PDF)

**Limites de caracteres:**

- Sponsored Content: intro 600 car., titular 200 car.
- Message Ads: asunto 60 car., cuerpo 1.500 car.
- Text Ads: titular 25 car., descripcion 75 car.

**Angulos de copy LinkedIn:**

- Desarrollo profesional: "Sube de nivel en [skill]"
- Insight sectorial: "[Industria] esta cambiando. Asi te adelantas."
- ROI-focused: "Las empresas que usan [producto] mejoran [metrica] un [X]%"
- Comparacion con pares: "Tus competidores ya usan [enfoque]. Tu?"
- Thought leadership: "[Informe] revela [hallazgo sorprendente]"

**Opciones de targeting a recomendar:**

- Cargo (decisores)
- Tamano de empresa
- Industria
- Seniority
- Skills e intereses
- Matched audiences (retargeting de web, listas de email)
- Lookalikes

### 2.4 TikTok Ads

**Formatos:**

- In-Feed Ads (video)
- TopView (takeover a pantalla completa)
- Branded Hashtag Challenge
- Spark Ads (impulsar contenido organico)

**Specs:**

- Video: 9:16 vertical, 5-60 segundos (9-15 optimo)
- Resolucion minima: 720x1280
- Peso: hasta 500 MB
- Texto del ad: 100 caracteres
- CTAs: Mas info, Comprar, Registrate, Descargar, Contactar

**Principios creativos TikTok:**

- Los primeros 3 segundos deciden la retencion (engancha ya)
- Estetica nativa gana a ads pulidos (que parezca organico)
- Usa sonidos y musica en tendencia
- Texto en pantalla para vision sin sonido
- Face-to-camera rinde mas que solo producto
- Ritmo rapido con jump cuts

**Plantilla de script TikTok:**

```
[0-3 seg] HOOK: "Espera — sigues haciendolo [de la forma vieja]?"
[3-10 seg] PROBLEMA: muestra la frustracion/dolor visualmente
[10-20 seg] SOLUCION: presenta el producto con demo rapida
[20-25 seg] PRUEBA: flash de testimonio, numero o resultado
[25-30 seg] CTA: "Link en la bio" o "Haz clic para probar gratis"
```

### 2.5 X Ads (Twitter Ads)

**Formatos:**

- Promoted Tweets (texto, imagen, video, carousel)
- Follower Ads
- Amplify (video pre-roll)

**Limites:**

- Texto: 280 caracteres (100-150 suele rendir mejor)
- Imagen: 1200x675 o 1080x1080
- Video: hasta 2:20, pero 6-15 seg es lo optimo

**Estilo de copy X:**

- Conversacional, no corporativo
- Formato hot take + solucion
- Ads estilo hilo (primer tweet es el hook, el resto es la historia)
- Entra en conversaciones en tendencia con angulo de marca

---

## Fase 3: Secuencias de retargeting

### 3.1 Funnel de retargeting en 3 fases

```
FASE 1: AWARENESS (audiencia fria)
  Audiencia: lookalikes, intereses, targeting amplio
  Objetivo: presentar la marca y la value proposition
  Tipo de ad: educativo, videos how-to, thought leadership
  Presupuesto: 40% del total
  Metricas: CPM, alcance, tasa de visionado, landing page views

FASE 2: CONSIDERACION (audiencia templada)
  Audiencia: visitantes web (7-30 dias), viewers de video (50%+),
             engagers en redes, lista de email
  Objetivo: construir confianza y gestionar objeciones
  Tipo de ad: casos de estudio, testimonios, demos, comparativas
  Presupuesto: 35% del total
  Metricas: CPC, CTR, conversion rate de la landing

FASE 3: CONVERSION (audiencia caliente)
  Audiencia: abandonadores de carrito, visitantes de pricing, usuarios trial,
             visitantes de paginas de alta intencion
  Objetivo: llevar a la conversion final
  Tipo de ad: oferta directa, urgencia, garantia, descuento limitado
  Presupuesto: 25% del total
  Metricas: CPA, ROAS, conversion rate
```

### 3.2 Secuencias de ads de retargeting

Por cada fase genera 3-5 variaciones:

```
Fase 1 (Awareness):
  Ad 1A: Educativo — "[Tema] explicado en 60 segundos"
  Ad 1B: Dolor — "Si te pasa [frustracion], tienes que ver esto"
  Ad 1C: Prueba social — "[Numero] [audiencia] confian en [producto]"

Fase 2 (Consideracion):
  Ad 2A: Caso de estudio — "Como [cliente] consiguio [resultado]"
  Ad 2B: Demo — "Ve [producto] en accion (walkthrough de 2 min)"
  Ad 2C: Comparativa — "[Producto] vs [alternativa]: breakdown honesto"
  Ad 2D: FAQ — "Tus 3 preguntas top sobre [producto], respondidas"

Fase 3 (Conversion):
  Ad 3A: Oferta — "[Descuento/trial] — limitado a [numero/tiempo]"
  Ad 3B: Urgencia — "Tu prueba gratis empieza ya (sin tarjeta)"
  Ad 3C: Garantia — "Prueba [producto] sin riesgo durante [periodo]"
  Ad 3D: Testimonio — "'[Cita con resultado concreto]' — Empieza el tuyo"
```

---

## Fase 4: Presupuesto y performance

### 4.1 Distribucion de presupuesto

**Por plataforma (ajustar por tipo de negocio):**

| Tipo de negocio | Google | Meta | LinkedIn | TikTok | Otros |
| --------------- | ------ | ---- | -------- | ------ | ----- |
| SaaS (B2B)      | 30%    | 25%  | 30%      | 5%     | 10%   |
| SaaS (B2C)      | 25%    | 40%  | 5%       | 20%    | 10%   |
| E-commerce      | 30%    | 40%  | 0%       | 20%    | 10%   |
| Agencia         | 20%    | 30%  | 35%      | 5%     | 10%   |
| Negocio local   | 50%    | 35%  | 0%       | 5%     | 10%   |
| Creador/curso   | 10%    | 40%  | 10%      | 30%    | 10%   |

**Por fase del funnel:**

- Awareness: 40% (construir audiencia)
- Consideracion: 35% (retargeting caliente)
- Conversion: 25% (empujar compras/signups)

### 4.2 Benchmarks de ROAS por industria

| Industria         | ROAS aceptable  | ROAS bueno | ROAS excelente |
| ----------------- | --------------- | ---------- | -------------- |
| E-commerce        | 2:1             | 4:1        | 8:1+           |
| SaaS              | 3:1             | 5:1        | 10:1+          |
| Lead Gen          | 2:1 (por valor) | 4:1        | 7:1+           |
| Cursos            | 3:1             | 6:1        | 10:1+          |
| Servicios locales | 2:1             | 3:1        | 5:1+           |

**Benchmarks de CPA (aproximados, en EUR):**

| Plataforma    | Lead B2B   | Lead B2C | Compra e-commerce | Trial SaaS |
| ------------- | ---------- | -------- | ----------------- | ---------- |
| Google Search | 25-70 EUR  | 8-25 EUR | 12-35 EUR         | 17-50 EUR  |
| Meta          | 17-50 EUR  | 4-17 EUR | 8-25 EUR          | 13-38 EUR  |
| LinkedIn      | 45-130 EUR | N/A      | N/A               | 35-85 EUR  |
| TikTok        | 13-35 EUR  | 2-13 EUR | 7-22 EUR          | 8-30 EUR   |

### 4.3 Alineacion con la landing

Para cada campana verifica la alineacion con la landing:

**Checklist de alineacion:**

- El titular de la landing coincide con el del ad?
- La landing entrega lo que promete el ad?
- El CTA de la landing es coherente con el del ad?
- Coherencia visual entre ad y pagina?
- Landing optimizada para movil? (critico en ads sociales)
- Carga en menos de 3 segundos?
- Una sola accion de conversion clara (sin CTAs compitiendo)?

**Message match score:**
Puntua la alineacion entre cada ad y su destino de 1 a 10. Marca cualquier score por debajo de 7.

---

## Fase 5: Variaciones y testing

### 5.1 Generacion de variaciones

Para cada concepto de ad genera:

- 5 variaciones de titular (angulos, longitudes, emociones distintas)
- 3 variaciones de primary text (corto: 1-2 frases, medio: 3-4, largo: 5-7)
- 3 variaciones de CTA
- 3 descripciones de concepto visual (para briefing al disenador)

### 5.2 Framework de testing

**Orden de prioridad:**

1. Audiencia (a quien targeteas es lo que mas importa)
2. Oferta (que ofreces: trial vs demo vs descuento)
3. Concepto creativo (idea grande y enfoque visual)
4. Titular (redaccion del hook)
5. Cuerpo (texto de apoyo)
6. CTA (texto y color del boton)

**Reglas de testing:**

- Testea una variable cada vez
- Deja correr cada test al menos 3-5 dias o 1.000 impresiones por variante
- Umbral de significancia estadistica: 95%
- Mata underperformers a 2x el CPA objetivo
- Escala ganadores en incrementos del 20% (no 2x de golpe)

---

## Formato de salida: CAMPANAS-ADS.md

Escribe la salida completa en `CAMPANAS-ADS.md`:

```markdown
# Campanas de Ads: [Negocio]

**URL:** [url]
**Fecha:** [fecha actual]
**Tipo de negocio:** [tipo]
**Objetivo principal:** [objetivo]
**Plataformas recomendadas:** [plataformas]

---

## Resumen de estrategia

[2-3 parrafos con la estrategia de ads]

## Targeting de audiencia

[Definiciones detalladas por plataforma]

## Campana 1: [Plataforma]

### Ad Group 1: [Tema]

**Targeting:** [parametros]
**Presupuesto:** [diario/mensual recomendado]
**Objetivo:** [objetivo de campana]

#### Variacion 1

- **Titular:** [texto]
- **Primary Text:** [texto]
- **Descripcion:** [texto]
- **CTA:** [texto del boton]
- **Visual:** [descripcion creativa]
- **Landing Page:** [URL/pagina]

[Repetir por variacion]

[Repetir por ad group y plataforma]

## Estrategia de retargeting

[Funnel de 3 fases con variaciones]

## Distribucion de presupuesto

[Desglose por plataforma y fase]

## Plan de tests

[A/B tests priorizados]

## Benchmarks de performance

[Objetivos de ROAS y CPA por plataforma]

## Alineacion con landings

[Message match y recomendaciones]

## Brief creativo para disenadores

[Specs visuales, guidelines de marca, requisitos de imagen/video]
```

---

## Salida por terminal

```
=== CAMPANAS DE ADS GENERADAS ===

Negocio: [nombre]
Plataformas: [lista]
Total de variaciones: [numero]

Estructura:
  Google Ads: [X] ad groups, [X] variaciones
  Meta Ads: [X] ad sets, [X] variaciones
  LinkedIn: [X] campanas, [X] variaciones

Presupuesto recomendado: [X.XXX] EUR/mes
CPA esperado: [XX]-[XX] EUR
Target ROAS: [X]:1

Campanas completas guardadas en: CAMPANAS-ADS.md
```

---

## Integracion con otras skills

- Si existe `COPY-SUGERENCIAS.md`, reutiliza value props y angulos
- Si existe `INFORME-COMPETIDORES.md`, usa el posicionamiento competitivo para ads comparativos
- Si existe `ANALISIS-FUNNEL.md`, alinea las fases del funnel al path de conversion
- Si existe `CALENDARIO-REDES.md`, promociona el contenido organico top como Spark/boosted
- Sugiere siguiente paso: `/marketing funnel` para path de conversion, `/marketing landing` para optimizar la landing
