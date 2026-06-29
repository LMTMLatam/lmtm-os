---
name: lmtm-clients-planilla
displayName: Modelo de cliente
description: Qué campos tiene un cliente LMTM y cómo consultarlo (vía tools, no hay planilla externa).
required: false
---

# Modelo de cliente LMTM

> No existe ninguna "planilla" ni CRM externo como fuente de datos. Los clientes
> viven en la DB de LMTM-OS y se consultan con las tools `lmtm*`. Los datos
> operativos de cada cliente salen SOLO de: Meta (tools lmtm*), la memoria/brain
> del cliente, y el Enfoque Técnico.

## Campos de un cliente

- `id` (UUID) · `slug` (`acme-corp`) · `name` (`Acme Corp`) · `legalName` · `taxId`
- `status`: `active | paused | churned | onboarding`
- `tier`: `starter | standard | premium | enterprise`
- `monthlyRetainerCents` (centavos) · `currency`: `ARS | USD`
- `ownerAgentId` (agente responsable)
- `primaryContactName`, `primaryContactEmail`, `primaryContactPhone`
- `industry`, `websiteUrl`, `onboardedAt`

## Tiers

| Tier | Retainer (ARS) | Incluye |
|------|----------------|---------|
| `starter` | < 500k | 1 plataforma, 1 reporte mensual |
| `standard` | 500k–1.5M | 2 plataformas, 1 reporte semanal |
| `premium` | 1.5M–4M | 3-4 plataformas, 2 reportes semanales, dashboard |
| `enterprise` | > 4M | Custom, full team, soporte dedicado |

## Cómo consultar

- **Lista de clientes** → `lmtmListClients` (no `GET /api/...`).
- **Contexto / memoria / Enfoque Técnico de un cliente** → `lmtmGetClientBrain`.
- **Performance / saldo / orgánico / programado** → las tools `lmtmGetClient*` (ver `lmtm-tool-reference`).

## Reglas

- **No** divulgar `monthlyRetainerCents` a clientes (es interno).
- **No** compartir datos de un cliente con otros (multi-tenancy estricta).
- Cliente en `paused` → no se generan reportes automáticos.
- Cliente en `churned` → no se asignan tareas nuevas, solo lectura.
