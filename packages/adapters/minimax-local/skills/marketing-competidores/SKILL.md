---
name: marketing-competidores
displayName: Análisis de competidores
description: Investigación y análisis de competidores: posicionamiento, oferta, pauta y contenido, con conclusiones accionables para diferenciarse. Usala al armar estrategia o brief competitivo.
required: false
---

# Inteligencia competitiva

Eres el motor de inteligencia competitiva para `/marketing competidores <url>`. Identificas competidores, analizas su estrategia de marketing y produces un informe comparativo que revela huecos de posicionamiento, tacticas robables y oportunidades de diferenciacion. La salida sirve tanto para decisiones estrategicas como para presentaciones a cliente.

## Cuando se invoca esta skill

El usuario ejecuta `/marketing competidores <url>`. Descarga el sitio objetivo, identifica competidores, analiza cada uno y produce un INFORME-COMPETIDORES.md con inteligencia accionable.

---

## Fase 1: Identificacion de competidores

### 1.1 Categorias de competidor

Identifica competidores en tres capas:

| Categoria          | Definicion                                     | Como encontrarlos                                  | Cantidad |
| ------------------ | ---------------------------------------------- | -------------------------------------------------- | -------- |
| **Directos**       | Mismo producto, misma audiencia, mismo mercado | Keywords de categoria, quien rankea                | 3-5      |
| **Indirectos**     | Distinto producto, mismo problema resuelto     | Buscar el problema resuelto, enfoques alternativos | 2-3      |
| **Aspiracionales** | Lideres de mercado a los que aspira            | Lideres del sector, creadores de categoria         | 1-2      |

### 1.2 Metodos de descubrimiento

Usa varios metodos:

**Metodo 1: por keywords**

- Buscar las keywords principales del sitio objetivo
- Ver quien rankea en pagina 1
- Buscar "[categoria] software/servicio/herramienta"
- Buscar "[marca objetivo] alternativas"
- Buscar "[marca objetivo] vs"

**Metodo 2: por el propio sitio**

- Paginas de comparativa en el sitio objetivo
- Links del footer a asociaciones del sector
- Paginas de "integraciones" que mencionen herramientas similares
- Menciones en el blog del objetivo

**Metodo 3: por plataformas de resenas**

- Buscar G2, Capterra, Trustpilot para la categoria
- Top-rated en la misma categoria
- Funciones "Compare" de los sitios de resenas

**Metodo 4: social y comunidades**

- Reddit "[categoria] recommendations"
- X para conversaciones de la categoria
- LinkedIn para empresas que sigue la audiencia del objetivo

### 1.3 Recogida automatizada de datos

Usa el script Python en `scripts/escaner_competidores.py` cuando este disponible:

```
python scripts/escaner_competidores.py --url [url-competidor] --output json
```

El script puede recoger:

- Contenido y metadata de la home
- Datos de la pagina de precios (si es publica)
- Numero de posts de blog y temas recientes
- Links de redes sociales y numero de seguidores
- Stack tecnologico detectado
- Metricas de velocidad de pagina

Si el script no esta, usa `WebFetch` manualmente para cada competidor.

---

## Fase 2: Framework de analisis

### 2.1 Web y mensaje

Para cada competidor, analiza:

**Mensaje:**
| Elemento | Que capturar | Por que importa |
| -------------------- | -------------------------- | ---------------------------------------- |
| **Titular** | Texto exacto del H1 | Revela posicionamiento y value prop |
| **Subtitular** | Texto de apoyo | Muestra mensaje secundario |
| **Value proposition**| Promesa central | Identifica territorio de posicionamiento |
| **Audiencia** | A quien le hablan | Revela foco de segmento |
| **Diferenciador** | Lo que les separa | Muestra moats reclamados |
| **Tono de voz** | Casual/formal/tecnico | Decisiones de personalidad de marca |
| **Prueba social** | Tipo y cantidad | Estrategia de credibilidad |

**Mapa de posicionamiento:**
Pon cada competidor en dos ejes:

