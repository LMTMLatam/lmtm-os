// Movimiento de los reels: insertos animados y modos de gancho, subtítulos y transiciones.
// Lo usan los dos armadores (plantilla-reel.mjs y plantilla-filmado.mjs). El agente solo escribe
// datos en guion.json: acá está el HTML y el movimiento, determinista y sin tokens.
//
// Reglas de cuadro por cuadro (HyperFrames busca cada cuadro en la línea de tiempo):
//   - se anima con transformaciones (x/y/scale/opacity), nunca left/top: saltan de a píxel;
//   - nada de Math.random ni callbacks: un contador son pasos con tl.set;
//   - GSAP no interpola variables CSS: a la línea de tiempo van los colores;
//   - todas las clases llevan el prefijo mo-: una clase igual a la del root ya lavó un reel entero.

export const r3 = (n) => Number(Number(n).toFixed(3));
export const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
// Muchas tipografías de marca dibujan «» como << >>.
const pantalla = (s) => esc(String(s ?? "").replace(/[«»]/g, '"'));

/** Luminancia relativa (0 negro, 1 blanco). */
export const luz = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contraste = (a, b) => (Math.max(luz(a), luz(b)) + 0.05) / (Math.min(luz(a), luz(b)) + 0.05);
const hexOk = (c) => /^#[0-9a-f]{6}$/i.test(c ?? "");
const tintaSobre = (bg) => (contraste(bg, "#ffffff") >= contraste(bg, "#111111") ? "#ffffff" : "#111111");

/** Los colores de un panel salen de la marca. `panel`: oscuro, claro o color. */
export function temaDe(M, panel = "oscuro") {
  const color = hexOk(M.color) ? M.color : "#123456";
  const oscuro = hexOk(M.oscuro) && luz(M.oscuro) < 0.08 ? M.oscuro : (luz(color) < 0.08 ? color : "#0d1220");
  const claro = hexOk(M.claro) && luz(M.claro) > 0.7 ? M.claro : "#f4f2ec";
  const crudo = hexOk(M.acento) ? M.acento : color;
  const hayAcento = luz(crudo) > 0.04 && luz(crudo) < 0.8;
  const hayColor = luz(color) > 0.04 && luz(color) < 0.8;
  const bg = panel === "claro" ? claro : panel === "color" && hayColor ? color : oscuro;
  const tinta = tintaSobre(bg);
  const candidato = panel === "color" ? claro : hayAcento ? crudo : claro;
  const acento = contraste(candidato, bg) >= 3 ? candidato : tinta;
  const sobreClaro = tinta !== "#ffffff";
  return {
    bg, tinta, acento, sobreAcento: tintaSobre(acento),
    mute: sobreClaro ? "rgba(17,17,17,.66)" : "rgba(255,255,255,.74)",
    tarjeta: sobreClaro ? "rgba(255,255,255,.86)" : "rgba(255,255,255,.1)",
    linea: sobreClaro ? "rgba(17,17,17,.14)" : "rgba(255,255,255,.18)",
    apagado: sobreClaro ? "rgba(17,17,17,.3)" : "rgba(255,255,255,.34)",
  };
}
const varsDe = (T) => `--mo-bg:${T.bg};--mo-tinta:${T.tinta};--mo-acento:${T.acento};--mo-sobre:${T.sobreAcento};--mo-mute:${T.mute};--mo-tarjeta:${T.tarjeta};--mo-linea:${T.linea};`;

const resaltar = (t) => pantalla(t).replace(/\*([^*]+)\*/g, '<span class="mo-clave">$1</span>');

/**
 * Le pone a cada palabra del guion el segundo en que la dice la voz. El texto es el del guion (whisper
 * escribe mal las marcas: «Tuplacar»); de `rec` salen solo los tiempos. Lo que no coincide (1956 y
 * «mil novecientos…») se reparte entre sus vecinas. guion: [{ t }], rec: [{ text, start, end }].
 */
export function alinear(guion, rec) {
  const a = guion.map((w) => norm(w.t));
  const b = rec.map((w) => norm(w.text));
  const igual = (x, y) => x && y && (x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))));
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = igual(a[i], b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const t = new Array(a.length).fill(null);
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (igual(a[i], b[j])) { t[i] = rec[j].start; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  const fin = rec.length ? rec[rec.length - 1].end : 1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] != null) continue;
    let k = i;
    while (k < t.length && t[k] == null) k++;
    const desde = i > 0 ? t[i - 1] : (rec[0]?.start ?? 0);
    const hasta = k < t.length ? t[k] : fin;
    for (let x = i; x < k; x++) t[x] = desde + ((hasta - desde) * (x - i + (i > 0 ? 1 : 0))) / (k - i + 1);
    i = k - 1;
  }
  return guion.map((w, i) => ({ ...w, ini: Math.max(0, t[i]) }));
}

/** Cuándo entra cada texto: cuando la voz lo nombra; si no lo dice, repartidos. `voz`: [{ t, ini }] del tramo. */
export function momentosDe(textos, voz, t0, dur) {
  const parejos = textos.map((_, i) => r3(t0 + 0.25 + (i * (dur * 0.72)) / Math.max(textos.length, 1)));
  if (!voz?.length) return parejos;
  const palabras = textos.flatMap((tx, i) => String(tx).replace(/\*/g, "").split(/\s+/).filter(Boolean).map((t) => ({ t, de: i })));
  const dichas = new Set(voz.map((w) => norm(w.t)));
  if (!palabras.some((w) => dichas.has(norm(w.t)))) return parejos;
  const al = alinear(palabras, voz.map((w) => ({ text: w.t, start: w.ini, end: w.ini + 0.2 })));
  return textos.map((_, i) => r3(Math.min(Math.max(t0 + 0.05, al.find((w) => w.de === i).ini - 0.05), t0 + dur - 0.4)));
}

