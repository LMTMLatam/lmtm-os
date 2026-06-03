---
name: lmtm-find-skills
displayName: Find skills (LMTM-OS)
description: Cómo descubrir skills nuevas y útiles para los 14 agentes de LMTM-OS. Basado en la skill de Vercel pero customizada para nuestro stack (M3 adapter, LMTM domain, ClickUp, Meta, etc.).
required: false
---

# Find skills for LMTM-OS

Cuando un agente detecta que le falta conocimiento o tooling para una
tarea, **no improvisa**. Primero busca si existe una skill pública
disponible que cubra el caso. Esta skill documenta el workflow de
discovery que ya aplicamos (basado en
[`vercel-labs/skills/find-skills`](https://github.com/vercel-labs/skills/tree/main/skills/find-skills)).

## Cuándo usarla

- El usuario pide un flujo nuevo que no tenemos automatizado
  ("quiero conectarme a Notion", "necesito generar videos con Sora")
- Un agente detecta un gap recurrente: cada vez que toca X tiene que
  re-investigar
- Estamos evaluando una nueva integración y queremos saber qué
  opciones existen
- Una skill existente quedó obsoleta o no es la mejor opción

## Cuándo NO usarla

- El problema ya tiene una skill nuestra (ej. `lmtm-google-trends` ya
  cubre "investigar keywords") — usá esa, no reinventes
- Es un tema de una sola vez (ej. "qué hora es en Tokyo") — googleá
  directamente, no gastes un skill entero
- Es urgente y la skill no va a cambiar la respuesta — actuá primero,
  documentá después

## Workflow de discovery

### 1. Identificar el gap

Sé explícito sobre qué falta:

- **¿Qué hace falta?** Una acción, un dominio de conocimiento, una
  integración, una técnica
- **¿Qué skills actuales hay cerca?** Listá las que ya tenemos
  (ver `lmtm-tool-reference` o el listado en `company_skills`)
- **¿Es coberturable por una skill de conocimiento o necesita
  tooling?** Una skill de conocimiento es texto que entra al system
  prompt. Un tool es código que el agente puede llamar. Si es
  tooling, ver `lmtm-tool-reference` para saber si ya hay un plugin
  o MCP server equivalente

### 2. Buscar skills existentes

Fuentes prioritarias:

| Fuente | URL | Cuándo usar |
|--------|-----|-------------|
| **Anthropic skills repo** | `github.com/anthropics/skills` | Primero. Skills curadas, vienen con frontmatter de quality. |
| **Vercel labs skills** | `github.com/vercel-labs/skills` | Para tooling, MCP servers, frontend dev. |
| **Paperclip plugins** | `github.com/paperclipai/paperclip/tree/main/packages/plugins` | Si querés un plugin real (worker + manifest). |
| **Skills marketplace** | `github.com/topics/skills` | Última instancia, baja curation. |
| **Repos oficiales del vendor** | ej. `github.com/n8n-io/n8n` | Si el vendor tiene docs/skills. |

Query de búsqueda efectiva:
```
"<topic> skill" en GitHub search
"<topic> agent skills"
"<topic> mcp" si lo que necesitamos es tooling
"<topic> llm" o "<topic> prompt"
```

### 3. Evaluar la skill encontrada

Checklist:

- [ ] **¿Cuántos stars?** > 1k = razonable, > 5k = confiable
- [ ] **¿Es reciente?** > 6 meses con commits activos = viva
- [ ] **¿Tiene frontmatter YAML?** Nombre, descripción, allowed-tools
- [ ] **¿El `description` coincide con lo que necesitamos?** Trigger
  claro
- [ ] **¿Los `allowed-tools` son ejecutables en nuestro env?** Si
  requiere `Bash(playwright:*)` y Render no tiene playwright, no
  sirve directo
- [ ] **¿Tiene skill hermana conflictiva?** Si ya tenemos
  `lmtm-google-trends`, no adoptes `another-google-trends` que
  haga lo mismo
- [ ] **¿Es seguro?** Que no pida tokens con scope amplio, que no
  mande datos a 3rd parties

### 4. Decidir el path

Tres opciones:

| Path | Cuándo |
|------|--------|
| **Adoptar tal cual** | La skill encaja 100% con el dominio y el `description` es claro. Copiar el SKILL.md a `packages/adapters/minimax-local/skills/<key>/SKILL.md`, registrar en company_skills, asignar a los agentes relevantes. |
| **Adaptar** | La skill es buena pero hay cosas nuestras que sobrescribir (ej. naming, nomenclatura de tareas, plataformas preferidas). Copiar y editar. Siempre mantener el frontmatter. |
| **Crear desde cero** | No hay skill pública que cubra el caso, o lo que hay es de baja calidad. Escribir una nueva siguiendo la misma estructura. |

**No adoptes** si:
- El frontmatter es vago ("helps with various tasks")
- Los examples usan servicios pagos que no vamos a usar
- No tiene estructura clara (es un readme largo sin SKILL.md)

### 5. Documentar la decisión

Después de elegir, dejá un comment en el issue/PR:
- Link a la skill encontrada
- Por qué la adoptamos / adaptamos / creamos desde cero
- A qué agentes se la asignamos

## Naming convention para skills LMTM

- **Knowledge skills** (frontmatter sin `allowed-tools`): `lmtm-<domain>-<concepts>` (ej. `lmtm-sql-patterns`, `lmtm-cold-outreach`)
- **Tooling skills** (con `allowed-tools`): `lmtm-<tool>-usage` (ej. `lmtm-agent-browser-patterns`)
- **Workflow skills**: `lmtm-<workflow>-workflow` (ej. `lmtm-client-onboarding-workflow`)

Prefijo `lmtm-` siempre. Lowercase, kebab-case. Sin números (mejor
describir qué hace que la versión).

## Mantenimiento

Una vez cada 3 meses, revisar todas las skills y:
- Verificar que las URLs externas siguen vivas
- Buscar versiones nuevas de las skills upstream que adoptamos
- Buscar skills mejores para los gaps que conocíamos
- Deprecar skills que ya no aplican

## Métricas

- Cuántas veces cada skill se carga (lo podés ver en el system prompt
  size antes/después)
- Cuántas veces el output de un agente menciona "según la skill X"
- Cuántas skills nuevas se adoptan/crean por mes

Si una skill tiene 0% de uso por 2 meses → deprecar.
