---
name: video-local
description: Kit de edicion de video del equipo LMTM (vtool), para MATERIAL FILMADO con gente hablando (talking head, recorridas, testimonios, entrevistas). Arma un reel desde un crudo o una jornada de grabacion (con o sin guion), elige tomas, descarta las de rodaje, saca frases reempezadas y pausas, subtitulos palabra por palabra con el color de la marca, gancho, musica por debajo de la voz, insertar fotos del producto. Y el control tecnico de CUALQUIER video antes de entregarlo (vtool revisar / normalizar). Para voz en off sobre planos, la plantilla de lmtm-video.
---

# video-local (vtool)

`vtool` esta en el PATH del contenedor (`/app/video-skills/video-local/vtool.py`, Python en `/opt/vtool`).
Corre todo ahi (FFmpeg, el Whisper de HyperFrames, OpenCV): el trabajo pesado no gasta tokens. Cada comando
devuelve una linea. Tu rol es elegir el comando, correrlo y leer la linea final.

## Cuando se usa
| Material | Camino |
|---|---|
| Filmado con la voz del cliente (alguien habla a camara, recorrida, testimonio) | `vtool tomas` -> `vtool reel` (un crudo) o `vtool jornada` (varios crudos + guion) |
| Voz en off generada + planos del material | la plantilla de `lmtm-video` (no vtool) |
| Cualquier MP4 final, antes de `lmtmVideoEntregar` | `vtool revisar` siempre; si el volumen esta fuera de -16 a -12 LUFS, `vtool normalizar` y se entrega ese |

## Reglas
- Trabaja en `/tmp/videos/<cliente>-<tema>/` (los crudos en `fuente/`). Los resultados quedan al lado del
  original con `__` en el nombre; el original nunca se toca.
- Nunca leas un video ni un .srt entero para "ver" el contenido. Para mirar: `vtool hoja` y lee ese unico JPG.
  Para datos: `vtool info`. Para saber que se dice: `vtool tomas`.
- Reporta solo las lineas `USA/SACA`, `OK ->`, `LISTO ->` o `ALERTA`.
- Si un comando falla, mira la linea `ERROR` y proba una sola correccion antes de contarlo en el issue.
- Transcripcion: por defecto `vtool` usa el Whisper `small` de HyperFrames (la primera vez del contenedor baja el
  modelo, ~1 min). Si ya tenes la transcripcion de `lmtmVideoTranscribir` (`<archivo>.words.json`), pasala con
  `--palabras` y no transcribe de nuevo. `lmtmVideoTranscribir` no acepta archivos de mas de 25 MB: para un crudo,
  primero el audio (`ffmpeg -i fuente/X.MP4 -vn -ac 1 -ar 16000 fuente/X.wav`) y despues `--palabras fuente/X.wav.words.json`.
- Usa las MISMAS opciones de transcripcion en `tomas` y en `reel` (`--modelo`, `--palabras`, `--umbral`): con otras,
  la numeracion de las tomas puede cambiar.
- `--umbral` (-35 dB por defecto) es lo que cuenta como silencio para separar tomas y pausas. Si todo sale como una
  sola toma larga y hay ruido de fondo, proba `--umbral -30`.

## Reglas de oro del contenido (no negociables)
- **Nada inventado.** Precios, promos, fechas, direcciones y datos del producto salen de `lmtmGuiaContenido` o del
  pedido. Si no estan, no van: se pregunta en el issue.
- **Marca del cliente de ESTA tarea:** `--color` sale de la paleta de su guia, el logo y la web tambien. Nunca de otro
  cliente ni de un ejemplo.
- **Lo que se dice, se ve:** si se nombra un producto o ambiente y hay foto o clip real, insertalo con
  `vtool insertar` en el momento en que se nombra (los tiempos salen de `vtool tomas` o del .srt).
- **Nada tapa caras, logos ni producto.** El reel mueve los subtitulos si hay una cara abajo; `insertar` en modo
  `ventana` usa la franja de arriba. Despues de cada entrega, `vtool revisar` y mirar la hoja.
