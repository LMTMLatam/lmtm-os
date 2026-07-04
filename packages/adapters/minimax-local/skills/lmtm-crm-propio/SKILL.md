---
name: lmtm-crm-propio
displayName: CRM propio de LMTM (operar por API)
description: El CRM de LMTM es PROPIO (FastAPI+React, crm.lmtmas.com), NO Kommo. Cómo operarlo por su API con la tool lmtmCrmRequest — crear usuarios/clientes, conectar WhatsApp, pipelines, agente IA — y las reglas de seguridad. Usala cuando un issue pida algo del CRM.
required: false
---

# CRM propio de LMTM — operarlo por API

El CRM de LMTM es una app **PROPIA** (FastAPI backend + React) en `crm.lmtmas.com`.
**NO es Kommo** ni ningún SaaS externo. Es multi-tenant: cada empresa cliente tiene sus
usuarios, leads, canales de WhatsApp/IG y un agente de IA propio.

**Operás SIEMPRE con la tool `lmtmCrmRequest`** — nunca por SSH ni tocando la DB. El
servidor maneja login y token; vos pasás `method` + `path` (relativo a `/api`) + `body`.

## Cómo se autentica (no te preocupes por esto)

El server usa el usuario de servicio `agentes@bylmtm.com` (perfil `super`) y cachea el
token. Vos solo llamás la tool. Si algo devuelve 401, el server re-loguea solo.

## Multi-tenant — regla de oro

El `companyId` viaja en el token. El usuario de servicio es `super`: administra la
plataforma (`/admin/*`) y puede leer todo. Pero para **operar DENTRO de la empresa de un
cliente** (crear sus etapas, conectar su WhatsApp, configurar su agente IA) el CRM espera
un usuario de esa empresa. Si una operación de empresa devuelve 403, es por esto —
reportalo, no insistas.

## Qué podés hacer (mapa rápido → path)

| Querés | method + path |
|---|---|
| Ver el panorama de la plataforma | `GET /admin/overview` |
| Listar todas las empresas | `GET /admin/companies` |
| Listar usuarios de una empresa | `GET /users/` |
| **Crear usuario** (en una empresa) | `POST /users/` `{name,email,password,profile:"user"|"admin"}` ⚠️OK humano |
| **Crear empresa + admin + trial** | `POST /auth/register` `{name,email,password,companyName}` ⚠️OK humano |
| Ver leads/contactos | `GET /contacts/` |
| Crear lead | `POST /contacts/` `{name,number,email?,source?}` ⚠️OK humano |
| Asignar lead a operador | `PUT /contacts/{id}` `{assignedUserId}` (si el cliente lo pidió) |
| Ver tablero Kanban | `GET /pipeline/board` |
| Crear/editar etapa | `POST/PUT /pipeline/stages` (si el cliente lo pidió) |
| Mover lead de etapa | `PUT /pipeline/leads/{contactId}/stage` `{stage_id}` |
| Detectar canales Meta disponibles | `POST /channels/discover` `{access_token}` ⚠️OK humano |
| Conectar un canal | `POST /channels` `{channel_type,name,external_id,access_token}` ⚠️OK humano |
| Probar un canal (dry-run, libre) | `POST /channels/{id}/test` |
| Ver agente IA | `GET /ai/agents` |
| Probar el agente IA (dry-run, libre) | `POST /ai/agents/test-chat` `{message,history:[],slots:{},conversationState:"new"}` |
| Configurar agente IA | `POST/PUT /ai/agents` ⚠️OK humano |
| Base de conocimiento | `GET/POST/PUT /ai/kb/documents` (editar = ⚠️OK humano) |
| Billing de una empresa | `GET /billing/current` |

## Reglas de seguridad (el server las hace cumplir, respetá también en tu criterio)

**Libres (hacé sin pedir):** todos los GET; los dry-runs `test-chat`, `channels/{id}/test`,
`admin/arca/dummy`, `ai/rag/search`.

**Requieren OK humano (proponé → esperá aprobación → ejecutá con `approved:true`):**
crear empresa/usuario/lead, conectar/editar canales, configurar el agente IA, editar la
base de conocimiento de un cliente activo. **Flujo:** dejá un comentario en el issue con
exactamente qué vas a hacer (método, path, body), esperá el OK del humano, y recién ahí
llamás la tool con `approved: true`. Sin aprobación, el server te la rechaza — es correcto.

**Prohibido siempre (lo hace un humano, ni lo intentes):** DELETE de cualquier cosa,
enviar mensajes a contactos reales, cambiar plan/suscripción/estado de empresas,
`billingBypass`, tocar credenciales. El server bloquea esto en código.

## Onboarding de un cliente nuevo (referencia)

1. `POST /auth/register` → crea empresa + admin + trial 30d (OK humano).
2. `POST /channels/discover` con el token de Meta del negocio → elegir número/página.
3. `POST /channels` por cada canal elegido (OK humano). El webhook en Meta Developers lo
   configura un humano.
4. `POST /channels/{id}/test` → confirmar `ok:true`.
5. `GET /ai/persona-templates` → `POST /ai/agents` con la persona del negocio (OK humano).
6. `POST /ai/agents/test-chat` con 3-4 mensajes típicos → validar antes de entregar.

## Errores

- **401**: token vencido → el server reintenta solo.
- **402**: suscripción vencida de ESA empresa → reportá, no reintentes.
- **403**: sin permisos (o operación de empresa con token super) → no insistas.
- **409**: duplicado (email ya registrado, canal existente) → reportá.
- **422**: body inválido → corregí los campos.
- La tool te devuelve `approvalRequired` cuando la escritura necesita OK humano.

Nunca pongas secretos (tokens, contraseñas) en comentarios, prompts ni logs. Si ves un
secreto expuesto, reportalo sin copiarlo.
