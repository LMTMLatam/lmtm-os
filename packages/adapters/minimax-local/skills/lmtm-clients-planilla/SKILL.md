---
name: lmtm-clients-planilla
displayName: Clientes y Planilla
description: Cómo consultar la planilla de clientes, statuses, retainer, contactos.
required: false
---

# Clientes y Planilla

## Modelo de datos

Cada cliente tiene:

- `id` (UUID)
- `slug` (URL-safe: `acme-corp`)
- `name` (nombre comercial: `Acme Corp`)
- `legalName` (razón social: `Acme S.A.`)
- `taxId` (CUIT: `30-12345678-9`)
- `status`: `active | paused | churned | onboarding`
- `tier`: `starter | standard | premium | enterprise`
- `monthlyRetainerCents` (en centavos de ARS o USD)
- `currency`: `ARS | USD`
- `ownerAgentId` (agente LMTM responsable)
- `primaryContactName`, `primaryContactEmail`, `primaryContactPhone`
- `industry`, `websiteUrl`
- `crmExternalId`, `planillaSource`, `planillaExternalId`
- `onboardedAt` (timestamp)

## Tiers y qué incluyen

| Tier | Retainer mensual (ARS) | Qué incluye |
|------|------------------------|-------------|
| `starter` | < 500k | 1 plataforma, 1 reporte mensual |
| `standard` | 500k–1.5M | 2 plataformas, 1 reporte semanal |
| `premium` | 1.5M–4M | 3-4 plataformas, 2 reportes semanales, dashboard |
| `enterprise` | > 4M | Custom, full team assigned, soporte dedicado |

## Cómo consultar

- `GET /api/clients?status=active` — lista de clientes activos
- `GET /api/clients/{id}` — detalle de un cliente
- `GET /api/clients/{id}/dashboard` — métricas agregadas

## Reglas

- **No** divulgar `monthlyRetainerCents` a clientes (es interno).
- **No** compartir datos de un cliente con otros (multi-tenancy estricta).
- Cliente en `paused` → no se generan reportes automáticos.
- Cliente en `churned` → no se asignan tareas nuevas, solo lectura.
- Cliente en `onboarding` → solo C1 (no existe) puede tocar.