/**
 * Estilos de movimiento: ritmo, gancho, transiciones, subtítulos, panel y cierre. Se combinan con la marca
 * de cada cliente (paleta, tipografía y logo salen de ella): no son looks. Los nombres también están en
 * server/src/services/video-variedad.ts (lo controla un test).
 */
export const MOVIMIENTOS = {
  directo: { gancho: "golpe", transiciones: [], subs: "pop", empuje: 1.07, panel: "oscuro", cierre: "sube" },
  pulso: { gancho: "golpe", transiciones: ["desenfoque", "zoom"], subs: "caja", empuje: 1.1, panel: "color", cierre: "golpe" },
  relato: { gancho: "tipeo", transiciones: ["fundido"], subs: "karaoke", empuje: 1.035, panel: "claro", cierre: "tipeo" },
  vitrina: { gancho: "sube", transiciones: ["empuje", "zoom", "desenfoque"], subs: "pop", empuje: 1.05, panel: "oscuro", cierre: "sube" },
  ficha: { gancho: "tipeo", transiciones: ["empuje"], subs: "caja", empuje: 1.035, panel: "claro", cierre: "golpe" },
};

export const TIPOS_INSERTO = ["numero", "lista", "pasos", "chat", "pantalla"];
/** Lo mínimo para que se entienda: el chat necesita ver llegar los mensajes; la pantalla, el resultado quieto ≥1 s. */
export const DUR_MINIMA = { numero: 1.8, lista: 2.5, pasos: 2.8, chat: 4, pantalla: 3.4 };
const lineasDeBurbuja = (txt) => Math.ceil(String(txt).length / 28);
const altoDeChat = (ms) => ms.reduce((h, m) => h + lineasDeBurbuja(m.txt) * 56 + 72, 0);

/** Lo que el guion tiene que traer. Devuelve los problemas (lista vacía = cumple). */
export function validarInserto(I, q, textoDicho = null) {
  const e = [];
  if (!TIPOS_INSERTO.includes(I?.tipo)) return [`${q}.tipo: ${TIPOS_INSERTO.join(", ")}`];
  if (I.tipo === "numero") {
    if (!Number.isInteger(Number(I.valor))) e.push(`${q}.valor: un número entero (un decimal va en una tarjeta o en el texto)`);
    if (!String(I.origen ?? "").trim()) e.push(`${q}.origen: de dónde salió el número (guía, web o pedido). Sin fuente no va`);
    // Nada inventado: lo que se muestra es lo que dice el guion.
    if (textoDicho != null && !String(textoDicho).replace(/\./g, "").includes(String(I.valor))) e.push(`${q}: el número ${I.valor} no está en el texto de la frase; escribilo en cifras en el guion`);
  }
  if (I.tipo === "lista" && !(Array.isArray(I.items) && I.items.length >= 2 && I.items.length <= 4)) e.push(`${q}.items: de 2 a 4`);
  if (I.tipo === "pasos") {
    if (!(Array.isArray(I.pasos) && I.pasos.length >= 2 && I.pasos.length <= 4)) e.push(`${q}.pasos: de 2 a 4`);
    else if (I.pasos.some((p) => !String(p.txt ?? "").trim())) e.push(`${q}.pasos[].txt: falta`);
  }
  if (I.tipo === "chat") {
    const ms = Array.isArray(I.mensajes) ? I.mensajes : [];
    if (ms.length < 2 || ms.length > 5) e.push(`${q}.mensajes: de 2 a 5`);
    if (ms.some((m) => !["cliente", "negocio"].includes(m.de) || !String(m.txt ?? "").trim())) e.push(`${q}.mensajes[]: { de: cliente|negocio, txt, hora }`);
    if (altoDeChat(ms) > 720) e.push(`${q}.mensajes: no entran en el teléfono; acortalos`);
    if (!String(I.negocio ?? "").trim()) e.push(`${q}.negocio: el nombre de la marca`);
  }
  if (I.tipo === "pantalla") {
    if (!String(I.imagen ?? "").trim()) e.push(`${q}.imagen: la captura real de la web o tienda del cliente`);
    if (!Number.isFinite(Number(I.foco?.x)) || !Number.isFinite(Number(I.foco?.y))) e.push(`${q}.foco: { x, y } en % de la imagen, donde hace clic`);
  }
  return e;
}

/** Los textos de un inserto que la voz puede nombrar, para que entren cuando se dicen. */
export const textosDeInserto = (I) => (I.tipo === "lista" ? I.items : I.tipo === "pasos" ? I.pasos.map((p) => p.txt) : []);
/** Lo que el inserto escribe en pantalla, para el aviso de precios y promos. */
export const textoDeInserto = (I) => JSON.stringify([I.etiqueta, I.prefijo, I.sufijo, I.texto, I.titulo, I.items, I.pasos, I.resultado, I.mensajes?.map((m) => m.txt), I.valor]);

