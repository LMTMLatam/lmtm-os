---
name: marketing-informe-pdf
displayName: Informe PDF
description: Generación de informes de marketing en PDF con diseño profesional: estructura, gráficos y export. Usala cuando el entregable es un PDF.
required: false
---

# Generador de Informe de Marketing en PDF

## Proposito de la skill

Generar un informe de marketing profesional y visualmente cuidado en PDF usando el script Python `scripts/generar_informe_pdf.py`. La skill recoge toda la data disponible de auditorias, la estructura en el JSON esperado, invoca el script y produce un PDF con marca, medidores de score, barras, tablas comparativas, hallazgos y plan de accion priorizado.

## Cuando usarla

- El usuario quiere version PDF del informe (no solo Markdown)
- El usuario prepara un entregable para presentacion a cliente
- El usuario pide un informe "pulido", "listo para cliente" o en PDF
- Se activa con `/marketing informe-pdf` o `/marketing informe-pdf <dominio>`

## Cuando usar PDF vs Markdown

| Formato      | Mejor para                                                   | Pros                                                          | Contras                                |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------- |
| **PDF**      | Presentaciones a cliente, adjunto en email, sales collateral | Aspecto profesional, formato consistente, graficos, printable | Mas dificil de editar, requiere script |
| **Markdown** | Uso interno, referencia rapida, edicion iterativa, git       | Facil de editar, legible en cualquier editor, git-friendly    | Menos pulido visual, sin graficos      |

**Regla:** si el informe va a cliente o prospecto, usa PDF. Para interno o edicion posterior, Markdown.

## Como ejecutarla

### Paso 1: Recoger toda la data disponible

Revisa archivos de skills previas en el directorio del proyecto:

**Fuentes primarias:**

- `AUDITORIA-MARKETING.md` — auditoria global
- `LANDING-CRO.md` — analisis CRO
- `AUDITORIA-SEO.md` — hallazgos SEO
- `VOZ-MARCA.md` — analisis de voz de marca
- `INFORME-COMPETIDORES.md` — comparativa competitiva
- `ANALISIS-FUNNEL.md` — analisis de funnel
- `CALENDARIO-REDES.md` — auditoria de redes
- `SECUENCIAS-EMAIL.md` — auditoria de email
- `CAMPANAS-ADS.md` — auditoria de ads

**Si no hay data previa:**

1. Recomienda ejecutar antes `/marketing auditoria <url>`
2. Si el usuario insiste, analiza la URL directamente y construye la data desde cero
3. Usa `scripts/analizar_pagina.py` para recoger datos automaticos: `python3 scripts/analizar_pagina.py <url>`

### Paso 2: Construir la estructura JSON

El script `scripts/generar_informe_pdf.py` espera un JSON con esta estructura exacta:

```json
{
  "url": "https://ejemplo.com",
  "date": "1 de marzo de 2026",
  "brand_name": "Ejemplo S.L.",
  "overall_score": 62,
  "executive_summary": "Resumen de 2-4 frases sobre salud de marketing, oportunidades clave e impacto estimado de implementar las recomendaciones.",
  "categories": {
    "Contenido y Mensaje": {
      "score": 68,
      "weight": "25%"
    },
    "Optimizacion de Conversion": {
      "score": 52,
      "weight": "25%"
    },
    "SEO y Descubrimiento": {
      "score": 74,
      "weight": "15%"
    },
    "Posicionamiento Competitivo": {
      "score": 48,
      "weight": "15%"
    },
    "Marca y Confianza": {
      "score": 70,
      "weight": "10%"
    },
    "Crecimiento y Estrategia": {
      "score": 55,
      "weight": "10%"
    }
  },
  "findings": [
    {
      "severity": "Critico",
      "finding": "Descripcion del hallazgo mas importante"
    },
    {
      "severity": "Alto",
      "finding": "Descripcion de hallazgo de alta prioridad"
    },
    {
      "severity": "Medio",
      "finding": "Descripcion de hallazgo de prioridad media"
    },
    {
      "severity": "Bajo",
      "finding": "Descripcion de hallazgo menor"
    }
  ],
  "quick_wins": ["Primer quick win", "Segundo quick win", "Tercer quick win"],
  "medium_term": [
    "Primera accion medio plazo",
    "Segunda accion medio plazo",
    "Tercera accion medio plazo"
  ],
  "strategic": [
    "Primera accion estrategica",
    "Segunda accion estrategica",
    "Tercera accion estrategica"
  ],
  "competitors": [
    {
      "name": "Competidor A",
      "positioning": "Posicion en el mercado",
      "pricing": "Modelo de pricing",
      "social_proof": "Senales de confianza",
      "content": "Enfoque de contenido"
    },
    {
      "name": "Competidor B",
      "positioning": "Posicion en el mercado",
      "pricing": "Modelo de pricing",
      "social_proof": "Senales de confianza",
      "content": "Enfoque de contenido"
    }
  ]
}
```

### Paso 3: Guia campo a campo

#### `url` (string, obligatorio)

URL completa con protocolo.

#### `date` (string, obligatorio)

