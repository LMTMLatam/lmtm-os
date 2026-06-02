---
name: lmtm-dashboard-design
displayName: Dashboard design
description: Principios para dashboards de marketing: jerarquía, KPIs, alertas, evitar anti-patterns.
required: false
---

# Dashboard design

Un dashboard responde **una pregunta principal**. Si no sabés cuál
es, no construyas el dashboard.

## La pirámide de jerarquía

```
              ┌────────────────────┐
              │   North Star KPI   │  ← 1 número, top-center
              └────────┬───────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
   ┌────┴────┐                  ┌─────┴────┐
   │  Funnel │                  │ Channel  │  ← 3-5 charts secundarios
   │  stage  │                  │ mix      │
   └────┬────┘                  └─────┬────┘
        │                             │
   ┌────┴────────────────────────────┴────┐
   │         Tabla detallada               │  ← drill-down data
   └───────────────────────────────────────┘
```

**Top**: 1 número, el más importante. Revenue, MRR, ROAS.
**Medio**: 3-5 charts que muestran el "cómo" del top.
**Bottom**: tabla con el detalle para drill-down.

## Los 5 KPIs típicos de un dashboard de marketing

1. **Revenue / Spend** (top, big number)
2. **ROAS** (ratio)
3. **CAC** (costo de adquisición)
4. **LTV** (lifetime value)
5. **Payback period** (meses para recuperar CAC)

Si tenés esos 5, tenés el 80% de lo que el CEO/cliente quiere ver.

## Reglas de layout

### 1. F-pattern

Los ojos leen en F. **Lo más importante arriba a la izquierda**,
no donde "queda lindo".

```
[ North Star ] [ Secondary 1 ] [ Secondary 2 ]
[────── Chart principal ──────]
[Chart 2 ] [ Chart 3 ]
[────── Tabla ──────]
```

### 2. Una unidad por chart

- Revenue: USD.
- Spend: USD.
- Conversion: %.
- No mezcles USD y % en el mismo eje Y. Usá dual axis solo si es
  estrictamente necesario.

### 3. Colores con significado

- **Rojo**: alerta (un KPI bajo de su target).
- **Verde**: bien.
- **Gris**: neutral.
- **Azul/marca**: identidad.
- **NO** cada barra de un color distinto. Eso es Excel 2003.

### 4. Comparación contra referencia

Cada número debe tener:
- **Valor actual** (big).
- **Comparación** (vs. semana pasada, vs. mes pasado, vs. target).
- **Tendencia** (sparkline o flecha).
- **Sin esto**, el número está aislado y el usuario no sabe si es
  bueno o malo.

## Tipos de charts: cuándo cada uno

| Querés mostrar | Usá |
|----------------|-----|
| Evolución en el tiempo | Line chart |
| Comparación entre categorías | Bar chart (horizontal si labels largos) |
| Distribución de una variable | Histogram |
| Parte del todo | Stacked bar (no pie) |
| Correlación entre 2 variables | Scatter |
| Geográfico | Map (choropleth) |
| Performance contra target | Bullet chart |

### Anti-patterns de charts

- **Pie chart con > 4 slices**: ilegible.
- **3D**: nunca. Nada de 3D en datos.
- **Doble axis**: confuso. Solo si los dos están en la misma unidad.
- **Y axis que no empieza en 0** (en bar charts): manipula la
  percepción.
- **Demasiados colores**: cada color tiene que significar algo.

## Filtros

Top-right, siempre visibles:
- **Date range** (siempre).
- **Client** (si es multi-tenant).
- **Platform** (Meta vs Google).
- **Campaign** (drill-down).

**Defaults razonables**: últimos 30 días, all clients (si es
global), all platforms. El usuario los cambia si quiere.

## Alertas vs dashboards

**Dashboard**: mirar proactivamente.
**Alertas**: que te avisen cuando algo rompe.

| Caso | Solución |
|------|----------|
| ROAS cayó 30% vs semana pasada | Alerta a Slack/email |
| CTR > 2% (bien) | Dashboard, no alerta |
| CPA > target por 3 días | Alerta |
| Nuevos clientes hoy | Dashboard, al final del día |

**No** pongas todo en alertas. El cliente aprende a ignorarlas.

## Performance de carga

- **< 2s para cargar** un dashboard. Si tarda más, el cliente no
  lo abre.
- **Pre-aggregar** en una tabla o materialized view diaria.
- **Caché** resultados de queries pesadas (5-15 min es suficiente
  para marketing).
- **No** hacer N+1 queries. Una query que retorna todo, no 50
  queries.

## Storytelling

Un dashboard no es solo data, es **una historia que el cliente
entiende en 30 segundos**.

- **Title del dashboard**: una afirmación, no un tema.
  - ❌ "Reporte de marketing Q1"
  - ✅ "Q1 cerramos 12% arriba del target. ROAS promedio 4.2x"
- **Comentarios/anotaciones**: en gráficos, marcá eventos
  importantes (lanzamiento, cambio de estrategia, día de promo).
- **Sección de "qué hacer"**: no es solo data, es **recomendaciones**.

## Tooling

- **Looker / Metabase / Mode**: SQL-based, flexible.
- **Tableau / Power BI**: visual, más caro.
- **Mixpanel / Amplitude**: para producto (no marketing).
- **Google Data Studio (Looker Studio)**: free, basic, para
  clientes chicos.
- **Custom build (React + Recharts/D3)**: cuando necesitás algo
  que las herramientas anteriores no hacen (ej. branding, embed).

**Para LMTM-OS**: empezamos con un custom build en React sobre
nuestra API. Si el cliente quiere Looker, lo conectamos después.
