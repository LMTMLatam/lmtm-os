"""Tests de lmtm-redes con respuestas reales guardadas (muestras/, 17/11). Si TikTok, Instagram o DuckDuckGo cambian
el formato, fallan acá y no en una corrida. Correr: python -I -m unittest test_redes.py (desde redes/)."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

AQUI = Path(__file__).parent
os.environ["REDES_DATOS"] = tempfile.mkdtemp()
sys.path.insert(0, str(AQUI))
import redes  # noqa: E402

M = AQUI / "muestras"


class Parsers(unittest.TestCase):
    def test_buscador_tiktok(self):
        links = redes.links_buscador((M / "ddg_tiktok.html").read_text(encoding="utf-8"), "tiktok")
        self.assertGreaterEqual(len(links), 3)
        self.assertEqual(len({x["id"] for x in links}), len(links))
        for x in links:
            self.assertRegex(x["url"], r"^https://www\.tiktok\.com/@[\w.]+/video/\d+$")
            self.assertTrue(x["autor"])

    def test_buscador_instagram(self):
        links = redes.links_buscador((M / "ddg_instagram.html").read_text(encoding="utf-8"), "instagram")
        self.assertGreaterEqual(len(links), 3)
        for x in links:
            self.assertRegex(x["url"], r"^https://www\.instagram\.com/reel/[\w-]+/$")

    def test_buscador_yahoo_instagram(self):
        links = redes.links_buscador((M / "yahoo_instagram.html").read_text(encoding="utf-8"), "instagram")
        self.assertGreaterEqual(len(links), 3)
        self.assertFalse(redes.buscador_frenado(200, (M / "yahoo_instagram.html").read_text(encoding="utf-8")))

    def test_freno_general_o_de_un_video(self):
        self.assertFalse(redes.freno_general("ERROR: [TikTok] 763: Your IP address is blocked from accessing this post"))
        self.assertFalse(redes.freno_general("This post may not be comfortable for some audiences. Log in for access"))
        self.assertTrue(redes.freno_general("HTTP Error 429: Too Many Requests"))
        self.assertTrue(redes.freno_general("Requested content is not available, rate-limit reached or login required"))

    def test_freno_del_buscador(self):
        self.assertFalse(redes.buscador_frenado(200, (M / "ddg_tiktok.html").read_text(encoding="utf-8")))
        self.assertTrue(redes.buscador_frenado(200, '<div class="anomaly-modal">'))
        self.assertTrue(redes.buscador_frenado(202, ""))

    def test_video_tiktok(self):
        d = json.loads((M / "ytdlp_tiktok_video.json").read_text(encoding="utf-8"))
        v = redes.video_de_ytdlp(d, "tiktok")
        self.assertEqual(v["vistas"], d["view_count"])
        self.assertEqual(v["guardados"], d["save_count"])
        self.assertEqual(v["compartidos"], d["repost_count"])
        self.assertEqual(v["autor"], d["uploader"].lower())
        self.assertRegex(v["fecha"], r"^\d{4}-\d{2}-\d{2}$")

    def test_lo_que_falta_es_none_no_cero(self):
        v = redes.video_de_ytdlp({"id": "x"}, "instagram")
        self.assertIsNone(v["vistas"])
        self.assertIsNone(v["me_gusta"])
        self.assertIsNone(v["fecha"])

    def test_perfil_tiktok_y_veces(self):
        p = json.loads((M / "ytdlp_tiktok_perfil.json").read_text(encoding="utf-8"))
        videos = [redes.video_de_ytdlp({**e, "uploader": p["uploader"]}, "tiktok") for e in p["entries"]]
        med = redes.mediana(v["vistas"] for v in videos)
        self.assertIsNotNone(med)
        redes.medir_contra_autor(videos, med)
        self.assertEqual(videos[0]["veces"], round(videos[0]["vistas"] / med, 2))
        redes.medir_contra_autor(videos, None)  # sin mediana no hay «veces»
        self.assertTrue(all(v["veces"] is None for v in videos))

    def test_reels_instagram(self):
        reels = redes.reels_de_instagram(json.loads((M / "ig_reels_scripts.json").read_text(encoding="utf-8")))
        self.assertEqual(len(reels), 12)
        self.assertTrue(all(isinstance(r["vistas"], int) for r in reels))
        self.assertEqual(sum(r["fijado"] for r in reels), 4)
        self.assertEqual(redes.reels_de_instagram(["no es json", "{}"]), [])

    def test_mediana(self):
        self.assertIsNone(redes.mediana([None, None]))
        self.assertEqual(redes.mediana([1, None, 3]), 2)


class Rotacion(unittest.TestCase):
    """Si Yahoo frena, busca en DuckDuckGo; si frenan los dos, avisa el que se libera antes."""

    def setUp(self):
        redes.ritmo = redes.Ritmo(Path(tempfile.mkdtemp()) / "ritmo.json")

    def _falso(self, respuestas):
        from unittest import mock

        class R:
            def __init__(self, status, text):
                self.status_code, self.text = status, text
        it = iter(respuestas)
        return mock.patch("curl_cffi.requests.get", side_effect=lambda *a, **k: R(*next(it)))

    def test_si_yahoo_frena_usa_ddg(self):
        html = (M / "ddg_tiktok.html").read_text(encoding="utf-8")
        with self._falso([(429, ""), (200, html)]):
            links = redes._buscador("departamento", "tiktok", "AR")
        self.assertGreaterEqual(len(links), 3)
        self.assertIn("yahoo", redes.ritmo.estado["bloqueado_hasta"])

    def test_si_frenan_los_dos(self):
        with self._falso([(429, ""), (202, "")]), self.assertRaises(redes.Bloqueado):
            redes._buscador("departamento", "tiktok", None)


class Analisis(unittest.TestCase):
    def test_claves_salen_del_servidor(self):
        import mirar
        ks = mirar.claves()
        self.assertEqual(len(ks), len(set(ks)))
        self.assertIn("cara_primer_cuadro", ks)
        self.assertGreaterEqual(len(ks), 20)

    def test_relevancia_del_rubro(self):
        import mirar
        self.assertFalse(mirar.relevante({"rubro": "inmobiliaria", "texto": "Llegó Navidad a @Casaideas Chile", "transcripcion": "aromitas"}))
        self.assertTrue(mirar.relevante({"rubro": "inmobiliaria", "texto": "", "transcripcion": "4 ambientes en San Martín"}))
        self.assertFalse(mirar.relevante({"rubro": "inmobiliaria", "transcripcion": "no había combustible, me tuve que ir a la casa"}))
        self.assertTrue(mirar.relevante({"rubro": "inmobiliaria", "transcripcion": "tu próxima inversión: un proyecto en una zona con demanda"}))
        self.assertTrue(mirar.relevante({"rubro": "general", "texto": "Ser dueño de negocio no es fácil"}))
        self.assertFalse(mirar.relevante({"rubro": "general", "texto": "", "transcripcion": "no se meta con mi vida que yo en la ruya jamás"}))
        self.assertFalse(mirar.relevante({"rubro": "general", "texto": "올해로 75세가 된 윤미라의 놀라운 동안 비결", "transcripcion": "producto"}))
        broker = {"texto": "Renová el piso de la cochera y los ambientes sin demoler con Broker", "transcripcion": "se aplica encima del cemento, revestimiento antideslizante"}
        self.assertFalse(mirar.relevante({**broker, "rubro": "inmobiliaria"}))
        self.assertTrue(mirar.relevante({**broker, "rubro": "construccion-materiales"}))
        self.assertTrue(mirar.relevante({"rubro": "automotor-autopartes", "texto": "cambio de frenos paso a paso"}))

    def test_lift_y_reglas(self):
        import analizar
        self.assertIsNone(analizar.lift(1, 0, 1, 5))
        self.assertEqual(analizar.lift(19, 20, 4, 20), round((20 / 22) / (5 / 22), 2))
        ks = __import__("mirar").claves()
        fichas = [{"id": f"v{i}", "grupo": "viral", "forma": {"duracion": 30, "cortes": 15}} for i in range(20)] + \
                 [{"id": f"c{i}", "grupo": "control", "forma": {"duracion": 60, "cortes": 6}} for i in range(20)]
        etiquetas = {f["id"]: {"respuestas": {k: (k == "cara_primer_cuadro") == f["id"].startswith("v") for k in ks}, "tipo": "recorrido", "gancho": "g"}
                     for f in fichas}
        r = analizar.comparar(fichas, etiquetas)
        self.assertEqual(r["forma"]["cortes_min"], {"viral": 30.0, "control": 6.0})
        self.assertEqual(r["preguntas"]["cara_primer_cuadro"]["veredicto"], "regla")
        self.assertEqual(r["preguntas"]["humor"]["veredicto"], "no hacer")  # todos los control sí, ningún viral
        self.assertEqual(r["tipos"]["recorrido"]["n"], 20)
        self.assertGreater(analizar.p_valor(2, 105, 2, 69), 0.5)  # loop_final del 18/11: ruido, no «no hacer»
        self.assertLess(analizar.p_valor(48, 105, 48, 69), 0.01)


class RitmoYFrenos(unittest.TestCase):
    def setUp(self):
        self.r = redes.Ritmo(Path(tempfile.mkdtemp()) / "ritmo.json")

    def test_tope_diario(self):
        os.environ["REDES_TOPE_TIKTOK"] = "1"
        try:
            self.r.usar("tiktok")
            with self.assertRaises(redes.Bloqueado):
                self.r.usar("tiktok")
        finally:
            del os.environ["REDES_TOPE_TIKTOK"]

    def test_freno_persiste_y_crece(self):
        with self.assertRaises(redes.Bloqueado) as c1:
            self.r.frenar("instagram", "429")
        with self.assertRaises(redes.Bloqueado):
            self.r.usar("instagram")
        with self.assertRaises(redes.Bloqueado) as c2:
            self.r.frenar("instagram", "429 otra vez")
        self.assertGreater(c2.exception.hasta - c1.exception.hasta, 25 * 60)
        otro = redes.Ritmo(self.r.archivo)  # al reiniciar el servicio el freno sigue
        with self.assertRaises(redes.Bloqueado):
            otro.usar("instagram")


if __name__ == "__main__":
    unittest.main()
