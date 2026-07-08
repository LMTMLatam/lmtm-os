---
name: lmtm-clickup-conventions
displayName: Convenciones de ClickUp
description: Cómo LMTM usa ClickUp — estructura del workspace, las listas por cliente, y las convenciones CRÍTICAS del calendario de contenido (start_date = disparo a Make, etiqueta "mandado a make" = publicado, campos de Super Redes). Leela antes de crear o interpretar tareas de contenido.
required: false
---

# ClickUp — convenciones LMTM

ClickUp es el PM operativo de la agencia. Hablás con él vía el **MCP `clickup`**
(list/get/search/create/update tasks + jerarquía) o la API directa. Workspace
LMTM: `team_id 9013352440`.

## Estructura

- Space **`Clientes` (90131985551)** = la cartera activa: **un folder por cliente**
  (~56 activos). Cada folder tiene ~9-11 listas fijas: `📲Redes Sociales`,
  `Super Redes Sociales`, `Produccion de video`, `Enfoque Técnico`,
  `📺Publicidad`, `OnBoarding`, etc. **NO crear listas nuevas** fuera del patrón
  (excepción: "Super Redes Sociales" se auto-crea si falta).
- Space **`Proyecto undido` (901313852517)** = clientes dados de baja: mover el
  folder ahí LOS ARCHIVA automáticamente en el panel (reconciliación cada 12h).
  Un cliente cuyo folder no está en `Clientes` NO es un cliente activo.

## Convenciones CRÍTICAS del calendario de contenido (lista `📲Redes Sociales`)

Estas reglas son LEY para leer o crear posts:

1. **`start_date` (Fecha de inicio) = cuándo se dispara el post a Make** (Make
   es quien publica). Es LA fecha del calendario. Posts sin start_date no
   aparecen en el calendario del panel.
2. **Publicado = etiqueta `mandado a make` (o `enviado a make`)**. Es la ÚNICA
   señal de que el post salió. **NUNCA midas publicación por el status de
   ClickUp** (los statuses son custom por cliente y no confiables — "en curso"
   con etiqueta = ya salió). Pasó su start_date SIN etiqueta = nunca se disparó.
3. **Redes destino = custom field `Plataformas`** (labels: Instagram, Facebook,
   Tiktok, YouTube, LinkedIn…). Las etiquetas de tarea NO son la red.
4. **Formato = custom field `Tipo de Contenido`** (Post, Story, Carrusel, Reel,
   Clip corto…), con fallback a tags tipo reel/carrusel.
5. Algunos clientes no tienen el campo `Plataformas` en su lista — la API no
   puede crear custom fields: si falta, avisá al equipo que lo agregue a mano.

## Convenciones de `Super Redes Sociales` (ideas del agente)

Acá van TODAS las ideas de posteo que generás (nunca a `📲Redes Sociales`, que
es el calendario real — eso es del equipo hasta la paridad de calidad):

- Tag **`idea-lmtm-os`** en toda tarea creada por un agente (así el feedback
  loop mide qué se aprueba vs descarta).
- Campos: `Copy o/y Subtitulo` (desarrollo; si es video, indicar Tipo +
  Concepto del perfil de videos), `Objetivo de contenido`
  (COMERCIAL/ENGAGMENT/CONCEPTO — ortografía EXACTA), `Estado de producción` =
  `IDEA`, `Aprobación de cliente` = `PENDIENTE`.
- El equipo avanza `Estado de producción` (IDEA → PRODUCCION DE CONTENIDO →
  DISEÑO GRAFICO → PROGRAMACION → VIVO) y `Aprobación de cliente`
  (PENDIENTE → REVISION → APROBADO). Idea borrada = descartada.
- No dupliques: buscá por nombre antes de crear.

## Naming y prioridades

- **Tasks**: Title Case con verbo al inicio ("Auditar campaña de Black Friday").
- **Prioridad**: solo setear 1 (urgent) o 2 (high); default sin prioridad.
- **Statuses**: cada lista tiene los suyos (custom por cliente) — leelos de la
  lista antes de asumir; no inventes nombres de status.

## Quién crea qué

Cualquier agente puede crear/editar tareas vía MCP. Regla práctica: tareas de
cliente → `lmtmCreateClientTask` (setea el clientId y aparece en el panel);
tareas directas en ClickUp → solo dentro del folder del cliente correcto y en
la lista que corresponde a tu área. Ideas de contenido → SIEMPRE Super Redes.
