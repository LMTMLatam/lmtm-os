"""lmtm-redes: API propia de datos públicos de TikTok e Instagram («nuestro ScrapeCreators»). Plan 17/11, fase 1.0.

Corre en la oficina (contenedor en el NAS) porque TikTok e Instagram frenan a la IP de Railway. lmtm-os la llama por
Tailscale con el header x-api-key. Sin login, sin rotar IP, sin resolver captchas, a ritmo de persona: si aparece un
freno, responde 429 «bloqueado» con la hora para reintentar y no insiste.

Cómo resuelve cada cosa (probado el 17/11 desde la oficina):
  · buscar      → DuckDuckGo HTML con `site:` (TikTok e Instagram no dejan buscar sin login/navegador visible)
  · TikTok      → yt-dlp haciéndose pasar por Chrome (perfil y video: vistas, me gusta, compartidos, guardados)
  · Instagram   → Chromium oculto en /<usuario>/reels/ (12 reels con reproducciones) + yt-dlp por reel
  · tendencias  → Creative Center de TikTok con navegador VISIBLE (en Linux, con xvfb-run)

Uso:  python redes.py servir            (REDES_TOKEN, REDES_PUERTO=8790, REDES_DATOS=./datos)
      python redes.py <ruta> k=v ...     (prueba local sin servidor, ej: python redes.py /v3/tiktok/profile/videos handle=x)
"""
from __future__ import annotations

import json
import os
import random
import re
import shutil
import sqlite3
import statistics
import sys
import tempfile
import threading
import time
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

VERSION = "1.0"
DATOS = Path(os.environ.get("REDES_DATOS", Path(__file__).parent / "datos"))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/159.0.0.0 Safari/537.36"
PAISES = json.loads((Path(__file__).parent / "terminos.json").read_text(encoding="utf-8"))["paises"]

# Pausa entre pedidos al mismo sitio (segundos, al azar) y tope por día. El tope se cambia con REDES_TOPE_<RED>.
# DuckDuckGo pidió verificación (202) tras ~7 búsquedas en 30 min (17/11): por eso dos buscadores que rotan, lentos.
RITMO = {"ddg": (25, 45, 150), "yahoo": (15, 30, 300), "tiktok": (2, 5, 600), "instagram": (6, 12, 150),
         "creative": (5, 9, 40)}
BUSCADORES = ("yahoo", "ddg")
ESPERA_FRENO = 30 * 60  # primer freno: 30 min; cada freno seguido duplica


class Bloqueado(Exception):
    def __init__(self, red: str, hasta: float, motivo: str):
        super().__init__(f"{red} bloqueado hasta {datetime.fromtimestamp(hasta, timezone.utc).isoformat()}: {motivo}")
        self.red, self.hasta, self.motivo = red, hasta, motivo


class Invalido(Exception):
    pass


# ── Puras (las cubren los tests) ──────────────────────────────────────────────

def mediana(xs) -> float | None:
    xs = [x for x in xs if isinstance(x, (int, float))]
    return statistics.median(xs) if xs else None


def links_buscador(html: str, red: str) -> list[dict]:
    """Links de videos en la página de resultados de DuckDuckGo, sin repetir, en el orden en que aparecen."""
    texto = unquote(unquote(html))
    if red == "tiktok":
        pat = r"https?://(?:www\.)?tiktok\.com/@([\w.]+)/video/(\d+)"
        arma = lambda m: {"autor": m[0].lower(), "id": m[1], "url": f"https://www.tiktok.com/@{m[0]}/video/{m[1]}"}
    else:
        pat = r"https?://(?:www\.)?instagram\.com/(?:([\w.]+)/)?reels?/([\w-]{8,})"
        arma = lambda m: {"autor": (m[0] or "").lower() or None, "id": m[1], "url": f"https://www.instagram.com/reel/{m[1]}/"}
    vistos, out = set(), []
    for m in re.findall(pat, texto):
        x = arma(m)
        if x["id"] not in vistos:
            vistos.add(x["id"])
            out.append(x)
    return out


def freno_general(mensaje: str) -> bool:
    """¿El error de yt-dlp frena a toda la red o es de ese video? «Your IP address is blocked from accessing this
    post» y «Log in for access» son de UN video (región, edad, privado): no frenan al resto (17/11)."""
    return re.search(r"\b429\b|rate.?limit|too many requests|captcha", mensaje, re.I) is not None


def buscador_frenado(status: int, html: str) -> bool:
    return (status != 200 or "anomaly-modal" in html or "bots use DuckDuckGo" in html
            or re.search(r"captcha|unusual traffic|tráfico inusual", html[:50000], re.I) is not None)


