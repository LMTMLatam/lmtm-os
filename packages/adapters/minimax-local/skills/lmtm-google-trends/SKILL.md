---
name: lmtm-google-trends
displayName: Google Trends research
description: Cómo usar Google Trends para validar demanda estacional, comparar keywords, detectar tendencias emergentes.
required: false
---

# Google Trends

Google Trends muestra el interés relativo de búsqueda en el tiempo, no
volúmenes absolutos. Es ideal para:

1. **Validar estacionalidad** (¿cuándo arranca el interés?).
2. **Comparar términos** (¿"marketing digital" vs "publicidad online"?).
3. **Detectar emergentes** (queries que crecen rápido).
4. **Benchmarking geográfico** (¿qué país/región busca más?).

## Lectura correcta

- **Y axis = 0–100 relativo**, no absolutos. 100 = pico del período
  seleccionado.
- **Comparás curvas, no valores puntuales**.
- **Si subís el zoom (período corto)**, la curva es más ruidosa.
  Para detectar estacionalidad: 5 años. Para detectar emergente: 90
  días.

## Workflow típico

### 1. Validar estacionalidad de una categoría

```
trends.interest_over_time({
  terms: ["piscina", "pileta", "piscina inflable"],
  geo: "AR",
  time_range: "today 5-y"
})
```

Mirás: ¿hay pico en noviembre-marzo (verano)? ¿Cuándo arranca a
subir? ¿Cuándo baja?

### 2. Comparar keywords para SEO/Ads

```
trends.interest_over_time({
  terms: ["zapatillas running", "tenis para correr", "calzado deportivo"],
  geo: "AR"
})
```

Cruzás con **Keyword Planner** (volumen absoluto) para tener las dos
señales.

### 3. Detectar tendencia emergente

```
trends.interest_over_time({
  terms: ["shorts", "reels", "tiktok"],
  geo: "AR",
  time_range: "today 3-m"
})
```

Si una curva sube > 3x en 90 días y la otra está flat → emergente.

### 4. Geolocalización

```
trends.interest_by_region({
  terms: ["empresa de marketing"],
  geo: "AR"
})
```

Te dice qué provincia busca más. Útil para pauta geo-targeted.

## Reglas

- **No** usar para comparar categorías con audiencias muy distintas
  (ej. "viajes" vs "software empresarial") — el "100" significa
  cosas distintas.
- **Sí** usar para validar una decisión grande (ej. ¿metemos pauta
  en esta categoría en Q4?).
- **Sí** cruzar con datos de negocio antes de actuar. Trends no
  convierte, solo valida demanda.
- **No** tomar como señal única. Es un input más en el análisis.
