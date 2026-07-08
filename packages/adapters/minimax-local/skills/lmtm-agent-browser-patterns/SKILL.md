---
name: lmtm-agent-browser-patterns
displayName: Browser automation patterns
description: Cómo automatizar browser (login en Meta Business, Google Ads, dashboards de 3rd parties, screenshots, scraping) usando el patrón agent-browser. Knowledge-only — la ejecución real la hace un humano en su máquina.
required: false
---

# Browser automation patterns (agent-browser)

`agent-browser` ([vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser),
35k stars) es un CLI de Rust que automatiza Chrome/Chromium via CDP
(Chrome DevTools Protocol). Es la navaja suiza para los casos donde
un API no es suficiente: login con 2FA, screenshots, scraping, etc.

## Estado actual en LMTM-OS

**Importante**: la skill upstream de `agent-browser` declara
`allowed-tools: Bash(agent-browser:*)`, lo cual **no se puede ejecutar
en Railway** porque el CLI no está instalado en el container. Por eso
esta skill es **knowledge-only**: documenta los patrones pero la
ejecución real la tiene que hacer un humano en su máquina (donde
tenga `npm i -g agent-browser && agent-browser install`).

Cuando Pablo o vos necesitéis automatizar un browser, el flujo es:
1. El agente LMTM-OS describe qué tiene que hacer (ej. "login en
   Meta Business Manager, ir a Brand Safety, exportar el report
   mensual")
2. Vos o Pablo corren el comando `agent-browser` correspondiente en
   su máquina
3. Pegan el output de vuelta al agente
4. El agente procesa el output

## Cuándo SÍ vale la pena automatizar con browser

- **Login a plataformas que no tienen API o la API está rota**:
  Meta Business Manager (algunos reports), Google Ads (algunas
  secciones), LinkedIn Campaign Manager, TikTok Ads Manager
- **Screenshots para reports**: capturar el estado de una cuenta en
  un momento dado, sin tener que pedirle al cliente que mande la
  screenshot
- **Verificación visual**: confirmar que un anuncio se está
  publicando bien, que una landing page no tiene errores, que un
  email se ve bien en mobile vs desktop
- **Scraping de datos que no están en API**: precios de competidores,
  reviews de Google Business, cambios en planes de SaaS
- **Migraciones de datos**: cuando el cliente tiene 500 productos
  en una plataforma y hay que moverlos a otra sin API de bulk

## Cuándo NO vale la pena

- **Si la plataforma tiene API** (casi todas): Meta Ads, Google Ads,
  ClickUp, Notion, Slack, Linear, GitHub. Usá el API.
- **Para login simple repetido**: la mayoría de las plataformas tiene
  un SSO que se rompe con 2FA, mejor invertir en API
- **Cuando podés delegar al humano**: a veces "screenshot este
  dashboard" lo hace mejor un humano en 30s que un script en 5min

## Patrones típicos (knowledge, no executable)

### 1. Login + navegar + screenshot

```bash
# Abrir con session persistente (mantiene cookies)
agent-browser open https://business.facebook.com --session=lmtm-meta

# Esperar a que cargue (max 30s)
agent-browser wait --selector "[data-pagelet=AdAccountSelector]"

# Screenshot
agent-browser screenshot --path ./meta-bm-2026-06.png --full-page

# Cerrar sesión
agent-browser close
```

### 2. Extraer datos (scraping)

```bash
# Listar elementos
agent-browser eval "
  Array.from(document.querySelectorAll('[data-testid=campaign]'))
    .map(el => el.textContent.trim())
" --session=lmtm-meta
```

### 3. Completar un form

```bash
# Click
agent-browser click "@e5" --session=lmtm-meta

# Type
agent-browser type "Acme SA" "@e12" --session=lmtm-meta

# Submit
agent-browser press Enter --session=lmtm-meta
```

### 4. Esperar contenido dinámico

```bash
# Esperar a que aparezca un selector
agent-browser wait --selector ".report-loaded" --timeout=60000
```

## Sessions y auth

- Cada `--session=name` guarda cookies + local storage en un
  directorio persistente (`~/.agent-browser/sessions/<name>/`)
- La primera vez te logueás interactivamente; las siguientes veces el
  browser retoma la sesión
- Para 2FA: corré `agent-browser open ...` en modo visible, hacé
  el 2FA, y la sesión queda guardada para próximas

## Anti-patterns (no hacer)

- **No scrapear agresivamente**: rate limits, captcha, IP bans
- **No automatizar login para producción**: si te banean, no
  podés hablar con humanos reales
- **No ignorar el ToS de la plataforma**: la mayoría prohíbe
  scraping automatizado
- **No capturar datos personales sin DPA**: GDPR/LPDP
- **No usar agent-browser en lugar de pedirle a la API que te
  agregue una feature**: siempre es más rápido escalar API que
  mantener un script de browser

## Cuando aparece un gap que un browser script podría llenar

1. Documentá el caso en una issue
2. Asigná a Pablo o al humano que vaya a correr el script
3. Si el caso es recurrente, escribí una skill dedicada
   (`lmtm-<platform>-extraction` o similar)
4. Si la plataforma tiene API pero está sub-utilizada, priorizá el
   API sobre el browser script

## Setup en la máquina del operador

```bash
# Instalación
npm i -g agent-browser
agent-browser install   # descarga Chrome ~150MB

# Verificar
agent-browser --version

# Primera sesión
agent-browser open https://business.facebook.com
# (login + 2FA interactivo)
# (cerrar con Ctrl+C, las cookies quedan guardadas)
```

## Recursos

- Repo: <https://github.com/vercel-labs/agent-browser>
- Docs de install + primeros pasos: <https://github.com/vercel-labs/agent-browser/blob/main/skills/agent-browser/SKILL.md>
- Specialized skills (electron apps, slack automation, vercel sandbox,
  AWS Bedrock AgentCore): `agent-browser skills list`