def video_de_ytdlp(d: dict, red: str) -> dict:
    """La info de yt-dlp → el formato común de la API (lo que no vino queda en None, nunca 0)."""
    ts = d.get("timestamp")
    fecha = datetime.fromtimestamp(ts, timezone.utc).date().isoformat() if ts else (
        f"{d['upload_date'][:4]}-{d['upload_date'][4:6]}-{d['upload_date'][6:]}" if d.get("upload_date") else None)
    autor = d.get("uploader") if red == "tiktok" else (d.get("channel") or d.get("uploader_id") or d.get("uploader"))
    return {
        "red": red, "id": d.get("id"), "url": d.get("webpage_url") or d.get("url"),
        "autor": (autor or "").lower() or None, "texto": d.get("description") or d.get("title"),
        "fecha": fecha, "duracion": d.get("duration"), "vistas": d.get("view_count"),
        "me_gusta": d.get("like_count"), "comentarios": d.get("comment_count"),
        "compartidos": d.get("repost_count"), "guardados": d.get("save_count"),
        "ancho": d.get("width"), "alto": d.get("height"),
    }


def reels_de_instagram(scripts: list[str]) -> list[dict]:
    """De los <script> de /<usuario>/reels/ → reels con reproducciones. `fijado` = el autor lo dejó arriba."""
    out, vistos = [], set()

    def recorrer(o):
        if isinstance(o, dict):
            if "code" in o and "play_count" in o and o["code"] not in vistos:
                vistos.add(o["code"])
                out.append({"red": "instagram", "id": o["code"], "url": f"https://www.instagram.com/reel/{o['code']}/",
                            "vistas": o.get("play_count"), "me_gusta": o.get("like_count"),
                            "comentarios": o.get("comment_count"), "fijado": bool(o.get("clips_tab_pinned_user_ids"))})
            for v in o.values():
                recorrer(v)
        elif isinstance(o, list):
            for v in o:
                recorrer(v)

    for s in scripts:
        try:
            recorrer(json.loads(s))
        except ValueError:
            continue
    return out


def medir_contra_autor(videos: list[dict], mediana_autor: float | None) -> None:
    for v in videos:
        v["veces"] = round(v["vistas"] / mediana_autor, 2) if v.get("vistas") is not None and mediana_autor else None


# ── Ritmo, topes, frenos y caché ──────────────────────────────────────────────