/** Cuentakilómetros: cada dígito es una tira que gira hasta su valor; cuanto más a la derecha, más vueltas. */
function odometro(n, id, t, dur, miles) {
  const txt = miles ? Number(n).toLocaleString("es-AR") : String(n);
  const ndig = [...txt].filter((c) => /\d/.test(c)).length;
  const largo = 10 * (ndig + 1);
  const h = [], js = [];
  let pos = 0;
  [...txt].forEach((c, i) => {
    if (!/\d/.test(c)) { h.push(`<span class="mo-od-sep">${esc(c)}</span>`); return; }
    const tira = Array.from({ length: largo }, (_, d) => `<b>${d % 10}</b>`).join("");
    h.push(`<span class="mo-od-col"><span class="mo-od-tira" id="${id}-od${i}">${tira}</span></span>`);
    const meta = (pos + 1) * 10 + Number(c);
    js.push(`tl.fromTo("#${id}-od${i}", { yPercent: 0 }, { yPercent: ${r3((-100 * meta) / largo)}, duration: ${r3(dur + pos * 0.12)}, ease: "power3.out" }, ${r3(t)});`);
    pos++;
  });
  return { html: h.join(""), js, largo: txt.length };
}

const numero = (I, { id, t0, dur }) => {
  const n = Number(I.valor);
  // Un año va sin punto de miles («1956», no «1.956»); "miles": true/false lo fuerza.
  const miles = I.miles ?? !(n >= 1800 && n <= 2100);
  // Los guiones viejos del filmado traen la leyenda en `sufijo`.
  const sufijo = String(I.sufijo ?? "").length <= 4 ? I.sufijo : "";
  const leyenda = I.texto ?? (sufijo ? "" : I.sufijo);
  const cuenta = Math.min(1.1, dur * 0.4);
  const od = odometro(n, id, t0 + 0.15, cuenta, miles);
  const cifras = od.largo + String(I.prefijo ?? "").length + String(sufijo ?? "").length;
  const tam = Math.min(360, Math.floor(930 / (cifras * 0.66)));
  const js = [...od.js, `tl.fromTo("#${id}-val", { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: ${r3(cuenta)}, ease: "power2.out" }, ${r3(t0 + 0.15)});`];
  if (I.etiqueta) js.push(`tl.fromTo("#${id}-et", { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, ${r3(t0 + 0.05)});`);
  if (leyenda) js.push(`tl.fromTo("#${id}-ley", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, ${r3(t0 + 0.35)});`);
  const barras = Array.isArray(I.barras) ? I.barras.map(Number) : [];
  const max = Math.max(...barras, 1);
  const barrasHtml = barras.map((b, k) => {
    js.push(`tl.fromTo("#${id}-b${k}", { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.42, ease: "back.out(1.4)" }, ${r3(t0 + 0.25 + (Math.min(dur - 0.4, 2.2) * k) / barras.length)});`);
    return `<div class="mo-col" id="${id}-b${k}"><span>${b.toLocaleString("es-AR")}</span><div class="mo-barra" style="height:${Math.round(70 + (300 * b) / max)}px"></div></div>`;
  }).join("");
  return {
    html: `${I.etiqueta ? `<div class="mo-chip" id="${id}-et"><i></i>${pantalla(I.etiqueta)}</div>` : ""}
      <div class="mo-num" id="${id}-val" style="font-size:${tam}px">${I.prefijo ? `<span class="mo-num-af">${pantalla(I.prefijo)}</span>` : ""}${od.html}${sufijo ? `<span class="mo-num-af">${pantalla(sufijo)}</span>` : ""}</div>
      ${leyenda ? `<div class="mo-ley" id="${id}-ley">${resaltar(leyenda)}</div>` : ""}
      ${barras.length ? `<div class="mo-barras">${barrasHtml}</div>` : ""}`,
    js,
  };
};

const lista = (I, { id, t0, dur, momentos }) => {
  const n = I.items.length;
  const ts = momentos ?? momentosDe(I.items, null, t0 + 0.4, dur - 0.4);
  const js = [`tl.fromTo("#${id}-pg", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${r3(t0 + 0.2)});`];
  if (I.titulo) js.push(`tl.fromTo("#${id}-t", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, ${r3(t0 + 0.05)});`);
  js.push(`tl.fromTo("#${id}-fill", { scaleX: 0 }, { scaleX: ${r3(1 / n)}, duration: 0.35, ease: "power2.out" }, ${r3(ts[0] + 0.25)});`);
  const filas = I.items.map((it, i) => {
    js.push(`tl.fromTo("#${id}-i${i}", { y: 90, rotation: ${i % 2 ? -3 : 3}, scale: 0.9, opacity: 0 }, { y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.5, ease: "expo.out" }, ${r3(ts[i])});`);
    js.push(`tl.fromTo("#${id}-b${i}", { scale: 0, rotation: -60 }, { scale: 1, rotation: 0, duration: 0.3, ease: "back.out(2.2)" }, ${r3(ts[i] + 0.25)});`);
    if (i > 0) js.push(`tl.fromTo("#${id}-fill", { scaleX: ${r3(i / n)} }, { scaleX: ${r3((i + 1) / n)}, duration: 0.35, ease: "power2.out", immediateRender: false }, ${r3(ts[i] + 0.25)});`);
    js.push(`tl.set("#${id}-c${i}", { opacity: 0 }, ${r3(ts[i] + 0.25)}); tl.set("#${id}-c${i + 1}", { opacity: 1 }, ${r3(ts[i] + 0.25)});`);
    return `<div class="mo-item" id="${id}-i${i}"><span class="mo-tilde" id="${id}-b${i}">✓</span><span class="mo-item-tx">${resaltar(it)}</span></div>`;
  }).join("");
  const contador = Array.from({ length: n + 1 }, (_, k) => `<span id="${id}-c${k}" style="opacity:${k ? 0 : 1}">${k}/${n}</span>`).join("");
  return {
    html: `${I.titulo ? `<div class="mo-tit" id="${id}-t">${resaltar(I.titulo)}</div>` : ""}
      <div class="mo-prog" id="${id}-pg"><span class="mo-pista"><i id="${id}-fill"></i></span><span class="mo-cuenta">${contador}</span></div>${filas}`,
    js,
  };
};