Fecha de generacion. Formato: "DD de Mes de AAAA" (ej. "1 de marzo de 2026").

#### `brand_name` (string, obligatorio)

Nombre de la empresa/marca. Aparece en headers de la tabla competitiva.

#### `overall_score` (entero, 0-100, obligatorio)

Media ponderada de las 6 categorias. Calculo:

```
overall_score = (contenido * 0,25) + (conversion * 0,25) + (seo * 0,15) + (competitivo * 0,15) + (marca * 0,10) + (crecimiento * 0,10)
```

**Justificacion de pesos:** priorizamos conversion sobre SEO porque la mayoria de webs B2B en Espana viven de trafico de pago + outbound, no de SEO organico.

#### `executive_summary` (string, obligatorio)

2-4 frases cubriendo:

- Estado actual del marketing
- Top 1-2 hallazgos de mayor impacto
- Impacto estimado en ingresos de implementar
- Primer paso recomendado

Breve y potente. Aparece en portada debajo del gauge.

#### `categories` (object, obligatorio)

Exactamente 6 categorias:

| Categoria                   | Que mide                                                                                       | Guia de scoring                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Contenido y Mensaje         | Calidad de copy, value prop, claridad de headline, texto de CTAs, consistencia de voz de marca | 80+: claro, orientado a beneficio, especifico. 60-79: correcto pero generico. <60: vago, feature-focused |
| Optimizacion de Conversion  | Social proof, formularios, ubicacion de CTAs, gestion de objeciones, urgencia                  | 80+: multiples pruebas, forms optimizados, CTAs claros. 60-79: algunos elementos. <60: faltan criticos   |
| SEO y Descubrimiento        | Titles, meta, headers, schema, linking interno, velocidad                                      | 80+: optimizado. 60-79: presente con gaps. <60: issues mayores o ausencias                               |
| Posicionamiento Competitivo | Diferenciacion, transparencia de pricing, contenido comparativo, conciencia de mercado         | 80+: posicion clara, comparativas. 60-79: algo de diferenciacion. <60: sin posicionamiento               |
| Marca y Confianza           | Calidad de diseno, trust badges, indicadores de seguridad, aspecto profesional                 | 80+: diseno moderno, senales de confianza. 60-79: diseno correcto. <60: desfasado                        |
| Crecimiento y Estrategia    | Captura de leads, email marketing, estrategia de contenido, canales de adquisicion             | 80+: estrategia multicanal. 60-79: algunos canales activos. <60: sin estrategia clara                    |

#### `findings` (array, obligatorio)

Array de hallazgos con `severity` y `finding`.

**Niveles de severidad:**

- `Critico` — perdida directa de ingresos o clientes. Corregir ya.
- `Alto` — impacto significativo en crecimiento. 1-2 semanas.
- `Medio` — oportunidad relevante. 1 mes.
- `Bajo` — nice-to-have. Cuando haya tiempo.

**Como escribir hallazgos efectivos:**

- Concreto: "El headline de home dice 'Bienvenido a nuestra plataforma'" no "el headline necesita mejora"
- Cuantifica: "Faltan meta descriptions en 8 de 12 landings"
- Usa benchmarks: "Tiempo de carga 4,2s (benchmark: <2s)"
- Incluye evidencia: "Sin testimonios en home, pricing ni signup"

5-10 hallazgos. Ordena de mas a menos severo.

#### `quick_wins` (array, obligatorio)

3-5 acciones ejecutables en una semana con esfuerzo minimo. Cada una concreta y accionable.

**Buen quick win:** "Reescribir el headline de home de 'Bienvenido a nuestra plataforma' a 'Reduce tu tiempo de reporting un 75% — analytics automatico para equipos de growth'"

**Mal quick win:** "Mejorar el headline" (demasiado vago)

#### `medium_term` (array, obligatorio)

3-5 acciones de 1-3 meses.

#### `strategic` (array, obligatorio)

3-5 acciones de 3-6 meses. Cambios de fundacion.

#### `competitors` (array, opcional)

Hasta 3 competidores para la tabla comparativa. Si no hay data, omite el campo y el script se salta la seccion.

### Paso 4: Guardar el JSON

Escribe la data en un fichero JSON temporal:

```bash
cat > /tmp/datos_informe.json << 'JSONEOF'
{
  ... JSON ensamblado ...
}
JSONEOF
```

### Paso 5: Invocar el generador de PDF

**Check de requisitos:**
Verifica que `reportlab` esta instalado:

```bash
python3 -c "import reportlab" 2>/dev/null || pip3 install reportlab
```

**Generar el informe:**

```bash
python3 scripts/generar_informe_pdf.py /tmp/datos_informe.json "INFORME-MARKETING-<dominio>.pdf"
```

Sustituye `<dominio>` por el dominio del cliente (sin protocolo ni www), usando guiones en vez de puntos. Ejemplos:

- `ejemplo.com` -> `INFORME-MARKETING-ejemplo-com.pdf`
- `miapp.io` -> `INFORME-MARKETING-miapp-io.pdf`