class Ritmo:
    """Un pedido por vez a cada sitio, con pausa al azar, tope diario y freno con espera creciente (persistido)."""

    def __init__(self, archivo: Path):
        self.archivo = archivo
        self.locks = {r: threading.Lock() for r in RITMO}
        self.ultimo = {r: 0.0 for r in RITMO}
        self.estado = json.loads(archivo.read_text(encoding="utf-8")) if archivo.exists() else {}

    def _guardar(self):
        self.archivo.write_text(json.dumps(self.estado), encoding="utf-8")

    def tope(self, red: str) -> int:
        return int(os.environ.get(f"REDES_TOPE_{red.upper()}", RITMO[red][2]))

    def usar(self, red: str):
        """Llamar con el lock de la red tomado, justo antes de pedir."""
        hoy = date.today().isoformat()
        if self.estado.get("fecha") != hoy:
            self.estado.update(fecha=hoy, usados={})
        hasta = self.estado.get("bloqueado_hasta", {}).get(red, 0)
        if hasta > time.time():
            raise Bloqueado(red, hasta, self.estado.get("motivo", {}).get(red, "freno anterior"))
        usados = self.estado.setdefault("usados", {})
        if usados.get(red, 0) >= self.tope(red):
            manana = datetime.combine(date.today(), datetime.min.time()).timestamp() + 86400
            raise Bloqueado(red, manana, f"tope diario de {self.tope(red)} pedidos")
        lo, hi, _ = RITMO[red]
        falta = self.ultimo[red] + random.uniform(lo, hi) - time.time()
        if falta > 0:
            time.sleep(falta)
        self.ultimo[red] = time.time()
        usados[red] = usados.get(red, 0) + 1
        self._guardar()

    def frenar(self, red: str, motivo: str):
        espera = min(self.estado.setdefault("espera", {}).get(red, ESPERA_FRENO // 2) * 2, 24 * 3600)
        self.estado["espera"][red] = espera
        self.estado.setdefault("bloqueado_hasta", {})[red] = time.time() + espera
        self.estado.setdefault("motivo", {})[red] = motivo
        self._guardar()
        raise Bloqueado(red, time.time() + espera, motivo)

    def anduvo(self, red: str):
        if self.estado.get("espera", {}).pop(red, None) is not None:
            self._guardar()


class Cache:
    def __init__(self, archivo: Path, ttl=24 * 3600):
        self.db = sqlite3.connect(archivo, check_same_thread=False)
        self.db.execute("create table if not exists c (k text primary key, t real, v text)")
        self.ttl, self.lock = ttl, threading.Lock()

    def get(self, k):
        with self.lock:
            f = self.db.execute("select t, v from c where k = ?", (k,)).fetchone()
        return json.loads(f[1]) if f and time.time() - f[0] < self.ttl else None

    def put(self, k, v):
        with self.lock:
            self.db.execute("insert or replace into c values (?, ?, ?)", (k, time.time(), json.dumps(v)))
            self.db.commit()
        return v


DATOS.mkdir(parents=True, exist_ok=True)
ritmo = Ritmo(DATOS / "ritmo.json")
cache = Cache(DATOS / "cache.sqlite")


def cacheado(fn):
    def envuelta(**kw):
        k = f"{fn.__name__}:{json.dumps(kw, sort_keys=True)}"
        return cache.get(k) or cache.put(k, fn(**kw))
    envuelta.__name__ = fn.__name__
    return envuelta


# ── Pedidos afuera ────────────────────────────────────────────────────────────

def _buscador(query: str, red: str, pais: str | None) -> list[dict]:
    """Prueba los buscadores en orden; si uno está frenado o frena ahora, sigue con el otro."""
    from curl_cffi import requests
    region = (PAISES.get(pais.upper()) or _invalido(f"pais {pais} no está en terminos.json")) if pais else {}
    q = f"{'site:tiktok.com' if red == 'tiktok' else 'site:instagram.com/reel'} {query}"
    pedidos = {
        "yahoo": (f"https://{region['yahoo'] + '.' if region else ''}search.yahoo.com/search", {"p": q, "n": 30}),
        "ddg": ("https://html.duckduckgo.com/html/", {"q": q, **({"kl": region["ddg"]} if region else {})}),
    }
    frenos = []
    for motor in BUSCADORES:
        url, params = pedidos[motor]
        try:
            with ritmo.locks[motor]:
                ritmo.usar(motor)
                r = requests.get(url, params=params, impersonate="chrome", timeout=30)
                if buscador_frenado(r.status_code, r.text):
                    ritmo.frenar(motor, f"{motor} respondió {r.status_code} / pide verificación")
                ritmo.anduvo(motor)
            return links_buscador(r.text, red)
        except Bloqueado as e:
            frenos.append(e)
    raise min(frenos, key=lambda e: e.hasta)


def _ytdlp(url: str, red: str, plano=False, items: str | None = None) -> dict:
    import yt_dlp
    from yt_dlp.networking.impersonate import ImpersonateTarget
    opts = {"quiet": True, "no_warnings": True, "skip_download": True, "impersonate": ImpersonateTarget.from_str("chrome")}
    if plano:
        opts.update(extract_flat=True, playlist_items=items or "1:30")
    with ritmo.locks[red]:
        ritmo.usar(red)
        try:
            with yt_dlp.YoutubeDL(opts) as y:
                d = y.extract_info(url, download=False)
        except yt_dlp.utils.DownloadError as e:
            m = str(e)
            if freno_general(m):
                ritmo.frenar(red, m[:200])
            raise Invalido(f"yt-dlp no pudo leer {url}: {m[:200]}")
        ritmo.anduvo(red)
    return d


def _invalido(msg):
    raise Invalido(msg)


def _navegador(url: str, red: str, visible=False, hacer=None):
    """Abre la página en Chromium y devuelve (html, extra). `hacer(page)` corre adentro y devuelve extra."""
    from playwright.sync_api import sync_playwright
    with ritmo.locks[red]:
        ritmo.usar(red)
        with sync_playwright() as p:
            b = p.chromium.launch(channel="chromium", headless=not visible,
                                  args=["--disable-blink-features=AutomationControlled"])
            try:
                ctx = b.new_context(locale="es-AR", user_agent=UA, viewport={"width": 1366, "height": 900})
                ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
                pg = ctx.new_page()
                pg.goto(url, wait_until="domcontentloaded", timeout=60000)
                pg.wait_for_timeout(random.randint(6000, 9000))
                extra = hacer(pg) if hacer else None
                html = pg.content()
            finally:
                b.close()
    return html, extra


# ── Endpoints (mismos nombres que ScrapeCreators) ─────────────────────────────

def _cantidad(v, tope):
    n = int(v or 10)
    return max(1, min(n, tope))


@cacheado
def tiktok_perfil(handle: str, cantidad=30) -> dict:
    handle = handle.lstrip("@").strip().lower() or _invalido("falta handle")
    d = _ytdlp(f"https://www.tiktok.com/@{handle}", "tiktok", plano=True, items=f"1:{_cantidad(cantidad, 60)}")
    videos = [video_de_ytdlp({**e, "uploader": e.get("uploader") or handle}, "tiktok") for e in d.get("entries") or []]
    med = mediana(v["vistas"] for v in videos)
    medir_contra_autor(videos, med)
    return {"red": "tiktok", "autor": handle, "mediana_vistas": med, "videos": videos}


@cacheado
def tiktok_video(url: str) -> dict:
    "tiktok.com/" in (url or "") or _invalido("url de TikTok inválida")
    return video_de_ytdlp(_ytdlp(url, "tiktok"), "tiktok")


@cacheado
def instagram_reels(handle: str) -> dict:
    handle = handle.lstrip("@").strip().lower() or _invalido("falta handle")
    html, _ = _navegador(f"https://www.instagram.com/{handle}/reels/", "instagram")
    reels = reels_de_instagram([s for s in re.findall(r"<script[^>]*>(.*?)</script>", html, re.S) if "play_count" in s])
    if not reels:
        if re.search(r"/accounts/login|Iniciar sesión|Log in", html[:20000]) and "play_count" not in html:
            ritmo.frenar("instagram", "Instagram pidió iniciar sesión")
        return {"red": "instagram", "autor": handle, "mediana_vistas": None, "reels": [], "nota": "sin reels públicos"}
    med = mediana(r["vistas"] for r in reels if not r["fijado"])
    medir_contra_autor(reels, med)
    return {"red": "instagram", "autor": handle, "mediana_vistas": med, "reels": reels}


@cacheado
def instagram_post(url: str, vistas=True) -> dict:
    "instagram.com/" in (url or "") or _invalido("url de Instagram inválida")
    v = video_de_ytdlp(_ytdlp(url, "instagram"), "instagram")
    if vistas and v["autor"] and v["vistas"] is None:
        r = next((x for x in instagram_reels(handle=v["autor"])["reels"] if x["id"] == v["id"]), None)
        v["vistas"] = r and r["vistas"]  # solo si está entre sus últimos 12 reels
    return v


def buscar(red: str, query: str, pais=None, cantidad=10, medir=True) -> dict:
    """Busca y trae los datos de cada video. medir=True agrega la mediana del autor y `veces` (viral ≥ 3)."""
    query = (query or "").strip() or _invalido("falta query")
    links = _buscador(query, red, pais)[: _cantidad(cantidad, 20)]
    videos, errores = [], []
    for x in links:
        try:
            videos.append(tiktok_video(url=x["url"]) if red == "tiktok" else instagram_post(url=x["url"], vistas=False))
        except Invalido as e:
            errores.append(str(e))
    if medir in (True, "1", "true"):
        for autor in {v["autor"] for v in videos if v["autor"]}:
            try:
                p = tiktok_perfil(handle=autor) if red == "tiktok" else instagram_reels(handle=autor)
            except Invalido as e:
                errores.append(str(e))
                continue
            propios = {x["id"]: x for x in p.get("videos") or p.get("reels") or []}
            for v in (v for v in videos if v["autor"] == autor):
                if v["vistas"] is None and v["id"] in propios:
                    v["vistas"] = propios[v["id"]]["vistas"]
                v["mediana_autor"] = p["mediana_vistas"]
                medir_contra_autor([v], p["mediana_vistas"])
    return {"red": red, "query": query, "pais": pais, "videos": videos, "errores": errores}


def tiktok_tendencias(pais: str) -> dict:
    pais = (pais or "").upper()
    pais in PAISES or _invalido(f"pais {pais} no está en terminos.json")
    k = f"tendencias:{pais}:{date.today()}"
    if (c := cache.get(k)) is not None:
        return c
    cuerpo = {"timeRange": 7, "countryCode": pais, "page": 1, "limit": 20}

    def pedir(pg):
        return pg.evaluate("""async (c) => { const r = await fetch('/CreativeOne/KnowledgeAPI/GetHashtagList',
            {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(c), credentials: 'include'});
            return await r.json(); }""", cuerpo)

    _, j = _navegador("https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/es",
                      "creative", visible=True, hacer=pedir)
    items = (j or {}).get("items") or []
    return cache.put(k, {"pais": pais, "hashtags": [{"hashtag": i.get("hashtagName"), "publicaciones": i.get("publishCnt"),
                                                     "puesto": i.get("rankIndex")} for i in items]})


def descargar(url: str) -> Path:
    import yt_dlp
    from yt_dlp.networking.impersonate import ImpersonateTarget
    red = "tiktok" if "tiktok.com/" in url else "instagram" if "instagram.com/" in url else _invalido("url inválida")
    carpeta = Path(tempfile.mkdtemp(dir=DATOS))
    opts = {"quiet": True, "no_warnings": True, "noprogress": True, "outtmpl": str(carpeta / "%(id)s.%(ext)s"),
            "format": "best[height<=1920]/best", "impersonate": ImpersonateTarget.from_str("chrome")}
    with ritmo.locks[red]:
        ritmo.usar(red)
        try:
            with yt_dlp.YoutubeDL(opts) as y:
                y.download([url])
        except yt_dlp.utils.DownloadError as e:
            shutil.rmtree(carpeta, ignore_errors=True)
            raise Invalido(f"no se pudo bajar {url}: {str(e)[:200]}")
    archivos = list(carpeta.iterdir())
    archivos or _invalido("yt-dlp no dejó archivo")
    return archivos[0]


RUTAS = {
    "/v1/tiktok/search/keyword": lambda q: buscar("tiktok", q.get("query"), q.get("pais"), q.get("cantidad"), q.get("medir", True)),
    "/v3/tiktok/profile/videos": lambda q: tiktok_perfil(handle=q.get("handle", ""), cantidad=int(q.get("cantidad") or 30)),
    "/v2/tiktok/video": lambda q: tiktok_video(url=q.get("url", "")),
    "/v1/tiktok/trends": lambda q: tiktok_tendencias(q.get("pais", "")),
    "/v2/instagram/reels/search": lambda q: buscar("instagram", q.get("query"), q.get("pais"), q.get("cantidad"), q.get("medir", True)),
    "/v1/instagram/user/reels": lambda q: instagram_reels(handle=q.get("handle", "")),
    "/v1/instagram/post": lambda q: instagram_post(url=q.get("url", "")),
}


# ── Servidor ──────────────────────────────────────────────────────────────────

class Manejador(BaseHTTPRequestHandler):
    def _json(self, codigo, cuerpo):
        b = json.dumps(cuerpo, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == "/salud":
            return self._json(200, {"ok": True, "version": VERSION, "ritmo": ritmo.estado})
        token = os.environ.get("REDES_TOKEN")
        if not token or self.headers.get("x-api-key") != token:
            return self._json(401, {"error": "token inválido"})
        try:
            if u.path == "/descargar":
                f = descargar(q.get("url", ""))
                try:
                    self.send_response(200)
                    self.send_header("content-type", "video/mp4")
                    self.send_header("content-length", str(f.stat().st_size))
                    self.send_header("content-disposition", f'attachment; filename="{f.name}"')
                    self.end_headers()
                    with f.open("rb") as fh:
                        shutil.copyfileobj(fh, self.wfile)
                finally:
                    shutil.rmtree(f.parent, ignore_errors=True)
                return
            if u.path not in RUTAS:
                return self._json(404, {"error": f"no existe {u.path}", "rutas": sorted(RUTAS)})
            return self._json(200, RUTAS[u.path](q))
        except Bloqueado as e:
            return self._json(429, {"error": "bloqueado", "red": e.red, "motivo": e.motivo,
                                    "reintentar": datetime.fromtimestamp(e.hasta, timezone.utc).isoformat()})
        except (Invalido, ValueError) as e:
            return self._json(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001 — que el servicio no se caiga por un pedido
            return self._json(500, {"error": f"{type(e).__name__}: {e}"[:300]})

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[redes] {self.address_string()} {fmt % args}\n")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "servir":
        os.environ.get("REDES_TOKEN") or sys.exit("falta REDES_TOKEN")
        puerto = int(os.environ.get("REDES_PUERTO", "8790"))
        print(f"[redes] {VERSION} escuchando en :{puerto}", flush=True)
        ThreadingHTTPServer(("0.0.0.0", puerto), Manejador).serve_forever()
    elif len(sys.argv) > 1 and sys.argv[1] in RUTAS:
        sys.stdout.reconfigure(encoding="utf-8")  # emojis de los copys; en Windows la consola es cp1252
        args = dict(a.split("=", 1) for a in sys.argv[2:])
        print(json.dumps(RUTAS[sys.argv[1]](args), ensure_ascii=False, indent=1))
    else:
        sys.exit(__doc__)