const pasos = (I, { id, t0, dur, momentos }) => {
  const ts = momentos ?? momentosDe(I.pasos.map((p) => p.txt), null, t0 + 0.1, dur - 0.3);
  const js = [];
  if (I.titulo) js.push(`tl.fromTo("#${id}-t", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.35 }, ${r3(t0 + 0.05)});`);
  const filas = I.pasos.map((p, i) => {
    js.push(`tl.fromTo("#${id}-n${i}", { y: 40, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.42, ease: "power3.out" }, ${r3(ts[i])});`);
    let h = `<div class="mo-nodo" id="${id}-n${i}"><span class="mo-nodo-n">${i + 1}</span><span class="mo-nodo-tx"><span>${resaltar(p.txt)}</span>${p.nota ? `<span class="mo-nota">${pantalla(p.nota)}</span>` : ""}</span></div>`;
    if (i < I.pasos.length - 1) {
      const tf = ts[i] + 0.4;
      // La flecha se dibuja y un punto viaja: el flujo se ve pasar.
      const vueltas = Math.max(0, Math.floor((t0 + dur - tf - 0.35) / 0.8) - 1);
      js.push(`tl.fromTo("#${id}-f${i}", { scaleY: 0 }, { scaleY: 1, duration: 0.32, ease: "power2.inOut" }, ${r3(tf)});`);
      js.push(`tl.fromTo("#${id}-p${i}", { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.18 }, ${r3(tf + 0.26)});`);
      js.push(`tl.fromTo("#${id}-q${i}", { y: 0, opacity: 1 }, { y: 50, opacity: 0, duration: 0.8, ease: "power1.in", repeat: ${vueltas}, immediateRender: false }, ${r3(tf + 0.35)});`);
      js.push(`tl.set("#${id}-q${i}", { opacity: 0 }, ${r3(t0)});`);
      h += `<div class="mo-flecha"><span class="mo-linea" id="${id}-f${i}"></span><span class="mo-punta" id="${id}-p${i}"></span><i class="mo-pulso" id="${id}-q${i}"></i></div>`;
    }
    return h;
  }).join("");
  return { html: `${I.titulo ? `<div class="mo-kick" id="${id}-t">${pantalla(I.titulo)}</div>` : ""}${filas}`, js };
};