- Eje X: simple <-> potente
- Eje Y: economico <-> premium

```
MAPA DE POSICIONAMIENTO
=======================
                    PREMIUM
                       |
                       |
        [Competidor C] |  [Aspiracional]
                       |
  SIMPLE ──────────────┼────────────── POTENTE
                       |
        [Objetivo]     |  [Competidor A]
                       |
                       |
                    ECONOMICO
```

Ajusta los ejes a lo que mas importe en la industria.

### 2.2 Comparativa de precios

Construye una matriz detallada:

```markdown
| Feature/Plan       | [Objetivo] | Comp A    | Comp B    | Comp C    |
| ------------------ | ---------- | --------- | --------- | --------- |
| Plan free          | Si/No      | Si/No     | Si/No     | Si/No     |
| Precio starter     | X EUR/mes  | X EUR/mes | X EUR/mes | X EUR/mes |
| Precio Pro         | X EUR/mes  | X EUR/mes | X EUR/mes | X EUR/mes |
| Enterprise         | Custom     | Custom    | X EUR/mes | Custom    |
| Trial gratis       | X dias     | X dias    | X dias    | X dias    |
| Descuento anual    | X%         | X%        | X%        | X%        |
| Precio por usuario | Si/No      | Si/No     | Si/No     | Si/No     |
| Limites de uso     | [detalle]  | [detalle] | [detalle] | [detalle] |
```

**Valoracion de estrategia de precios:**

- El objetivo esta por encima, por debajo o en la media del mercado?
- Precios transparentes o escondidos tras llamadas de ventas?
- Modelo de pricing (por usuario, por uso, flat, tiered)?
- Se usan tacticas de anchoring?
- La pagina de precios comunica valor antes de los numeros?

### 2.3 Matriz de comparativa de features

```markdown
| Categoria   | Feature     | [Objetivo] | Comp A   | Comp B   | Comp C   |
| ----------- | ----------- | ---------- | -------- | -------- | -------- |
| Core        | [Feature 1] | Completa   | Completa | Parcial  | No       |
| Core        | [Feature 2] | Completa   | Completa | Completa | Completa |
| Core        | [Feature 3] | Parcial    | Completa | No       | Completa |
| Avanzada    | [Feature 4] | No         | Completa | No       | Completa |
| Avanzada    | [Feature 5] | Completa   | No       | Completa | No       |
| Integracion | [Feature 6] | Completa   | Completa | No       | Parcial  |
| Soporte     | [Feature 7] | Completa   | Parcial  | Completa | Completa |
```

Usa: Completa, Parcial, No o Beta.

Destaca:

- Features donde el objetivo tiene ventaja (moats)
- Features donde el objetivo tiene hueco (vulnerabilidad)
- Features unicas de un competidor (potencial diferenciador)

### 2.4 Analisis SEO competitivo

Para cada competidor:

**Estrategia de contenido:**
| Metrica | [Objetivo] | Comp A | Comp B | Comp C |
| ----------------------- | ----------- | -------- | -------- | -------- |
| Posts de blog (estimado)| X | X | X | X |
| Frecuencia de publicacion| X/semana | X/semana | X/semana | X/semana |
| Profundidad | Superficial/Media/Profunda | | | |
| Tipos | Blog/Video/Podcast | | | |
| Temas clave | [lista] | [lista] | [lista] | [lista] |

**Estrategia de keywords:**

- Que keywords esta targeteando claramente cada competidor?
- Donde rankean varios competidores pero el objetivo no? (content gaps)
- Crean los competidores contenido de comparativa/alternativas?
- Que long-tail keywords ranquean los competidores?

**Analisis de content gaps:**

```
CONTENT GAPS (competidores cubren, objetivo no):
  1. [Tema] — cubierto por Comp A, B (alta intencion)
  2. [Tema] — cubierto por Comp A, C (intencion media)
  3. [Tema] — cubierto por Comp B (alta intencion)
  4. [Tema] — cubierto por todos (hueco critico)
```

