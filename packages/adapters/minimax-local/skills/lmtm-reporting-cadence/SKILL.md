---
name: lmtm-reporting-cadence
displayName: Cadencia y formato de reportes
description: Qué se reporta, cuándo, en qué formato, a quién, con qué nivel de detalle.
required: false
---

# Cadencia y formato de reportes

## Reportes semanales (clientes tier standard+)

**Cuándo**: lunes 9:00 AM, semana siguiente.
**A quién**: `primaryContactEmail` del cliente + CEO de LMTM.
**Formato**: HTML email + link al dashboard del cliente.

**Contenido** (orden):
1. Resumen ejecutivo: 3 bullets con las 3 cosas más importantes.
2. Spend vs budget: cuánto se gastó vs cuánto se planeó.
3. Performance por plataforma (tabla): spend, impressions, clicks, CTR,
   CPC, conversions, CPA, ROAS.
4. Top 3 campañas (por ROAS o volumen, según objetivo).
5. Bottom 3 campañas (para revisar).
6. Acciones tomadas esta semana (optimizaciones, pausas, scale-ups).
7. Acciones planeadas semana próxima.
8. Riesgos / cosas que necesitan decisión del cliente.

**Reglas**:
- **No** mostrar jargon sin explicar (CTR = click-through rate, etc).
- **Sí** mostrar el resultado del cliente ($$$), no solo métricas de vanidad.
- **Sí** comparar vs semana anterior y vs mismo período mes anterior.
- **No** llenar de tablas. Máximo 2 tablas, el resto en bullets claros.

## Reportes mensuales (todos los clientes activos)

**Cuándo**: primer día hábil del mes, 9:00 AM.
**A quién**: `primaryContactEmail` + CEO de LMTM + equipo LMTM.
**Formato**: PDF descargable + dashboard actualizado.

**Contenido** (orden):
1. Executive summary (1 página, las 5 cosas más importantes).
2. Performance consolidado del mes (4 plataformas en 1 vista).
3. Tendencia mes a mes (gráfico de 12 meses).
4. Top 10 anuncios creativos (con métricas).
5. Top 10 audiencias (con métricas).
6. Search terms / keywords top (Google).
7. Análisis de funnel: impressions → clicks → leads → ventas.
8. CAC vs LTV (si tenemos data del CRM).
9. Recomendaciones priorizadas para el mes próximo.
10. Próximos hitos del plan de medios.

## Reportes ad-hoc (cuando se piden)

- **Investigación de caída de performance**: cuando ROAS cae >20% WoW.
- **Investigación de创意 que funciona**: cuando algo supera 2x el target.
- **Análisis de competencia**: trimestral o cuando se pide.
- **Auditoría de cuenta**: cuando un cliente se queda / se va.

## Distribución

- **Siempre** copiar al CEO de LMTM (auditoría).
- **Sí** incluir al account manager humano si existe.
- **No** incluir datos de otros clientes en el mismo email.

## Reglas críticas

- **No** enviar reporte con datos rotos o NaN. Mejor retrasar 1 día.
- **No** minimizar problemas. Si ROAS cayó, decirlo claramente y
  proponer plan.
- **Sí** dar crédito a las optimizaciones que funcionaron.
- **Sí** mencionar budget quemado, no solo invertido.