/** Cómo se pide o se reserva. Siempre con la etiqueta EJEMPLO: nunca es un testimonio ni un cliente real. */
const chat = (I, { id, t0, dur }) => {
  const ms = I.mensajes;
  // La notificación se queda ~1 s quieta antes de volverse globo: en una escena corta no entra.
  const aviso = I.aviso !== false && ms[0]?.de !== "negocio" && dur >= 4.5;
  const ini = t0 + (aviso ? 1.9 : 0.55);
  const paso = ((dur - (ini - t0)) * 0.72) / ms.length;
  const ts = ms.map((_, i) => r3(ini + 0.1 + i * paso));
  const negocios = ms.map((m, i) => (m.de === "negocio" ? i : -1)).filter((i) => i >= 0);
  const destacar = I.destacar ?? negocios.at(-1);
  const js = [`tl.fromTo("#${id}-ph", { y: 520, rotation: -4, scale: 0.92, opacity: 0 }, { y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.8, ease: "power4.out" }, ${r3(t0 + 0.05)});`];
  let notif = "";
  if (aviso) {
    notif = `<div class="mo-notif" id="${id}-nt"><span class="mo-nt-ico"></span><span class="mo-nt-tx"><b>Mensaje nuevo</b><span>${pantalla(ms[0].txt)}</span></span><span class="mo-nt-hora">${pantalla(ms[0].hora ?? "ahora")}</span></div>`;
    js.push(`tl.fromTo("#${id}-nt", { y: -200, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.55, ease: "expo.out" }, ${r3(t0 + 0.45)});`);
    js.push(`tl.fromTo("#${id}-nt", { y: 0, scale: 1, opacity: 1 }, { y: 250, scale: 0.55, opacity: 0, duration: 0.4, ease: "power3.in", immediateRender: false }, ${r3(ts[0] - 0.3)});`);
  }
  const burbujas = ms.map((m, i) => {
    const propio = m.de === "negocio";
    let h = "", tick = "";
    if (propio) {
      h += `<div class="mo-escribe" id="${id}-ty${i}"><i id="${id}-ty${i}a"></i><i id="${id}-ty${i}b"></i><i id="${id}-ty${i}c"></i></div>`;
      js.push(`tl.fromTo("#${id}-ty${i}", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.18, ease: "back.out(2)" }, ${r3(ts[i] - 0.6)});`);
      ["a", "b", "c"].forEach((l, k) => js.push(`tl.fromTo("#${id}-ty${i}${l}", { y: 0 }, { y: -9, duration: 0.14, yoyo: true, repeat: 3, ease: "sine.inOut" }, ${r3(ts[i] - 0.55 + k * 0.07)});`));
      js.push(`tl.to("#${id}-ty${i}", { opacity: 0, duration: 0.08 }, ${r3(ts[i] - 0.08)});`);
      tick = `<span class="mo-tick" id="${id}-tk${i}">✓✓</span>`;
      const leido = ts.find((_, j) => j > i && ms[j].de !== "negocio") ?? ts[i] + 0.9;
      js.push(`tl.fromTo("#${id}-tk${i}", { color: "#8696A0" }, { color: "#53BDEB", duration: 0.2 }, ${r3(leido - 0.2)});`);
    }
    h += `<div class="mo-bub ${propio ? "mo-propio" : "mo-ajeno"}" id="${id}-m${i}">${pantalla(m.txt)}<span class="mo-hora">${pantalla(m.hora ?? "")}${tick}</span></div>`;
    js.push(`tl.fromTo("#${id}-m${i}", { scale: 0.2, y: 40, opacity: 0, transformOrigin: "${propio ? "100% 100%" : "0% 100%"}" }, { scale: 1, y: 0, opacity: 1, duration: 0.42, ease: "expo.out" }, ${r3(ts[i])});`);
    return h;
  }).join("");
  // El mensaje clave sale al frente con el resto desenfocado.
  if (destacar != null && ms[destacar]) {
    const tf = ts[destacar] + 0.9;
    if (tf < t0 + dur - 1) {
      const otros = [`#${id}-head`, ...ms.map((_, j) => (j === destacar ? null : `#${id}-m${j}`)).filter(Boolean)].join(", ");
      js.push(`tl.to("${otros}", { filter: "blur(5px)", opacity: 0.4, duration: 0.4, ease: "power2.out" }, ${r3(tf)});`);
      js.push(`tl.to("#${id}-m${destacar}", { scale: 1.1, transformOrigin: "${ms[destacar].de === "negocio" ? "100% 50%" : "0% 50%"}", duration: 0.45, ease: "expo.out" }, ${r3(tf)});`);
    }
  }
  let res = "";
  if (I.resultado) {
    const tr = r3(Math.min(ts.at(-1) + 1.1, t0 + dur - 1.2));
    res = `<div class="mo-res-w"><div class="mo-res" id="${id}-res"><span class="mo-res-ok" id="${id}-ok">✓</span>${pantalla(I.resultado)}</div></div>`;
    js.push(`tl.fromTo("#${id}-res", { y: 90, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: "expo.out" }, ${tr});`);
    js.push(`tl.fromTo("#${id}-ok", { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.35, ease: "back.out(2.4)" }, ${r3(tr + 0.2)});`);
  }
  const canal = I.canal === "instagram" ? "mo-ig" : "mo-wa";
  return {
    html: `<div class="mo-tel ${canal}">${notif}<div class="mo-phone" id="${id}-ph"><div class="mo-ph-head" id="${id}-head"><span class="mo-av">${pantalla(String(I.negocio).slice(0, 1))}</span><span class="mo-ph-nom">${pantalla(I.negocio)}</span><span class="mo-ejemplo">EJEMPLO</span></div><div class="mo-ph-body">${burbujas}</div></div>${res}</div>`,
    js,
  };
};

/** Captura REAL en una ventana: el cursor llega antes de la acción, clic, la cámara va a 1,2× y el resultado queda quieto ≥1 s. */
const pantallaWeb = (I, { id, t0 }) => {
  const fx = Number(I.foco.x), fy = Number(I.foco.y);
  const dx = Math.round(((88 - fx) / 100) * 968);
  const js = [
    `tl.fromTo("#${id}-v", { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, ${r3(t0 + 0.05)});`,
    `tl.fromTo("#${id}-cur", { x: ${dx}, y: 260 }, { x: 0, y: 0, duration: 0.6, ease: "power2.inOut" }, ${r3(t0 + 0.4)});`,
    `tl.to("#${id}-cur", { scale: 1.15, duration: 0.08 }, ${r3(t0 + 1.0)});`,
    `tl.to("#${id}-cur", { scale: 0.98, duration: 0.1 }, ${r3(t0 + 1.08)});`,
    `tl.to("#${id}-cur", { scale: 1, duration: 0.1 }, ${r3(t0 + 1.18)});`,
    `tl.fromTo("#${id}-cam", { scale: 1 }, { scale: 1.2, duration: 1.3, ease: "power2.inOut" }, ${r3(t0 + 1.1)});`,
  ];
  if (I.etiqueta) js.push(`tl.fromTo("#${id}-et", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, ${r3(t0 + 1.8)});`);
  return {
    html: `<div class="mo-ventana" id="${id}-v"><div class="mo-v-barra"><i></i><i></i><i></i><span>${pantalla(I.ventana ?? "")}</span></div><div class="mo-v-cuerpo"><div class="mo-v-cam" id="${id}-cam" style="transform-origin:${fx}% ${fy}%"><img src="${esc(I.imagen)}" alt="" /></div><div class="mo-v-cursor" id="${id}-cur" style="left:${fx}%;top:${fy}%"></div></div></div>
      ${I.etiqueta ? `<div class="mo-tit mo-et" id="${id}-et">${resaltar(I.etiqueta)}</div>` : ""}`,
    js,
  };
};