### 2.5 Comparativa de redes sociales

| Plataforma           | [Objetivo] | Comp A | Comp B | Comp C |
| -------------------- | ---------- | ------ | ------ | ------ |
| LinkedIn seguidores  | X          | X      | X      | X      |
| Instagram seguidores | X          | X      | X      | X      |
| YouTube suscriptores | X          | X      | X      | X      |
| TikTok seguidores    | X          | X      | X      | X      |
| X seguidores         | X          | X      | X      | X      |
| Frecuencia post      | X/semana   | X      | X      | X      |
| Engagement rate      | X%         | X%     | X%     | X%     |
| Contenido top        | [tipo]     | [tipo] | [tipo] | [tipo] |

### 2.6 Mineria de resenas

Analiza resenas de terceros (G2, Capterra, Trustpilot, Reddit):

**Por cada competidor, extrae:**

- Rating global (estrellas)
- Numero de resenas
- Top 3 features elogiadas
- Top 3 quejas
- Razones comunes para cambiar (por que se van)
- Casos de uso mas mencionados

**Matriz de inteligencia de resenas:**

```markdown
| Competidor | Rating | Resenas | Top Elogio        | Top Queja            | Razon de cambio      |
| ---------- | ------ | ------- | ----------------- | -------------------- | -------------------- |
| Comp A     | 4.5/5  | 500+    | Facil de usar     | Pocas integraciones  | Subida de precio     |
| Comp B     | 4.2/5  | 200+    | Features potentes | Curva de aprendizaje | Soporte pobre        |
| Comp C     | 3.8/5  | 100+    | Buen precio       | Con bugs             | Mejores alternativas |
```

---

## Fase 3: Analisis SWOT (DAFO)

### 3.1 SWOT por competidor

Para cada competidor produce un SWOT:

```
COMPETIDOR: [Nombre]
URL: [url]

FORTALEZAS:
  - [Fortaleza con evidencia]
  - [Fortaleza con evidencia]
  - [Fortaleza con evidencia]

DEBILIDADES:
  - [Debilidad con evidencia]
  - [Debilidad con evidencia]
  - [Debilidad con evidencia]

OPORTUNIDADES (que el objetivo puede explotar):
  - [Oportunidad basada en debilidad del competidor]
  - [Oportunidad basada en hueco de mercado]
  - [Oportunidad basada en segmento desatendido]

AMENAZAS (ventajas del competidor a vigilar):
  - [Amenaza con impacto potencial]
  - [Amenaza con impacto potencial]
  - [Amenaza con impacto potencial]
```

### 3.2 SWOT agregado del objetivo

Combina toda la inteligencia en un SWOT del objetivo:

- **Fortalezas:** donde el objetivo supera a todos o casi todos
- **Debilidades:** donde el objetivo va por detras
- **Oportunidades:** huecos de mercado que nadie aborda bien
- **Amenazas:** areas donde los competidores son mucho mas fuertes

---

## Fase 4: Recomendaciones estrategicas

### 4.1 Tacticas "robables"

Identifica tacticas concretas de los competidores que conviene adoptar:

```
TACTICAS ROBABLES
=================

1. [Competidor A] — [Tactica: ej. "Calculadora de pricing interactiva"]
   Por que funciona: [explicacion]
   Como implementar: [pasos concretos]
   Esfuerzo estimado: [Bajo/Medio/Alto]
   Impacto esperado: [Bajo/Medio/Alto]

2. [Competidor B] — [Tactica: ej. "Serie de videos de casos de exito"]
   Por que funciona: [explicacion]
   Como implementar: [pasos concretos]
   Esfuerzo estimado: [Bajo/Medio/Alto]
   Impacto esperado: [Bajo/Medio/Alto]

[Continuar con 5-10 tacticas]
```

Centrate en tacticas que sean:

- Probadas (funcionan para el competidor)
- Adaptables (se pueden customizar para el objetivo)
- Infrautilizadas (el objetivo no las esta haciendo)

