---
name: lmtm-image-postprocess
displayName: Image post-processing
description: Upscaling, background removal, color correction, formato, antes de poner en producción.
required: false
---

# Image post-processing

## Pipeline típico

```
Original (foto o AI gen) → Cleanup → Color correct → Resize → Format
```

## 1. Upscaling (subir resolución)

### Cuándo

- AI generó una imagen a 1024x1024, necesitás 4K.
- Foto original es baja res, vas a imprimir.
- Stock photo baja res que querés usar grande.

### Herramientas

| Tool | Calidad | Costo | Notas |
|------|---------|-------|-------|
| **Real-ESRGAN** (open source) | Excelente | Free | Self-hosted, batch, GPU |
| **Topaz Gigapixel AI** | Excelente | USD 99 one-time | Local, pago, mejor para fotos reales |
| **Magnific AI** | Excelente | USD 39/mo | SaaS, mejor para AI gen |
| **Upscayl** (open source) | Muy bueno | Free | GUI, fácil |
| **Bigjpg** | Bueno | Free / paid tiers | SaaS, japonés |
| **Adobe Photoshop Super Resolution** | Muy bueno | Adobe sub | Integrado |

**Por caso**:
- **AI-generated art**: Magnific > Real-ESRGAN.
- **Fotos reales**: Topaz > Real-ESRGAN.
- **Cartoon/ilustración**: Real-ESRGAN con modelo "anime" > Magnific.

### Settings típicos

- **2x-4x** máximo. 8x introduce artefactos.
- **Para ads**: 2x-3x está bien, después aplicás sharpening suave.
- **Para print**: 4x + sharpening.

## 2. Background removal (sacar fondo)

### Cuándo

- Producto aislado para e-commerce (white background).
- Cutout de persona para composite.
- Limpiar foto con fondo feo.

### Herramientas

| Tool | Calidad | Costo | Batch |
|------|---------|-------|-------|
| **remove.bg** | Excelente | Free tier (1 call/s) + paid | Sí (API) |
| **Adobe Express** | Muy bueno | Free tier | No |
| **Photopea** (online Photoshop) | Bueno | Free | No |
| **rembg** (open source, U2-Net) | Muy bueno | Free | Sí, CLI |
| **Clipdrop** | Excelente | Free tier | Sí |

**Para LMTM-OS**: integrar **rembg** local o **remove.bg API** para
batch processing de assets de clientes.

### Tips

- **Output PNG con transparencia** para compositing.
- **Chequear bordes**: pelo, transparencias (vidrio, pelo fino).
  remove.bg y rembg manejan bien, pero ojo con low contrast.
- **Refinar en Photoshop**: si los bordes no están perfectos, el
  "Refine Edge Brush" salva.

## 3. Color correction

### Conceptos básicos

- **White balance**: ¿la imagen está muy amarilla (tungsteno) o muy
  azul (sombra)? Ajustá hasta que el blanco se vea blanco.
- **Exposure**: ¿está muy clara o muy oscura? Histograma tiene que
  tener datos en todo el rango, no clipeado a izquierda o derecha.
- **Contrast**: diferencia entre claros y oscuros. Subir moderado
  para que "salte".
- **Saturation**: intensidad de colores. -10 a +15% para ads
  (demasiado satura = se ve falso).

### Tools

- **Lightroom / Camera Raw**: el standard.
- **VSCO** (preset packs): rápido, look consistente.
- **Capcut** (para video): básico pero útil.

### Look & feel por industria

- **Tech/SaaS**: cool tones, alto contrast, minimal.
- **Food/restaurant**: warm tones, soft shadows, high saturation en
  comida.
- **Fashion/beauty**: skin tones reales, poco filtro, soft glow.
- **Real estate**: warm, bright, wide angle.
- **Fitness**: high contrast, saturated, dramatic lighting.

## 4. Resize y crop

### Aspect ratios por plataforma