const ARMADORES = { numero, lista, pasos, chat, pantalla: pantallaWeb };

/**
 * Un inserto a pantalla completa. Cada plantilla lo envuelve a su manera (el filmado no le pone data-start al
 * panel: el extractor de cuadros no suma el del contenedor a los videos de adentro).
 * `ctx`: { id, t0, dur, tema, momentos, sinSubs }. Devuelve { clase, estilo, html, js }.
 */
export function inserto(I, ctx) {
  const { id, t0, dur, tema: T } = ctx;
  const r = ARMADORES[I.tipo](I, ctx);
  // Cámara lenta: el panel nunca queda muerto.
  r.js.push(`tl.fromTo("#${id}-cm", { scale: 1 }, { scale: 1.035, duration: ${r3(dur)}, ease: "none" }, ${r3(t0)});`);
  return {
    clase: `mo-panel${ctx.sinSubs ? " mo-sin-subs" : ""}`,
    estilo: `${varsDe(T)}background:radial-gradient(ellipse at 50% 34%, color-mix(in srgb, ${T.acento} 16%, ${T.bg}) 0%, ${T.bg} 70%);`,
    html: `<div class="mo-cm" id="${id}-cm">${r.html}</div>`,
    js: r.js,
  };
}

// ── Gancho por palabra, al ritmo de la voz ──────────────────────────────────
/** `palabras`: [[texto, segundo, clave]]. Tres modos: tipeo con cursor, golpe con desenfoque y sube con giro. */
export function ganchoPorPalabra(palabras, modo, hasta) {
  const js = [];
  const html = palabras.map(([w, t, clave], n) => {
    const id = `gp${n}`;
    const en = r3(Math.max(0.02, t - 0.04));
    const cursor = modo === "tipeo" ? `<span class="mo-caret" id="${id}c"></span>` : "";
    if (modo === "tipeo") {
      js.push(`tl.fromTo("#${id}", { opacity: 0 }, { opacity: 1, duration: 0.01 }, ${en});`);
      js.push(`tl.fromTo("#${id}c", { opacity: 0 }, { opacity: 1, duration: 0.01 }, ${en});`);
      const sig = palabras[n + 1]?.[1];
      if (sig != null) js.push(`tl.to("#${id}c", { opacity: 0, duration: 0.01 }, ${r3(Math.max(en + 0.02, sig - 0.04))});`);
      else js.push(`tl.fromTo("#${id}c", { opacity: 1 }, { opacity: 0, duration: 0.38, ease: "steps(1)", yoyo: true, repeat: ${Math.max(1, Math.floor((hasta - en - 0.4) / 0.38))}, immediateRender: false }, ${r3(en + 0.4)});`);
    } else if (modo === "golpe") {
      js.push(`tl.fromTo("#${id}", { scale: 1.7, filter: "blur(12px)", opacity: 0 }, { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.34, ease: "expo.out" }, ${en});`);
    } else {
      js.push(`tl.fromTo("#${id}", { yPercent: 90, rotation: ${n % 2 ? -6 : 5}, opacity: 0 }, { yPercent: 0, rotation: 0, opacity: 1, duration: 0.45, ease: "expo.out" }, ${en});`);
    }
    return `<span class="mo-gw${clave ? " mo-clave" : ""}" id="${id}">${pantalla(w)}</span>${cursor}`;
  }).join(" ");
  js.push(`tl.fromTo("#mo-gancho", { opacity: 1 }, { opacity: 0, duration: 0.14, ease: "power2.in", immediateRender: false }, ${r3(hasta - 0.14)});`);
  return { html, js };
}

// ── Subtítulos ──────────────────────────────────────────────────────────────
/** pop: cada palabra salta al entrar. karaoke: la frase apagada y cada palabra se enciende cuando se dice. caja: la clave con una barra que barre. */
export function subtitulosJs(frases, modo) {
  const js = [];
  frases.forEach((fr, i) => {
    fr.palabras.forEach(([, t, dest], j) => {
      const id = `#f${i + 1}w${j + 1}`;
      const at = r3(Math.max(fr.desde, t - 0.06));
      if (modo === "karaoke") {
        js.push(`tl.fromTo("${id}", { opacity: 0.32, scale: 1 }, { opacity: 1, duration: 0.14 }, ${at});`);
        js.push(`tl.fromTo("${id}", { scale: 1 }, { scale: 1.1, duration: 0.08, yoyo: true, repeat: 1, ease: "power1.out", immediateRender: false }, ${at});`);
      } else {
        js.push(`tl.fromTo("${id}", { opacity: 0, y: 40, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.34, ease: "back.out(2)" }, ${at});`);
        if (modo === "caja" && dest) js.push(`tl.fromTo("${id} .mo-barrido", { scaleX: 0 }, { scaleX: 1, duration: 0.26, ease: "power2.out" }, ${r3(at + 0.08)});`);
      }
    });
    js.push(`tl.fromTo("#frase-${i + 1}", { opacity: 1, y: 0 }, { opacity: 0, y: -16, duration: 0.2, ease: "power2.in", immediateRender: false }, ${r3(fr.hasta - 0.22)});`);
    if (modo === "karaoke") js.push(`tl.fromTo("#frase-${i + 1}", { y: 22 }, { y: 0, duration: 0.14, ease: "power2.out" }, ${r3(fr.desde)});`);
  });
  return js;
}

