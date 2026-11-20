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
| Filmado con la voz del cliente (alguien habla a camara, recorrida, testimonio) | `vtool tomas` -> `vtool reel` o `vtool jornada` con `--sin-subtitulos`, y se termina con "Reel filmado con motion graficos" de la skill `lmtm-video` (titulos, tarjetas, insertos, musica y cierre). Solo sin motion: `vtool reel` tal cual, con subtitulos |
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
- Formato de reel viral (vtool ya lo hace): subtítulos de 1 a 3 palabras, grandes, con borde, en el tercio de abajo;
  gancho con `--gancho "Frase con *clave*"`. Nada en los 269 px de arriba ni en los 400 px de abajo.
- **Tarjetas, titulos e insertos solo con `armar.mjs` del reel filmado**, nunca a mano con drawtext ni con
  `vtool insertar`. Sin motion, el texto en pantalla es el subtitulo y el gancho.
- Voz limpia y parejo en los dos oidos: `reel` y `jornada` ya lo hacen (camaras con un solo microfono graban en un canal).
  `--sin-limpiar` solo si el audio ya viene limpio. `vtool revisar` avisa si la voz quedo de un solo lado.

## Comandos
| Pedido | Comando |
|---|---|
| Ver las tomas de un crudo | `vtool tomas VIDEO` (lista numerada con texto y marcas: insulto, rodaje, repetida, suelta) |
| Reel listo desde un crudo | `vtool reel VIDEO` |
| Uno o VARIOS videos desde una jornada | `vtool jornada CARPETA [--guion guion.txt]` (usa `guion.txt` de la carpeta si existe; `---` separa un reel del siguiente) |
| Ver las tomas de toda una carpeta | `vtool lote CARPETA tomas` |
| Limpiar la voz de un video ya cortado | `vtool limpiar VIDEO` (despues `vtool normalizar`) |
| Sumar musica a un video ya cortado | `vtool musica VIDEO pista.mp3 [--vol-musica -18]` (baja sola cuando se habla) |
| Estilo del tipo de video | `--perfil <nicho>` (`vtool perfiles` lista). Si `lmtmPlantillaVideo` del cliente y tipo trae `perfil`, guardalo como `perfiles/<archivo>.json` y usá ese |
| Ritmo y sonido | `--zoom 1.12` (acerca un tramo sí y uno no) · `--sfx` (whoosh en cortes y pop en el gancho, nunca dos en menos de 2 s; `--vol-sfx`, `--sin-sfx`) |
| Medir videos de referencia (virales) | `vtool referencia CARPETA` (cortes, plano medio, primer corte, palabras/s, volumen, brillo por video + mediana) |
| Opciones de reel y jornada | `--tomas 1,3` (solo reel) · `--palabras X.words.json` (solo reel) · `--color "#HEX"` · `--fuente "Liberation Sans"` · `--estilo reel/caja/simple` · `--gancho "texto"` · `--musica pista.mp3 [--vol-musica -18]` · `--posicion auto/abajo/arriba` · `--formato 9:16/4:5/1:1/16:9` · `--modo fondo/recorte` · `--pausa 1` (corta menos) · `--umbral -30` · `--sin-subtitulos` · `--con-silencios` · `--con-repeticiones` |
| Insertar foto o clip | `vtool insertar VIDEO foto.jpg 0:03-0:06 [--modo ventana/completa]` |
| Control de calidad | `vtool revisar VIDEO` (medidas, codec, volumen, picos, negros, congelados, silencios + hoja) |
| Nivelar volumen | `vtool normalizar VIDEO` (-14 LUFS; sale `VIDEO__audio.mp4`) |
| Quitar silencios sin mirar el contenido | `vtool silencios VIDEO` (`--margen 0.3` deja mas aire, `--umbral -30` corta mas) |
| Subtitulos .srt | `vtool subtitulos VIDEO` (`--ancho 22` para vertical) |
| Quemar un .srt | `vtool quemar VIDEO SRT --estilo reel/clasico/caja` |
| Cambiar formato | `vtool vertical VIDEO --formato 9:16/1:1/4:5/16:9 --modo fondo/recorte/cara` (`cara`: horizontal de alguien hablando → 9:16 centrado en su cara) |
| Crudo oscuro o con tinte | `vtool luz VIDEO` (solo aclara, nunca oscurece; `--blanco` corrige también el tinte medido en los grises: usalo solo si se ve feo, una pared beige no es un tinte) |
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

Para sacar varios reels de la misma jornada, separalos con una linea `---`. Opcional al principio de cada uno:
`# Nombre` y `gancho: Frase con *clave*` (el gancho no va si despues lleva motion). Si una toma se usa en dos reels, la
salida dice `ALERTA: ya usada en ...`: cambiala o contalo en el issue.
```
# Placares
Diseñamos placares a medida.
Los fabricamos en nuestra planta.
---
# Vestidores
Un vestidor pensado para tu casa.
```