| Plataforma | Uso | Aspect |
|------------|-----|--------|
| IG Feed | Post cuadrado | 1:1 (1080x1080) |
| IG Feed | Post vertical | 4:5 (1080x1350) |
| IG Reel/Stories/TikTok | Vertical | 9:16 (1080x1920) |
| IG Cover | Cuadrado | 1:1 |
| Facebook Feed | Link image | 1.91:1 (1200x630) |
| Facebook Feed | Post cuadrado | 1:1 |
| Twitter/X | Post | 16:9 (1200x675) |
| LinkedIn | Post | 1.91:1 (1200x627) |
| YouTube | Thumbnail | 16:9 (1280x720) |
| Display ads | Banner | varios (300x250, 728x90, etc.) |

### Safe zones

- **IG Feed 4:5**: el bottom 14% se corta en el grid view, no
  pongas texto/CTA ahí.
- **IG Stories 9:16**: los 250px top y bottom pueden tener UI
  overlap. Centro seguro: 1080x1420.
- **Facebook Ads**: el texto en la imagen no debería ocupar > 20%
  del área (penaliza el reach).
- **YouTube Thumbnail**: subject principal en el centro 60% de la
  imagen, no en bordes (puede ser cubierto por timestamp).

## 5. Format de output

### JPEG vs PNG vs WebP vs AVIF

| Format | Cuándo | Notas |
|--------|--------|-------|
| **JPEG** | Fotos, web general | Lossy, compresión configurable, universal |
| **PNG** | Logos, transparencias, screenshots | Lossless, soporta alpha |
| **WebP** | Web moderno | Lossy y lossless, 30% más chico que JPEG/PNG, no universal |
| **AVIF** | Web moderno alto nivel | Mejor compresión que WebP, menos soporte todavía |
| **SVG** | Logos, iconos, illustrations | Vectorial, escala infinita |

### Compression

- **JPEG quality**: 80-85% para web (imperceptible la diferencia
  con 100%, mucho más liviano).
- **PNG**: usa TinyPNG, ImageOptim, o pngquant (lossless
  optimizer).
- **WebP**: cwebp con quality 75-85.
- **AVIF**: cavif con quality 50-60.

## 6. Herramientas all-in-one

- **Adobe Lightroom + Photoshop**: standard industria, caro.
- **Capture One**: alternativa pro.
- **Affinity Photo**: USD 70 one-time, casi tan bueno como
  Photoshop.
- **Photopea** (photopea.com): free, online, clon de Photoshop.
- **GIMP**: free, open source,陡峭学习曲线 (curva de aprendizaje
  pronunciada), no recomendado para producción.
- **Canva**: para clientes no técnicos, simple.

## 7. Batch processing

Si tenés 100 product photos:

- **Adobe Lightroom**: import → edit one → sync to all → export.
- **ImageMagick**: CLI, scripts bash, gratis.
- **sharp** (Node.js): programático, ideal para pipelines.
- **Pillow** (Python): programático, similar.
- **Photoshop Actions**: grabás una vez, aplicás a todas.

## 8. Brand consistency

Si tenés guía de marca:

- **Color grading único** (LUT) para todas las fotos.
- **Preset de Lightroom** exportado y compartido con el equipo.
- **Type system**: misma tipografía y color para overlays.
- **Logo placement consistente**: siempre misma posición/relación.
- **Style reference image** (--sref en MJ) para mantener look.

## Checklist final antes de subir a producción

- [ ] Resolución correcta para el placement
- [ ] Aspect ratio correcto
- [ ] File size bajo (< 500KB para ads web)
- [ ] Formato correcto (JPEG para fotos, PNG para transparencia)
- [ ] Color profile: sRGB para web, Adobe RGB para print
- [ ] Sin texto importante en safe zones peligrosas
- [ ] Logo presente si la marca lo requiere
- [ ] No incluye assets con copyright de terceros
- [ ] Metadata limpia (sin GPS, sin info del creator en EXIF)