// ── Transiciones entre planos ───────────────────────────────────────────────
// La toma nueva entra ENCIMA de la anterior, que sigue andando: sin eso se ve un fogonazo del fondo.
export const SOLAPE = 0.3;
const TRANSICION = {
  fundido: (w) => `tl.fromTo("${w}", { opacity: 0 }, { opacity: 1, duration: ${SOLAPE}, ease: "none" },`,
  desenfoque: (w) => `tl.fromTo("${w}", { filter: "blur(14px)", opacity: 0 }, { filter: "blur(0px)", opacity: 1, duration: ${SOLAPE}, ease: "power3.out" },`,
  empuje: (w) => `tl.fromTo("${w}", { yPercent: 10, opacity: 0 }, { yPercent: 0, opacity: 1, duration: ${SOLAPE}, ease: "expo.out" },`,
  zoom: (_, m) => `tl.fromTo("${m}", { scale: 1.12, opacity: 0 }, { scale: 1, opacity: 1, duration: ${SOLAPE}, ease: "expo.out" },`,
};
export const transicionJs = (tipo, envoltura, medio, t) => `${TRANSICION[tipo](envoltura, medio)} ${r3(t)});`;

export const CSS_MOTION = `
      .mo-panel { position: absolute; inset: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: center; padding: 300px 56px 680px; box-sizing: border-box; color: var(--mo-tinta); }
      .mo-panel.mo-sin-subs { padding-bottom: 430px; }
      .mo-cm { width: 100%; display: flex; flex-direction: column; }
      .mo-clave { color: var(--mo-acento); }
      .mo-chip { align-self: flex-start; display: flex; align-items: center; gap: 14px; padding: 12px 26px; margin-bottom: 34px; border-radius: 999px; background: var(--mo-tarjeta); font-size: 28px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
      .mo-chip i { width: 14px; height: 14px; border-radius: 50%; background: var(--mo-acento); }
      .mo-num { display: flex; align-items: baseline; font-weight: 900; line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; transform-origin: 0 100%; }
      .mo-num-af { font-size: 0.5em; color: var(--mo-acento); margin: 0 0.1em; }
      .mo-od-col { display: inline-block; height: 1.04em; overflow: hidden; }
      .mo-od-tira { display: block; }
      .mo-od-tira b { display: block; height: 1.04em; line-height: 1.04em; font-weight: inherit; text-align: center; }
      .mo-od-sep { display: inline-block; }
      .mo-ley { margin-top: 28px; font-size: 76px; font-weight: 800; line-height: 1.08; letter-spacing: -0.02em; }
      .mo-barras { display: flex; align-items: flex-end; justify-content: center; gap: 30px; margin-top: 40px; }
      .mo-col { display: flex; flex-direction: column; align-items: center; gap: 12px; transform-origin: 50% 100%; font-size: 34px; font-weight: 800; }
      .mo-barra { width: 160px; border-radius: 22px; background: var(--mo-acento); }
      .mo-tit { font-size: 112px; font-weight: 900; line-height: 1.04; letter-spacing: -0.02em; margin-bottom: 40px; }
      .mo-kick { font-size: 30px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mo-acento); margin-bottom: 30px; }
      .mo-prog { display: flex; align-items: center; gap: 22px; margin-bottom: 30px; }
      .mo-pista { flex: 1; height: 14px; border-radius: 7px; background: var(--mo-linea); overflow: hidden; }
      .mo-pista i { display: block; height: 100%; background: var(--mo-acento); transform-origin: 0 50%; }
      .mo-cuenta { display: inline-grid; font-size: 36px; font-weight: 800; color: var(--mo-mute); font-variant-numeric: tabular-nums; }
      .mo-cuenta span { grid-area: 1 / 1; }
      .mo-item { display: flex; align-items: center; gap: 28px; margin: 18px 0; padding: 32px 32px; font-size: 72px; font-weight: 800; line-height: 1.12; background: var(--mo-tarjeta); border: 2px solid var(--mo-linea); border-radius: 28px; }
      .mo-item-tx { min-width: 0; }
      .mo-tilde { flex: none; width: 84px; height: 84px; border-radius: 20px; background: var(--mo-acento); color: var(--mo-sobre); display: flex; align-items: center; justify-content: center; font-size: 52px; font-weight: 900; }
      .mo-nodo { display: flex; align-items: center; gap: 28px; padding: 28px 32px; background: var(--mo-tarjeta); border: 2px solid var(--mo-linea); border-radius: 30px; }
      .mo-nodo-n { flex: none; width: 96px; height: 96px; border-radius: 50%; background: var(--mo-acento); color: var(--mo-sobre); display: flex; align-items: center; justify-content: center; font-size: 52px; font-weight: 900; }
      .mo-nodo-tx { display: flex; flex-direction: column; min-width: 0; font-size: 72px; font-weight: 800; line-height: 1.08; }
      .mo-nota { margin-top: 8px; font-size: 40px; font-weight: 500; line-height: 1.2; color: var(--mo-mute); }
      .mo-flecha { position: relative; display: flex; flex-direction: column; align-items: center; height: 74px; }
      .mo-linea { display: block; width: 6px; flex: 1; background: var(--mo-acento); transform-origin: 50% 0; }
      .mo-punta { width: 0; height: 0; border-left: 18px solid transparent; border-right: 18px solid transparent; border-top: 22px solid var(--mo-acento); }
      .mo-pulso { position: absolute; top: 0; left: 50%; width: 18px; height: 18px; margin-left: -9px; border-radius: 50%; background: var(--mo-tinta); box-shadow: 0 0 18px var(--mo-acento); }
      .mo-tel { position: relative; align-self: center; --tel-bg: #0B141A; --tel-head: #1F2C34; --tel-ajeno: #202C33; --tel-propio: #005C4B; --tel-txt: #E9EDEF; --tel-ico: #25D366; }
      .mo-tel.mo-ig { --tel-bg: #000000; --tel-head: #121212; --tel-ajeno: #262626; --tel-propio: #3797F0; --tel-txt: #F5F5F5; --tel-ico: #E1306C; }
      .mo-notif { position: absolute; left: 26px; right: 26px; top: 110px; z-index: 4; display: flex; align-items: center; gap: 22px; padding: 22px 26px; border-radius: 30px; background: rgba(250,250,250,0.97); box-shadow: 0 24px 50px rgba(0,0,0,0.35); }
      .mo-nt-ico { flex: none; position: relative; width: 62px; height: 62px; border-radius: 16px; background: var(--tel-ico); }
      .mo-nt-ico::after { content: ""; position: absolute; left: 14px; top: 16px; width: 34px; height: 26px; border-radius: 13px 13px 13px 4px; background: #fff; }
      .mo-nt-tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
      .mo-nt-tx b { font-size: 25px; font-weight: 700; color: #54656F; }
      .mo-nt-tx span { font-size: 33px; color: #111B21; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .mo-nt-hora { flex: none; align-self: flex-start; font-size: 24px; color: #667781; }
      .mo-phone { width: 968px; background: var(--tel-bg); border-radius: 44px; overflow: hidden; border: 2px solid rgba(255,255,255,0.14); box-shadow: 0 30px 70px rgba(0,0,0,0.35); }
      .mo-ph-head { display: flex; align-items: center; gap: 22px; padding: 24px 30px; background: var(--tel-head); }
      .mo-av { flex: none; width: 68px; height: 68px; border-radius: 50%; background: var(--mo-acento); color: var(--mo-sobre); display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 800; }
      .mo-ph-nom { flex: 1; min-width: 0; color: var(--tel-txt); font-size: 42px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .mo-ejemplo { flex: none; font-size: 30px; font-weight: 800; letter-spacing: 0.08em; color: #111; background: #F5D90A; padding: 6px 14px; border-radius: 10px; }
      .mo-ph-body { padding: 28px 28px 60px; display: flex; flex-direction: column; gap: 16px; min-height: 620px; box-sizing: border-box; }
      .mo-bub { position: relative; max-width: 78%; padding: 18px 26px 38px; border-radius: 24px; font-size: 44px; line-height: 1.26; color: var(--tel-txt); }
      .mo-ajeno { align-self: flex-start; background: var(--tel-ajeno); border-top-left-radius: 6px; }
      .mo-propio { align-self: flex-end; background: var(--tel-propio); border-top-right-radius: 6px; }
      .mo-hora { position: absolute; right: 18px; bottom: 8px; font-size: 24px; color: rgba(233,237,239,0.85); }
      .mo-tick { margin-left: 8px; color: #8696A0; letter-spacing: -0.3em; }
      .mo-escribe { align-self: flex-end; display: flex; gap: 10px; padding: 22px 26px; background: var(--tel-propio); border-radius: 22px; margin-bottom: -76px; opacity: 0; }
      .mo-escribe i { width: 14px; height: 14px; border-radius: 50%; background: rgba(233,237,239,0.7); display: block; }
      .mo-res-w { position: absolute; left: 0; right: 0; bottom: -44px; display: flex; justify-content: center; z-index: 4; }
      .mo-res { display: flex; align-items: center; gap: 18px; padding: 20px 34px 20px 22px; border-radius: 999px; background: #111B21; color: #fff; font-size: 42px; font-weight: 700; box-shadow: 0 20px 50px rgba(0,0,0,0.35); }
      .mo-res-ok { flex: none; width: 46px; height: 46px; border-radius: 50%; background: #25D366; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 27px; }
      .mo-ventana { border-radius: 26px; overflow: hidden; border: 2px solid var(--mo-linea); background: #fff; box-shadow: 0 40px 90px rgba(0,0,0,0.35); }
      .mo-v-barra { display: flex; align-items: center; gap: 12px; padding: 18px 22px; background: #E9E9EC; font-size: 26px; color: #555; }
      .mo-v-barra i { width: 18px; height: 18px; border-radius: 50%; background: #FF5F57; display: block; }
      .mo-v-barra i:nth-child(2) { background: #FEBC2E; }
      .mo-v-barra i:nth-child(3) { background: #28C840; }
      .mo-v-barra span { margin-left: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .mo-v-cuerpo { position: relative; overflow: hidden; max-height: 620px; }
      .mo-v-cam img { display: block; width: 100%; }
      .mo-v-cursor { position: absolute; width: 46px; height: 58px; margin: -6px 0 0 -6px; transform-origin: 6px 6px; background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 30'><path d='M2 2 L2 24 L8 18 L12 28 L16 26 L12 17 L20 17 Z' fill='white' stroke='black' stroke-width='1.6' stroke-linejoin='round'/></svg>") no-repeat; }
      .mo-et { margin: 36px 0 0; font-size: 76px; }
`;
