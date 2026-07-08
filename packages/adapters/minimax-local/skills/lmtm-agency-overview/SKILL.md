---
name: lmtm-agency-overview
displayName: LMTM-OS Agency Overview
description: Qué es LMTM, cómo trabajamos, qué clientes tenemos, qué promesas hacemos.
required: false
---

# LMTM-OS

LMTM es una agencia de marketing con base en Argentina. Manejamos pauta y
contenido para una cartera de ~56 clientes activos PyME y mid-market de
Argentina y LatAm. Hoy la data viva viene de **Meta** (Google Ads está
conectándose; TikTok/LinkedIn aún sin datos — no asumas que existen).

## Quiénes somos

- **Equipo humano**: CEO + Director de Marketing + equipo de paid media,
  contenido, SEO, datos, reporting y desarrollo.
- **Equipo IA (LMTM-OS)**: 14 agentes proactivos coordinados por Pablo (PM)
  que reportan a Luna (CMO). Cada uno tiene un dominio claro.

## Modelo de trabajo

1. **Onboarding** (semana 1): C1 (no existe aún, lo construimos) recolecta
   páginas, business managers, Google Ads MCC, TikTok Business Center,
   LinkedIn Ad Account. Conecta APIs vía OAuth.
2. **Operación mensual** (mes a mes): Luna asigna trabajo, cada agente
   ejecuta su rutina, Roxana entrega reportes semanales, los agentes
   relevantes abren issues para que Pablo coordine.
3. **Reporte mensual** (fin de mes): Roxana + Dario + Delfina generan el
   dashboard del cliente con datos reales de las 4 plataformas.

## Promesas a clientes

- Reportes semanales y mensuales automáticos.
- Optimización continua de campañas.
- Contenido acorde a marca y estacionalidad.
- Dashboard accesible 24/7 vía link firmado.

## Herramientas disponibles

- `paperclip*` (MCP) — issues, comments, heartbeat, update.
- `lmtm*` (MCP) — datos del cliente: `lmtmListClients`, `lmtmGetClientBrain` (memoria + Enfoque Técnico), `lmtmGetClientAdsPerformance`, `lmtmGetClientBalance` (presupuesto/saldo de Meta), `lmtmGetClientOrganicPosts`, `lmtmGetClientScheduledContent`, `lmtmGetClientScores`, `lmtmGetClientCompetitors`, `lmtmRememberAboutClient`, `lmtmCreateClientTask`. Ver `lmtm-tool-reference`.

> Los datos del cliente salen SOLO de Meta (tools lmtm*), el brain y el Enfoque Técnico. NO hay planilla ni CRM externo. El CRM de LMTM es propio (en VPS) y solo lo tocan los agentes de CRM directamente sobre el servidor.

## Reglas generales

- **Idioma**: español rioplatense para todo lo visible al cliente.
  Inglés solo para términos técnicos.
- **Moneda**: ARS por defecto, USD para clientes internacionales.
- **Time zone**: America/Argentina/Buenos_Aires.
- **Cifras**: no redondear a la baja en reportes (mostrar valores reales
  con 2 decimales).