- Zonas seguras en 1080x1920: nada importante en el 14 % de arriba ni en el 35 % de abajo. vtool ya respeta eso.
- Placas animadas (precios, listas) no son de vtool: se hacen con HyperFrames y se suman con `vtool insertar` o `vtool unir`.

## Comandos
| Pedido | Comando |
|---|---|
| Ver las tomas de un crudo | `vtool tomas VIDEO` (lista numerada con texto y marcas: insulto, rodaje, repetida, suelta) |
| Reel listo desde un crudo | `vtool reel VIDEO` |
| Un video desde toda una jornada | `vtool jornada CARPETA [--guion guion.txt]` (usa `guion.txt` de la carpeta si existe) |
| Opciones de reel y jornada | `--tomas 1,3` (solo reel) · `--palabras X.words.json` (solo reel) · `--color "#HEX"` · `--fuente "Liberation Sans"` · `--estilo reel/caja/simple` · `--gancho "texto"` · `--musica pista.mp3 [--vol-musica -18]` · `--posicion auto/abajo/arriba` · `--formato 9:16/4:5/1:1/16:9` · `--modo fondo/recorte` · `--pausa 1` (corta menos) · `--umbral -30` · `--sin-subtitulos` · `--con-silencios` · `--con-repeticiones` |
| Insertar foto o clip | `vtool insertar VIDEO foto.jpg 0:03-0:06 [--modo ventana/completa]` |
| Control de calidad | `vtool revisar VIDEO` (medidas, codec, volumen, picos, negros, congelados, silencios + hoja) |
| Nivelar volumen | `vtool normalizar VIDEO` (-14 LUFS; sale `VIDEO__audio.mp4`) |
| Quitar silencios sin mirar el contenido | `vtool silencios VIDEO` (`--margen 0.3` deja mas aire, `--umbral -30` corta mas) |
| Subtitulos .srt | `vtool subtitulos VIDEO` (`--ancho 22` para vertical) |
| Quemar un .srt | `vtool quemar VIDEO SRT --estilo reel/clasico/caja` |
| Cambiar formato | `vtool vertical VIDEO --formato 9:16/1:1/4:5/16:9 --modo fondo/recorte` |
| Quedarse con tramos | `vtool cortar VIDEO 0:05-0:12 1:00-1:20` |
| Unir clips | `vtool unir A.mp4 B.mp4 -o final.mp4` |
| Detectar / partir escenas | `vtool escenas VIDEO [--partir]` |
| Ver un video de un vistazo | `vtool hoja VIDEO` |
| Exportar | `vtool exportar VIDEO --destino reels/tiktok/youtube/whatsapp/preview` |
| Datos de un video | `vtool info VIDEO` (duracion, medidas, rotacion, fps, audio) |
| Verificar el kit | `vtool autotest` |

## Crudos con varias tomas (el caso normal de un rodaje)
Un crudo trae tomas falladas, frases reempezadas, charla con el camarografo e indicaciones ("mas pausa", "entramos
aca"). `silencios` corta pausas, NO tomas: para un crudo usa siempre `reel` (o `jornada` si son varios archivos).
1. `vtool tomas VIDEO` y lee la lista (texto corto; no hace falta mirar el video).
2. Si las marcas estan bien, `vtool reel VIDEO`. Si no (dos tomas OK de la misma frase, una buena marcada por error,
   o fragmentos sueltos de una frase que se ensayo), elegi vos: `vtool reel VIDEO --tomas N[,M]`. Entre dos
   versiones de la misma frase, la ultima completa suele ser la buena.
3. Con la marca del cliente: `--color` con el color de su paleta (si la marca es negra, el claro de la paleta).
4. `vtool revisar` sobre el resultado: corregi cada ALERTA y mira la hoja.

Los crudos de camara (4K, rotados 90°, HEVC o 10 bits, audio PCM) se leen bien: FFmpeg endereza solo.

## Jornada con guion
`guion.txt`: una frase por linea, en el orden del video. La salida dice que toma uso para cada linea y marca `FALTA`
las que no encontro: contalo en el issue, no las inventes.