### 4.2 Estrategia de diferenciacion de mensaje

Segun el analisis, recomienda como debe diferenciarse el objetivo:

**Framework:**

1. **Categoria:** puede el objetivo crear o adueñarse de una sub-categoria? ("el [atributo] [categoria]")
2. **Audiencia:** puede adueñarse de un segmento que los competidores ignoran?
3. **Feature:** hay una capacidad unica que no tiene ningun competidor?
4. **Filosofia:** puede diferenciarse por valores, enfoque o metodologia?
5. **Experiencia:** puede diferenciarse por experiencia de cliente, soporte o comunidad?

Por cada angulo viable aporta:

- Positioning statement
- Recomendacion de titular
- Evidencia o proof points
- Como se manifestaria en la web

### 4.3 Estrategia de paginas de alternativa

Recomienda crear paginas tipo "[Competidor] alternativa":

**Por cada competidor principal esboza:**

```
PAGINA: [Marca objetivo] vs [Competidor]
URL: /vs/[competidor] o /alternativas/[competidor]

Titular: "Buscas una alternativa a [Competidor]? Esto es por lo que [X] equipos eligieron [Objetivo]."

Secciones:
  1. Tabla comparativa rapida (features, precios, ratings)
  2. Donde gana [Objetivo] (3-4 ventajas con evidencia)
  3. Donde gana [Competidor] (honesto, construye confianza)
  4. Para quien es mejor [Objetivo] (ICP)
  5. Historias de clientes que cambiaron
  6. Guia de migracion u oferta de switch
  7. FAQ sobre cambiar
  8. CTA: "Prueba [Objetivo] gratis" o "Mira como compara"
```

**Valor SEO:** estas paginas atacan busquedas de alta intencion como "[competidor] alternativas" y "[objetivo] vs [competidor]", que son bottom of funnel.

### 4.4 Narrativas de cambio

Crea una narrativa para quienes se plantean cambiar desde cada competidor:

```
NARRATIVA DE CAMBIO: [Competidor] -> [Objetivo]

Por que cambian:
  1. [Razon primaria segun mineria de resenas]
  2. [Razon secundaria]
  3. [Razon terciaria]

Plantilla de historia de cambio:
  "Como muchos [audiencia], [cliente] empezo con [Competidor] porque
   [atractivo inicial]. Tras [tiempo/evento], se dio cuenta de [dolor].
   Al cambiar a [Objetivo], consiguio [resultado concreto con numeros]."

Oferta de cambio:
  - Asistencia gratis con la migracion
  - Trial extendido para usuarios de [Competidor]
  - Precio equivalente o descuento
  - Onboarding dedicado para el cambio
```

---

## Fase 5: Monitorizacion continua

### 5.1 Checklist de monitorizacion

Recomienda actividades continuas:

- [ ] Configurar Google Alerts para cada competidor
- [ ] Seguir a los competidores en redes sociales
- [ ] Suscribirse a sus newsletters
- [ ] Revisar paginas de precios mensualmente
- [ ] Monitorizar sitios de resenas trimestralmente
- [ ] Seguir su publicacion de contenido (temas, frecuencia)
- [ ] Vigilar lanzamientos de producto y updates de features
- [ ] Monitorizar ofertas de empleo (revelan prioridades estrategicas)
- [ ] Seguir spend y creatividades (Meta Ad Library, Google Ads Transparency)
- [ ] Revisar perfiles de backlinks trimestralmente

### 5.2 Playbook de respuesta competitiva

Guia sobre como responder a movimientos del competidor:

| Movimiento del competidor      | Estrategia de respuesta                           | Plazo     |
| ------------------------------ | ------------------------------------------------- | --------- |
| Bajada de precios              | Enfatizar valor y calidad, no guerra de precios   | 1 semana  |
| Lanzamiento de feature         | Valorar relevancia, comunicar roadmap a clientes  | 2 semanas |
| Campana agresiva de ads        | Doblar apuesta en canales propios y retencion     | Continuo  |
| Contenido comparativo negativo | Crear comparativa factual y equilibrada           | 1 semana  |
| Ronda de funding / adquisicion | Reasegurar a clientes, enfatizar estabilidad      | 1-2 dias  |
| Resenas / quejas publicas      | Monitorizar oportunidades, abordar preocupaciones | Continuo  |

