---
name: lmtm-statistics
displayName: Statistics for marketers
description: Significance, sample size, confidence intervals, A/B testing básico.
required: false
---

# Statistics for marketers

No necesitás ser estadístico. Pero sí necesitás **no mentirle al
cliente** y **no tomar decisiones con datos ruidosos**.

## Significance: ¿es real la diferencia?

Cuando A tiene 4.2% conversion y B tiene 4.5%, ¿es A peor que B o
fue ruido?

### P-value

Probabilidad de ver esta diferencia (o mayor) si en realidad no
hay diferencia. **p < 0.05** = convencionalmente "significativo".

**Pero** p < 0.05 no significa "efecto grande", solo "es poco
probable que sea puro ruido".

### Confidence interval (CI)

Rango donde el valor "real" probablemente está. Si A = 4.2% ± 1.2%
y B = 4.5% ± 2.0%, los intervalos se superponen → no podés
asegurar que B es mejor.

**Reporting format**:
> "Conversion rate: A 4.2% (CI 3.0-5.4), B 4.5% (CI 2.5-6.5).
>  Diferencia NO significativa (p=0.34)."

## Sample size

¿Cuántas observaciones necesitás para detectar una diferencia X%?

Fórmula simplificada (para conversion rate):

```
n = (Z_α/2 + Z_β)² × (p1(1-p1) + p2(1-p2)) / (p1 - p2)²
```

Z_α/2 = 1.96 (95% confidence)
Z_β = 0.84 (80% power)

**Para marketeros**: usar una calculadora online. No recalcular
a mano.

Reglas:
- **Conversion rate baseline 3%, detectar 20% relative lift** (3.0%
  → 3.6%): ~10.000 visitors por variant.
- **Conversion rate baseline 10%, detectar 10% relative lift**
  (10% → 11%): ~14.000 visitors por variant.
- **Si la diferencia es chica y la muestra chica, esperá**.

## A/B testing: las reglas

### Setup

- **2 variants, mismo tiempo, misma audiencia** (split
  determinístico, ej. `user_id % 2`).
- **NO** parar antes de tiempo.
- **NO** mirar resultados antes de llegar a sample size mínimo.
- **SÍ** un solo cambio a la vez (A=control, B=solo cambia CTA).

### Cuándo parar

- Llegaste al sample size predefinido.
- P-value < 0.05 y diferencia > MDE (minimum detectable effect)
  predefinido.
- **Stop early solo** si el efecto es tan grande que el CI excluye
  el 0 incluso en la mitad del experimento (sequential testing).
  Casi siempre, mejor esperar.

### Errores comunes

- **Peeking**: mirar el resultado cada día. Cada vez que mirás,
  aumenta el false positive rate.
- **Múltiples variants**: 5 variants = multiplicás el false positive
  rate. Bonferroni: dividir p-value threshold por número de variants.
- **Segments post-hoc**: "funciona en mobile iOS de 25-34 de CABA".
  Eso es data dredging.
- **Cambiar la métrica primary mid-test**: invalidás todo.

## Métricas: promedios vs distribuciones

**Promedio oculta todo**. Si 1000 usuarios convierten a 4.5%, puede
ser:
- Caso A: todo el mundo convierte 4-5%. Real.
- Caso B: 1% convierte 50%, 99% convierte 3.5%. La mediana es 3.5%,
  el promedio 4.5%. **No es lo mismo**.

**Siempre mirá**:
- **Media + mediana**.
- **Distribución** (histograma, percentiles).
- **P95, P99** para detectar outliers.

## Outliers

Un usuario que gastó USD 50k distorsiona todo. Opciones:

- **Winsorizar**: cambiar el top 1% al P99. Distorsión mínima.
- **Truncar**: excluir el top 1%. Más conservador.
- **Reportar con y sin outliers**: transparencia.
- **NO** reportar solo con outliers: el cliente no entiende por qué
  el LTV promedio es 10x la mediana.

## Correlación vs causalidad

- **Correlación**: A y B suben juntos. No implica causalidad.
- **Causalidad**: cambiar A cambia B. Requiere experimento (A/B) o
  instrumento.

Ejemplo: "Los días con más gasto en Meta, más ventas." ¿Gastar más
causa más ventas, o ambos suben en节假日 (holidays)?

**A/B test** para aislar causalidad. **Correlación** es hipótesis,
no prueba.

## Reglas prácticas

- **Sample size > 1000 por variant** en casi todo lo digital.
- **Esperar 7-14 días** aunque llegue a sample size, para cubrir
  weekly seasonality.
- **Reportar p-value + effect size + CI**, no solo p-value.
- **Un test, una pregunta**. Si querés testear CTA y color, son
  2 tests.
- **NUNCA** decir "significativo" sin el CI. Decir "lift de 12%
  con 95% CI [2%, 22%]" es honesto.
- **NO** confundir "no significativo" con "no hay efecto". Puede
  haber efecto, pero no tenés data para detectarlo.
