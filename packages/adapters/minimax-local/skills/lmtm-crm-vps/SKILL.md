---
name: lmtm-crm-vps
displayName: CRM propio (VPS)
description: El CRM de LMTM es propio (FastAPI+React en un VPS). Cómo conectarse por SSH, ver logs, diagnosticar y hacer cambios.
required: false
---

# CRM propio de LMTM (VPS)

El CRM de LMTM es **propio**, NO es Kommo ni ningún SaaS externo. Es una app
**FastAPI (backend) + React (frontend)** (ex "Charlott / atendechat") que corre
en un VPS de la agencia. Solo los agentes de CRM (Esteban = Engineer, Ana =
Analyst) lo operan, y solo el Engineer hace cambios.

## Acceso

- Host: `82.29.56.162` · puerto SSH `2222` · usuario `root`
- Key: `/app/.ssh/crm_claude` (se materializa al boot desde `CRM_SSH_KEY`)
- Comando base (desde tu Bash):
  ```bash
  ssh -i /app/.ssh/crm_claude -p 2222 -o StrictHostKeyChecking=accept-new root@82.29.56.162 '<comando>'
  ```
  Si `/app/.ssh/crm_claude` no existe, el acceso al VPS no está habilitado
  (pedí al admin que cargue `CRM_SSH_KEY` en Railway). No bloquees por esto:
  podés diagnosticar igual con lo que se sepa y dejarlo anotado.

## Estructura en el VPS

- Repo: `/home/deploy/atendechat`
- Backend service (systemd): `charlott-fastapi`
- Frontend: nginx sirve `frontend/build`
- Dominio: `https://crm.lmtmas.com` (SSL por certbot, auto-renew)

## Operaciones comunes (read-only primero)

```bash
# Logs del backend (últimas líneas / en vivo)
ssh ... 'journalctl -u charlott-fastapi -n 200 --no-pager'
# Estado del servicio
ssh ... 'systemctl status charlott-fastapi --no-pager'
# Logs de nginx
ssh ... 'tail -n 100 /var/log/nginx/error.log'
# Ver código / git
ssh ... 'cd /home/deploy/atendechat && git status && git log --oneline -10'
```

## Hacer cambios (solo cuando el issue lo pide)

- Editás el repo en `/home/deploy/atendechat`, y reiniciás:
  `sudo systemctl restart charlott-fastapi` (backend) o rebuild del frontend +
  reload de nginx según corresponda.
- **Regla**: cambios en el VPS SOLO cuando un issue lo pide explícitamente. En
  heartbeats sin pedido, limitate a diagnóstico read-only (logs/estado) y dejá
  un comentario con lo que encontraste. Nunca toques datos de clientes ni
  borres nada sin pedido explícito.

## Qué NO es esto

- No es Kommo ni un CRM externo. No busques tools `lmtm_crm.*` (no existen).
- Los datos de marketing del cliente (pauta, orgánico, presupuesto) NO salen de
  acá: salen de Meta (tools `lmtm*`) + brain + Enfoque Técnico. Este VPS es la
  app de CRM en sí (leads/deals/whatsapp), para operarla y arreglarla.