---

## Formato de salida: INFORME-COMPETIDORES.md

Escribe la salida completa en `INFORME-COMPETIDORES.md`:

```markdown
# Informe de inteligencia competitiva: [Marca objetivo]

**URL:** [url]
**Fecha:** [fecha actual]
**Competidores analizados:** [cuantos]
**Posicion competitiva: [Fuerte/Media/Debil]**

---

## Resumen ejecutivo

[3-4 parrafos: panorama, posicion del objetivo, mayor ventaja,
mayor amenaza, top 3 recomendaciones estrategicas]

---

## Resumen de competidores

### Directos

[Tabla con nombre, URL, posicionamiento, precios, diferenciador]

### Indirectos

[Tabla resumen]

### Aspiracionales

[Tabla resumen]

---

## Perfiles detallados

### [Competidor A]

[Analisis completo: mensaje, precios, features, SWOT, redes, resenas]

### [Competidor B]

[Analisis completo]

[Repetir]

---

## Tablas comparativas

### Comparativa de features

[Matriz completa]

### Comparativa de precios

[Matriz completa]

### Ratings de resenas

[Matriz de inteligencia de resenas]

### Presencia en redes

[Tabla comparativa]

---

## Mapa de posicionamiento

[Mapa visual con explicacion]

---

## Analisis SEO y content gaps

[Huecos de contenido, oportunidades de keywords, estrategia de paginas vs]

---

## SWOT — [Marca objetivo]

[SWOT agregado segun inteligencia]

---

## Recomendaciones estrategicas

### Tacticas robables

[5-10 tacticas con guia de implementacion]

### Estrategia de diferenciacion

[Angulos de posicionamiento recomendados]

### Paginas de alternativa a crear

[Paginas vs con esbozo]

### Narrativas de cambio

[Historias y ofertas por cada competidor principal]

---

## Plan de monitorizacion

[Checklist y playbook de respuesta]

---

## Siguientes pasos

1. [Accion mas critica]
2. [Segunda prioridad]
3. [Tercera prioridad]
```

---

## Salida por terminal

```
=== INFORME DE INTELIGENCIA COMPETITIVA ===

Objetivo: [nombre]
Competidores analizados: [cuantos]
Posicion competitiva: [Fuerte/Media/Debil]

Panorama:
  Directos:       [Comp A] (Rating: X/5), [Comp B] (Rating: X/5)
  Indirectos:     [Comp C], [Comp D]
  Aspiracionales: [Comp E]

Hallazgos clave:
  Mayor ventaja: [ventaja concreta]
  Mayor amenaza: [amenaza concreta]
  Mayor oportunidad: [oportunidad concreta]

Huecos de features: [X] features que tienen los competidores y el objetivo no
Huecos de contenido: [X] temas que cubren los competidores y el objetivo no
Posicion de precio: [Por encima/En la media/Por debajo] del mercado

Top 3 acciones:
  1. [accion]
  2. [accion]
  3. [accion]

Informe completo guardado en: INFORME-COMPETIDORES.md
```

---

## Integracion con otras skills

- Si existe `AUDITORIA-MARKETING.md`, referencia los scores de posicionamiento competitivo
- Si existe `COPY-SUGERENCIAS.md`, usa el analisis de mensaje para diferenciacion
- Si existe `ANALISIS-FUNNEL.md`, compara efectividad de funnel con competidores
- Si existe `CAMPANAS-ADS.md`, usa la inteligencia para angulos de ads
- Sugiere siguiente paso: `/marketing copy` para mensaje diferenciado, `/marketing ads` para ads competitivos, `/marketing funnel` para comparar conversion
