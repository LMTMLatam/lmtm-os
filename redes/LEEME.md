# lmtm-redes en el QNAP — pasos para la persona con admin (plan 17/11)

API propia de datos públicos de TikTok e Instagram («nuestro ScrapeCreators»). Tiene que correr en la oficina: TikTok e
Instagram frenan a Railway. Los agentes la usan desde lmtm-os por Tailscale. Claude no escribe contraseñas ni crea
cuentas: estos pasos los hace una persona.

El usuario `Agentes_IA` sigue en **solo lectura** en todo el NAS: las piezas terminadas van solo a Drive (18/11).

## 1. Container Station
1. App Center → instalar **Container Station** (gratis, de QNAP). Crea la carpeta compartida `Container`.
2. En File Station, crear `Container/lmtm-redes` y copiar ahí el contenido del zip (`redes.py`, `terminos.json`,
   `requirements.txt`, `compose.yml`). Crear también `Container/lmtm-redes-datos` (vacía).
3. Inventar un token largo (por ejemplo, en PowerShell:
   `-join ((48..57)+(97..122) | Get-Random -Count 40 | % {[char]$_})`). **No mandarlo por chat.**
4. Container Station → Aplicaciones → Crear → pegar el contenido de `compose.yml` y, en esa misma ventana, reemplazar
   `${REDES_TOKEN}` por el token (queda guardado solo en el NAS). Crear. El primer arranque tarda 1–2 min (baja la imagen
   de Playwright, ~2 GB, e instala yt-dlp).
5. Probar desde una PC de la oficina: `http://<IP del NAS>:8790/salud` → tiene que decir `{"ok": true, ...}`.

## 2. Tailscale (admin console → Access controls)
En la regla que deja a `tag:agentes` llegar al NAS, sumar el puerto 8790:
```json
{ "src": ["tag:agentes"], "dst": ["100.106.250.26"], "ip": ["tcp:5000", "tcp:8790"] }
```

## 3. Railway (lmtm-os → Variables)
- `REDES_URL` = `http://100.106.250.26:8790`
- `REDES_TOKEN` = el mismo token del paso 1.3

Avisar a Claude cuando esté: prueba la conexión desde el servidor y prende las herramientas de los agentes.

## Actualizar
Reemplazar los archivos en `Container/lmtm-redes` y reiniciar el contenedor `lmtm-redes`.
