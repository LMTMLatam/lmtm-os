---
name: lmtm-prompt-engineering-video
displayName: Video prompt engineering
description: Runway, Sora, Kling, Pika, Veo — cómo escribir prompts efectivos para AI video.
required: false
---

# Video prompt engineering

## Modelos principales (2026)

| Modelo | Fortaleza | Duración | Costo | URL |
|--------|-----------|----------|-------|-----|
| **Sora** (OpenAI) | Realismo, largos | 5-20s | USD 0.10-0.50/s | sora.com |
| **Veo 2** (Google) | Calidad cine, física | 8s | USD 0.35/s | vertex AI |
| **Runway Gen-3 Alpha Turbo** | Velocidad, control | 5-10s | USD 0.05-0.12/s | runwayml.com |
| **Kling 1.5/1.6** | Motion natural | 5-10s | USD 0.10-0.30/s | klingai.com |
| **Pika 2.0** | Modificaciones (modify region) | 3-5s | USD 0.10-0.30/s | pika.art |
| **Luma Dream Machine** | Rápido, free tier | 4-5s | USD 0.10-0.50/s | lumalabs.ai |

## Anatomía de un prompt de video

A diferencia de imagen, el video **implica movimiento** y eso
cambia todo.

### Estructura

1. **Subject + state inicial** — qué se ve en el primer frame.
2. **Action / Camera motion** — qué se mueve (sujeto o cámara).
3. **Style + Lighting** — visual.
4. **Duration + Aspect** — técnico.

### Ejemplo: de malo a bueno

❌ "Un chef cocinando"

✅ "Close-up of a chef's hands plating a pasta dish in a modern restaurant
kitchen. Camera slowly dollies in from medium shot to tight close-up on
the plate. Steam rising from the pasta, soft warm under-cabinet lighting,
shallow depth of field, cinematic 4K. Duration 6 seconds, 9:16 aspect."

## Camera motion (la palanca más fuerte)

- **Static shot**: nada se mueve, solo lo que está dentro del
  frame. Funciona para product close-ups.
- **Dolly in/out**: cámara se acerca/aleja. Bueno para
  revelar/dramatizar.
- **Pan left/right**: cámara gira. Bueno para seguir un sujeto o
  mostrar un espacio.
- **Tilt up/down**: cámara sube/baja. Bueno para revelar vertical
  (edificios, personas de pies a cabeza).
- **Tracking shot**: cámara sigue al sujeto. Bueno para escenas en
  movimiento.
- **Orbit**: cámara gira alrededor del sujeto. Bueno para
  productos 360°.

**Regla**: una sola camera motion por clip. Múltiples motions =
incoherencia.

## Movimiento del sujeto vs de la cámara

| Tipo | Cuándo | Ejemplo |
|------|--------|---------|
| Static camera, static subject | Producto | Botella en pedestal, light cambiando |
| Static camera, moving subject | Personas caminando, autos | Timelapse de oficina |
| Moving camera, static subject | Reveal de producto | Dolly in a un producto |
| Moving camera, moving subject | Lifestyle, deportes | Drone siguiendo a un skater |

## Por modelo

### Sora

- **Pros**: entiende física compleja (agua, fuego, tela), alta
  consistencia temporal.
- **Cons**: menos control de motion explícito, puede ser
  impredecible.
- **Tip**: describí el primer frame y el último frame.

```
"First frame: a glass of water sitting on a wooden table in a sunlit
kitchen. Last frame: a hand lifts the glass and drinks from it. Duration
5 seconds. Photorealistic, natural lighting."
```

### Runway Gen-3 Alpha

- **Pros**: control explícito con sliders (motion, camera), buen
  image-to-video.
- **Cons**: consistencia < Sora.
- **Tip**: usá el slider de Motion Amount. Bajo = sutil, alto =
  dinámico. Para ads 0.3-0.5.

```
Image: [URL de frame]
Prompt: "Slow push-in camera motion. Subject remains still, just
slight breathing movement. Soft natural light, no other motion."
Motion: 3/10
```

### Kling 1.6

- **Pros**: motion humanoide realista, bueno para dance/lip-sync.
- **Cons**: a veces artefactos en bordes.
- **Tip**: especificá "realistic human motion" o "natural body
  movement".

### Pika 2.0

- **Pros**: modify region (cambiá una parte específica de un
  video).
- **Cons**: clips cortos (3-5s).
- **Tip**: ideal para A/B de creative con variantes pequeñas.

## Reglas

### Lo que SÍ funciona

- **Describir el primer y último frame** (cuando el modelo lo
  soporta).
- **Una sola motion principal** (cámara O sujeto).
- **Lighting concreto** (afecta motion de sombras, humo, etc.).
- **Duración explícita** (5s vs 20s cambia todo).
- **Aspect ratio upfront** (9:16 para vertical, 16:9 para
  YouTube).

### Lo que NO funciona

- **"Cinematic, beautiful"** sin nada más.
- **Múltiples acciones** ("camina, salta, gira, mira atrás") en
  5s. El modelo prioriza la primera.
- **Movimiento + movimiento de cámara simultáneo**: caos.
- **Texto en el video**: todavía no funciona bien. Componer en
  edición.
- **Personas hablando/lip-sync**: AI todavía no es consistente.
  Si necesitás talking head, mejor filmado real o HeyGen.

## Workflow típico

### 1. Storyboard (humano)

Dibujá/imaginate 5-10 clips de 3-6s que cuenten la historia.

### 2. Genera frame por frame o clip por clip

Para ads, muchas veces mejor **foto del primer frame** (generada
o real) + **image-to-video** (Runway, Kling).

### 3. Editá y compongá

Capcut, DaVinci Resolve, Premiere. Agregá texto, audio, transiciones.

### 4. A/B test

Generá 3-5 variantes del mismo concepto, distintas imágenes o
ángulos.

## Para ads específicos

### Performance ad (5-10s, vertical, no-skip)

- **Hook visual en 1 segundo**. Si no enganchás, scrollean.
- **Producto visible en 80%+ del clip**.
- **End frame con texto/CTA overlay** (componer en Capcut).
- **No audio crítico**: el 70%+ de los ads se ven en mute.

### Brand video (15-30s, horizontal, con sonido)

- **Storytelling > venta directa**.
- **Música es 50% del feel**. Elegí primero el audio, después
  generá clips que peguen.
- **Cross-cut**: alternar dos ángulos/escenas para mantener
  ritmo.

## Anti-patterns

- **Generar 30s en un solo clip**: la calidad cae en el segundo
  15+. Mejor 6 clips de 5s y editar.
- **Confiar en que el modelo "entienda" tu intención**: hay que
  ser muy explícito.
- **No iterar seeds**: si te gusta un output, guardá el seed
  (cuando esté disponible) y los settings.
- **Omitir negative prompts**: especificá lo que NO querés (low
  quality, distorted, blurry, fast motion, jumpy).