**Modo demo (sin argumentos):**
Ejecutar el script sin argumentos genera un informe de ejemplo con placeholders:

```bash
python3 scripts/generar_informe_pdf.py
# Genera: INFORME-MARKETING-ejemplo.pdf
```

### Paso 6: Verificar el output

Comprueba que el PDF se genero:

```bash
ls -la "INFORME-MARKETING-<dominio>.pdf"
```

Reporta la ruta y el tamano al usuario.

### Paso 7: Limpieza

Borra el JSON temporal:

```bash
rm /tmp/datos_informe.json
```

## Contenido del PDF

El PDF generado incluye:

### Pagina 1: Portada

- Titulo: "Informe de Auditoria de Marketing"
- URL objetivo
- Fecha de generacion
- Gauge con score global (visualizacion circular con color)
- Letra de calificacion (A+ hasta F)
- Parrafo de resumen ejecutivo

### Pagina 2: Desglose de scores

- Barra horizontal con las 6 categorias y color
- Tabla con nombre, score, peso y estado
- Colores: verde (80+), azul (60-79), amarillo (40-59), rojo (<40)

### Pagina 3: Hallazgos clave

- Tabla con severidad y descripcion
- Indicadores de severidad por color (Critico=rojo, Alto=naranja, Medio=amarillo, Bajo=azul)
- Ordenados de mas a menos severo

### Pagina 4: Plan de accion priorizado

- Quick Wins (esta semana)
- Medio plazo (1-3 meses)
- Estrategicas (3-6 meses)
- Items numerados en cada tier

### Pagina 5: Panorama competitivo (si hay data)

- Tabla comparativa cliente vs hasta 3 competidores
- Filas: Posicionamiento, Pricing, Social Proof, Contenido

### Pagina final: Metodologia

- Explicacion de scoring
- Pesos y criterios
- Footer: "Generado con Marketing Claude Code"

## Paleta de colores

Paleta profesional del PDF:

| Elemento                       | Color       | Hex     |
| ------------------------------ | ----------- | ------- |
| Primario (headers, titulos)    | Azul oscuro | #1B2A4A |
| Acento (enlaces, highlights)   | Azul        | #2D5BFF |
| Highlight (atencion)           | Naranja     | #FF6B35 |
| Exito (scores altos)           | Verde       | #00C853 |
| Advertencia (scores medios)    | Ambar       | #FFB300 |
| Danger (scores bajos, critico) | Rojo        | #FF1744 |
| Fondo claro                    | Gris claro  | #F5F7FA |
| Texto body                     | Gris oscuro | #2C3E50 |
| Texto secundario               | Gris medio  | #7F8C9B |
| Bordes                         | Borde claro | #E0E6ED |

## Mapeo score-color

- 80-100: Verde (#00C853) — performance solida
- 60-79: Azul (#2D5BFF) — correcta con margen
- 40-59: Ambar (#FFB300) — requiere atencion
- 0-39: Rojo (#FF1744) — critico

## Troubleshooting

| Issue                                              | Solucion                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ModuleNotFoundError: No module named 'reportlab'` | `pip3 install reportlab`                                                                              |
| Script genera PDF vacio                            | Revisa que el JSON tiene todos los campos obligatorios                                                |
| Gauge no renderiza                                 | `overall_score` debe ser un numero 0-100                                                              |
| Tabla de competidores ausente                      | Asegura que `competitors` tiene `name`, `positioning`, `pricing`, `social_proof`, `content`           |
| PDF de una sola pagina                             | Revisa errores de parseo JSON: `python3 -c "import json; json.load(open('/tmp/datos_informe.json'))"` |
| Fuentes raras                                      | El script usa Helvetica (nativa de reportlab). Sin fuentes custom.                                    |

## Integracion con otras skills

Mejor workflow combinado:

1. `/marketing auditoria <url>` — data de auditoria completa
2. `/marketing competidores <url>` — data comparativa
3. `/marketing seo <url>` — hallazgos SEO detallados
4. `/marketing landing <url>` — analisis CRO
5. `/marketing informe-pdf <url>` — compila todo en PDF

La skill del PDF busca automaticamente los outputs de estas skills e incorpora la data al JSON.

## Output

- **Archivo:** `INFORME-MARKETING-<dominio>.pdf`
- **Ubicacion:** raiz del proyecto
- **Tamano tipico:** 200-500 KB segun contenido
- **Paginas:** 5-7 segun datos de competidores y extras

## Principios clave

- El PDF es el entregable mas orientado a cliente del toolkit. La calidad importa.
- Verifica que el JSON esta completo y correcto antes de generar. Basura dentro, basura fuera.
- Usa el PDF para primeras impresiones y conversaciones de venta. El Markdown va despues para detalles.
- Todo score debe ser justificable. Si el cliente pregunta "por que saco 52 en Conversion", los hallazgos tienen que explicarlo.
- Redondea a enteros. Los decimales fingen precision.
- Resumen ejecutivo ajustado: 2-4 frases maximo. Los decisores solo escanean.
- Si es para prospecto, el informe es herramienta de venta. Oportunidades compelling, plan alcanzable.
