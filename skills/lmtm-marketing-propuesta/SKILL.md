---
name: lmtm-marketing-propuesta
description: >
  Generador de propuestas comerciales para LMTM cuando un prospecto
  quiere contratar servicios. Personalizable por tipo de servicio (Paid
  Media, Growth, Branding, Web, Producción, etc.), modelo comercial
  (fee mensual, proyecto, performance, retainer híbrido) y tipo de
  cliente (PyME, expansión, B2B, e-commerce). Usar cuando se pida
  "armame una propuesta", "cotización para cliente", "presupuesto",
  "oferta comercial", "propuesta de servicios", "contrato para".
  NO usar para términos y condiciones legales (eso lo revisa el legal
  team de LMTM).
---

# LMTM Marketing Propuesta

Generador de propuestas comerciales. Pensado para que un estratega de
LMTM la arme en <30 minutos con un prospecto en la mesa.

## Estructura estándar (10 secciones)

1. **Resumen ejecutivo** (½ página)
   - Quién es el prospecto
   - Qué necesita
   - Qué propone LMTM
   - Por qué LMTM (diferenciador)
2. **Contexto y diagnóstico**
   - Lo que LMTM encontró en la auditoría / discovery
   - Problemas principales
   - Oportunidades clave
3. **Objetivos** (SMART)
   - Métricas de éxito a 30/60/90 días
   - KPIs por objetivo
4. **Estrategia propuesta**
   - Enfoque general
   - Fases de implementación
   - Quick wins vs quick wins estructurales
5. **Servicios incluidos** (alcance detallado)
   - Listar cada servicio con entregable y frecuencia
   - Marcar qué está dentro y qué no (out of scope)
6. **Plan de trabajo** (timeline visual)
   - Mes 1: setup, baseline, lanzamiento
   - Mes 2-3: optimización, iteración
   - Mes 4+: escala, expansión
7. **Equipo asignado**
   - Roles (no nombres necesariamente)
   - Horas dedicadas
   - Reuniones recurrentes (qué, cuándo, con quién)
8. **Inversión y modelo comercial**
   - Fee mensual / proyecto / performance / híbrido
   - Detalle de qué incluye cada línea
   - Forma de pago
   - Revisión de fee por hito
9. **KPIs y reporting**
   - Qué se reporta y con qué frecuencia
   - Acceso a dashboards (LMTM-OS, Looker, etc.)
   - Reuniones de revisión (semanal, mensual, trimestral)
10. **Términos comerciales básicos**
    - Duración del contrato
    - Período de prueba (si aplica)
    - Cancelación y preaviso
    - Confidencialidad
    - Propiedad intelectual de entregables

## Procedimiento

1. **Recolectar** del CRM / discovery call:
   - Nombre del prospecto, industria, tamaño
   - Necesidad principal
   - Servicios que se ajustan
   - Budget range (si se conoce)
   - Decisor y proceso de compra
2. **Elegir template** base según tipo de servicio:
   - Paid Media
   - Growth Marketing (mixto)
   - Branding
   - Web & Ecommerce
   - Producción Multimedia
   - Full 360° (varios servicios)
3. **Personalizar** cada sección con el contexto del prospecto
4. **Cuantificar** objetivos y entregables (no "mejorar el SEO" sino
   "alcanzar top 3 en 5 keywords prioritarias en 90 días")
5. **Pricing**: usar el modelo comercial correcto:
   - Fee mensual fijo (predecible, para retainer largo)
   - Fee por proyecto (alcance cerrado, ej: branding)
   - Performance + fee (CPA, % de revenue)
   - Híbrido (fee base + variable por performance)
6. **Validar margen**: target LMTM es 40-60% gross margin en fee,
   revisar con finance antes de enviar
7. **Generar PDF** profesional con branding LMTM vía
   `lmtm-marketing-informe-pdf` o `scripts/generar_informe_pdf.py`

## Personalización por industria

- **E-commerce**: foco en revenue, ROAS, AOV, LTV
- **B2B SaaS**: foco en MQLs, SQLs, pipeline generado
- **Servicios profesionales**: foco en leads calificados, conversión a
  cita
- **Retail físico**: foco en tráfico a tienda, ventas en local
- **Educación / cursos**: foco en inscripciones, completion rate
- **Salud / bienestar**: foco en citas, consultas, adherencia

## Salida esperada

- PDF profesional listo para enviar al cliente
- Versión editable (.md) para iterar
- Deck complementario si la presentación es en persona
- Email de cover con talking points para la reunión de cierre
- Lista de objeciones probables + respuestas
