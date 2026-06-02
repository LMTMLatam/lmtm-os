---
name: lmtm-prompt-engineering-image
displayName: Image prompt engineering
description: Cómo escribir prompts para Midjourney, DALL-E, Flux, Ideogram, con foco en ads.
required: false
---

# Image prompt engineering

## Anatomía de un buen prompt

Un prompt efectivo tiene 5 componentes, en este orden:

1. **Subject** — qué/quién está en la imagen.
2. **Action/Context** — qué está haciendo o dónde está.
3. **Style/Medium** — foto, ilustración, render 3D, etc.
4. **Lighting/Mood** — luz, atmósfera.
5. **Camera/Composition** — encuadre técnico.

### Ejemplo: de malo a bueno

❌ "Mujer con laptop trabajando en café"

✅ "Young professional woman, mid-30s, focused expression, typing on MacBook
in a busy Buenos Aires café, soft natural morning light through window,
warm color palette, lifestyle photography, shallow depth of field,
85mm f/1.4, golden hour"

## Prompts por modelo

### Midjourney v6+

```
[subject] + [action] + [style] + [lighting] + [camera] + [params]

Params útiles:
  --ar 4:5         (portrait, ideal para IG feed)
  --ar 9:16        (story, reel cover)
  --ar 1:1         (cuadrado)
  --s 50-250       (stylization, 50=subtle, 250=artistic)
  --c 0-50         (chaos, 0=deterministic, 50=varied)
  --w 0            (weird, less weird)
  --q 1            (quality)
  --no text        (negative prompt)
  --style raw      (menos embellecimiento, más fiel al prompt)
  --sref <url>     (style reference, mantener consistencia visual)
  --cref <url>     (character reference, mismo personaje)
  --seed 12345     (reproducibilidad)
```

**Ejemplo**:
```
/imagine A confident female founder in her 30s pitching to investors
in a modern co-working space, soft golden hour light through floor-to-ceiling
windows, candid moment mid-sentence, lifestyle photography, 35mm, shallow DOF
--ar 4:5 --s 80 --style raw --sref https://...
```

### DALL-E 3 (OpenAI)

Más conversacional, más control narrativo.

```
Prompt: "Create a hero image for a SaaS landing page. A young professional
woman in her 30s, with a confident and approachable expression, sitting in
a modern office with natural light. She is using a laptop showing a clean
analytics dashboard. The composition should leave space in the top-right
for a headline. Style: minimalist, modern, with a warm color palette
(coral, beige, deep blue). Resolution: 1792x1024. NO text on the image."
```

**Ventaja**: entiende contexto largo y constraints (ej. "leave space
for headline").
**Desventaja**: menos control de estilo exacto que Midjourney.

### Flux (Black Forest Labs)

Equilibrio entre Midjourney y DALL-E. Excelente para texto en la
imagen (logos, captions) — donde DALL-E/MJ fallan.

```
"A minimalist product mockup of a matte black water bottle on a stone
pedestal, with the text 'PURE' in sans-serif font etched into the
bottle, soft directional studio lighting, neutral background,
commercial product photography"
```

### Ideogram

**El mejor para texto en imagen**. Si necesitás que un logo, un
poster, una camiseta diga algo específico, Ideogram > todos.

```
"Modern minimalist poster design with the headline 'Less is More'
in large bold sans-serif typography, pastel color palette, ample
white space, art print aesthetic, --aspect 2:3"
```

## Reglas universales

### Lo que SÍ funciona

- **Referencias de fotógrafo/artista** (sin copyright): "shot by Annie
  Leibovitz style", "Wes Anderson color palette", "Greg Norman
  composition".
- **Especificidad de cámara**: "85mm f/1.4", "35mm wide angle",
  "macro lens". Cambia completamente el feel.
- **Lighting concreto**: "golden hour", "Rembrandt lighting", "soft
  diffused studio light", "blue hour".
- **Mood emocional**: "joyful", "contemplative", "determined",
  "vulnerable".

### Lo que NO funciona

- **"Beautiful", "amazing", "stunning"**: vacío, no cambia el output.
- **"4K", "8K", "high quality", "photorealistic"** (en MJ/DALL-E):
  el modelo ya sabe.
- **Doble negación**: "no blurry" vs "sharp, in focus".
- **Listas infinitas de adjectives**: diluye el focus.
- **Referencias a personas reales por nombre**: bloqueado por
  safety filters y/o legalmente problemático.

## Ads-specific tips

### Para performance ads

- **Que se vea el producto en uso**, no en abstracto.
- **Un solo subject principal**. Caos visual = no se ve el
  mensaje.
- **Background simple**. El creativo compite por atención con
  docenas de otros posts.
- **High contrast en el punto focal**. Donde va el CTA o el
  producto tiene que "saltar".
- **Brand colors consistentes** entre ads (usá --sref para
  mantener el look).

### Para landing pages

- **Hero image: producto o persona real, no abstract**. La
  abstracción reduce conversion.
- **Composición con espacio negativo** donde va el headline.
- **Modelo que represente tu buyer persona**. "Mujer 35, NSE AB,
  urbana" → foto tiene que ser de eso, no de modelo genérica.

## Negative prompts

- **MJ/DALL-E**: `--no text, watermark, blurry, low quality,
  deformed hands, extra fingers`
- **Stable Diffusion**: parametrizable en el sampler.

## Iteración

1. **Empezá con un prompt base** y generá 4 variaciones.
2. **Identificá qué gustó** y qué no. Refiná el prompt.
3. **Si un elemento está mal**: sacalo del prompt (no agregues un
   modifier raro).
4. **Si un estilo te gusta**: guardá el seed y/o usá --sref.
5. **Generá 20-50 variaciones** antes de elegir una. El
   variation ratio en MJ es alto.

## Cost / API

- **Midjourney**: USD 10/mo básico, 30 para standard.
- **DALL-E 3**: USD 0.04-0.12 por imagen (vía API OpenAI).
- **Flux Pro**: USD 0.05 por imagen.
- **Ideogram**: USD 0.05-0.10 por imagen, plan free disponible.
- **Stable Diffusion local**: gratis si tenés GPU decente
  (NVIDIA 8GB+ VRAM).
