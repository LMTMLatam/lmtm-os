// LMTM: gráficos chicos en SVG, sin librería (rediseño 20/11: «todo más visual y menos texto»).
// Reglas de la guía de dataviz: una sola escala por gráfico, marcas finas, el texto en tinta (nunca del color de la
// serie), etiquetas directas, leyenda cuando hay dos series y un tooltip al pasar el mouse. Colores: --l-serie-1/2
// (validados contra el fondo oscuro y el claro) y los de estado (--l-bien / --l-critico) solo para bien/mal.

import { useId, useState } from "react";

/** Puro. Lleva un valor de [0, max] a [alto, 0] (y crece hacia arriba). max 0 → todo en la base. */
export function escalaY(valor: number, max: number, alto: number): number {
  return max > 0 ? alto - (Math.max(0, valor) / max) * alto : alto;
}

/** Puro. Un tope «redondo» para el eje: 1, 2, 2,5 o 5 por la potencia de 10 que corresponda. */
export function topeRedondo(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((t) => t >= max)!;
}

/**
 * Línea con área de una sola serie (por día). Pasando el mouse: línea vertical y el valor de ese día.
 * `formato` dice el valor como lo lee una persona.
 */
export function Linea({ puntos, formato, etiqueta, alto = 140 }: { puntos: Array<{ x: string; y: number }>; formato: (n: number) => string; etiqueta: string; alto?: number }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (puntos.length < 2) return <p className="text-[13px] text-l-tinta-3">Sin datos suficientes.</p>;
  const ancho = 600;
  const max = topeRedondo(Math.max(...puntos.map((p) => p.y)));
  const x = (i: number) => (i / (puntos.length - 1)) * ancho;
  const camino = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${escalaY(p.y, max, alto).toFixed(1)}`).join(" ");
  const actual = hover != null ? puntos[hover] : puntos[puntos.length - 1];
  const fecha = (s: string) => `${Number(s.slice(8, 10))}/${Number(s.slice(5, 7))}`;
  return (
    <figure className="m-0">
      <figcaption className="mb-5 flex items-baseline justify-between gap-2 text-[12px] text-l-tinta-3">
        <span>{hover != null ? fecha(actual.x) : "último día"}</span>
        <span className="text-[14px] font-semibold tabular-nums text-l-tinta">{formato(actual.y)}</span>
      </figcaption>
      <div className="relative">
      {[0.5, 1].map((f) => (
        <span key={f} className="pointer-events-none absolute left-0 -translate-y-full pb-0.5 text-[11px] tabular-nums text-l-tinta-3" style={{ top: `${(1 - f) * 100}%` }}>
          {formato(max * f)}
        </span>
      ))}
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        preserveAspectRatio="none"
        className="block h-[140px] w-full overflow-visible"
        role="img"
        aria-label={`${etiqueta}: de ${formato(puntos[0].y)} el ${fecha(puntos[0].x)} a ${formato(puntos[puntos.length - 1].y)} el ${fecha(puntos[puntos.length - 1].x)}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(puntos.length - 1, Math.round(((e.clientX - r.left) / r.width) * (puntos.length - 1)))));
        }}
      >
        <defs>
          <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--l-serie-1)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--l-serie-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.5, 1].map((f) => (
          <line key={f} x1="0" x2={ancho} y1={escalaY(max * f, max, alto)} y2={escalaY(max * f, max, alto)} stroke="var(--l-linea-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="3 4" />
        ))}
        <path d={`${camino} L${ancho},${alto} L0,${alto} Z`} fill={`url(#${id}-area)`} />
        <path d={camino} fill="none" stroke="var(--l-serie-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1="0" y2={alto} stroke="var(--l-tinta-3)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-l-tinta-3">
        <span>{fecha(puntos[0].x)}</span>
        <span>{fecha(puntos[puntos.length - 1].x)}</span>
      </div>
    </figure>
  );
}

/** Mini línea para una tarjeta de número (sin ejes). */
export function Chispa({ valores }: { valores: number[] }) {
  if (valores.length < 2) return null;
  const ancho = 120;
  const alto = 32;
  const max = Math.max(...valores);
  const d = valores.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (valores.length - 1)) * ancho).toFixed(1)},${(escalaY(v, max, alto - 4) + 2).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" className="block h-8 w-full" aria-hidden>
      <path d={d} fill="none" stroke="var(--l-serie-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Barras horizontales de una serie, con el valor escrito al final. `referencia` dibuja una línea vertical (por ejemplo
 * «1× = lo normal»).
 */
export function BarrasH({ filas, formato, referencia }: { filas: Array<{ etiqueta: string; valor: number; detalle?: string }>; formato: (n: number) => string; referencia?: { valor: number; etiqueta: string } }) {
  const max = Math.max(...filas.map((f) => f.valor), referencia?.valor ?? 0) || 1;
  return (
    <div className="flex flex-col gap-2.5">
      {filas.map((f) => (
        <div key={f.etiqueta} className="grid grid-cols-[minmax(90px,140px)_1fr_auto] items-center gap-3" title={f.detalle ? `${f.etiqueta}: ${formato(f.valor)} · ${f.detalle}` : `${f.etiqueta}: ${formato(f.valor)}`}>
          <span className="truncate text-[13px] text-l-tinta-2">{f.etiqueta}</span>
          <span className="relative h-3 rounded-full bg-l-linea">
            <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--l-serie-1)]" style={{ width: `${(f.valor / max) * 100}%` }} />
            {referencia && <span className="absolute -inset-y-1 w-px bg-l-tinta-2" style={{ left: `${(referencia.valor / max) * 100}%` }} aria-hidden />}
          </span>
          <span className="text-right text-[13px] font-semibold tabular-nums text-l-tinta">{formato(f.valor)}</span>
        </div>
      ))}
      {referencia && <p className="text-[11px] text-l-tinta-3">La línea marca {referencia.etiqueta}.</p>}
    </div>
  );
}

/** Dos series por grupo (nosotros / competencia), con leyenda y el valor escrito en cada barra. */
export function BarrasPar({ grupos, nombres, formato }: { grupos: Array<{ etiqueta: string; a: number; b: number }>; nombres: [string, string]; formato: (n: number) => string }) {
  const max = Math.max(...grupos.flatMap((g) => [g.a, g.b])) || 1;
  const barra = (v: number, color: string, nombre: string, etiqueta: string) => (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2" title={`${etiqueta} · ${nombre}: ${formato(v)}`}>
      <span className="relative h-2.5 rounded-full bg-l-linea">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(v / max) * 100}%`, background: color }} />
      </span>
      <span className="w-12 text-right text-[12px] tabular-nums text-l-tinta">{formato(v)}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4 text-[12px] text-l-tinta-2" aria-hidden>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--l-serie-1)]" /> {nombres[0]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--l-serie-2)]" /> {nombres[1]}</span>
      </div>
      {grupos.map((g) => (
        <div key={g.etiqueta} role="group" aria-label={`${g.etiqueta}: ${nombres[0]} ${formato(g.a)}, ${nombres[1]} ${formato(g.b)}`}>
          <p className="mb-1 text-[13px] text-l-tinta-2">{g.etiqueta}</p>
          <div className="flex flex-col gap-1">
            {barra(g.a, "var(--l-serie-1)", nombres[0], g.etiqueta)}
            {barra(g.b, "var(--l-serie-2)", nombres[1], g.etiqueta)}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Una barra partida en tramos (bien / igual / mal), con cada tramo nombrado abajo: el estado nunca va solo por el color.
 */
export function Proporcion({ tramos }: { tramos: Array<{ etiqueta: string; valor: number; tono: "bien" | "neutro" | "critico"; marca: string }> }) {
  const total = tramos.reduce((s, t) => s + t.valor, 0);
  if (total === 0) return <p className="text-[13px] text-l-tinta-3">Sin datos para comparar.</p>;
  const color = { bien: "var(--l-bien)", neutro: "var(--l-neutro)", critico: "var(--l-critico)" };
  return (
    <div>
      <div className="flex h-4 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={tramos.map((t) => `${t.etiqueta}: ${t.valor}`).join(", ")}>
        {tramos.filter((t) => t.valor > 0).map((t) => (
          <span key={t.etiqueta} style={{ width: `${(t.valor / total) * 100}%`, background: color[t.tono] }} title={`${t.etiqueta}: ${t.valor}`} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {tramos.map((t) => (
          <li key={t.etiqueta} className="flex items-baseline gap-1.5 text-[13px] text-l-tinta-2">
            <span aria-hidden style={{ color: color[t.tono] }}>{t.marca}</span>
            <span className="text-[18px] font-semibold tabular-nums text-l-tinta">{t.valor}</span> {t.etiqueta}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Cada cliente como un punto contra una línea de referencia (el ideal del nicho). */
export function PuntosVsReferencia({ puntos, referencia, formato }: { puntos: Array<{ etiqueta: string; valor: number }>; referencia: { valor: number; etiqueta: string }; formato: (n: number) => string }) {
  const max = Math.max(...puntos.map((p) => p.valor), referencia.valor) * 1.1 || 1;
  return (
    <div>
      <div className="relative h-8 rounded-full bg-l-linea/60" role="img" aria-label={`${puntos.length} clientes contra ${referencia.etiqueta} de ${formato(referencia.valor)}`}>
        <span className="absolute -inset-y-1 w-0.5 rounded bg-l-tinta-2" style={{ left: `${(referencia.valor / max) * 100}%` }} title={`${referencia.etiqueta}: ${formato(referencia.valor)}`} />
        {puntos.map((p) => (
          <span
            key={p.etiqueta}
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-l-sup ${p.valor < referencia.valor ? "bg-[var(--l-serie-2)]" : "bg-[var(--l-serie-1)]"}`}
            style={{ left: `${(p.valor / max) * 100}%` }}
            title={`${p.etiqueta}: ${formato(p.valor)}`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-l-tinta-3">La línea es {referencia.etiqueta} ({formato(referencia.valor)}); cada punto, un cliente.</p>
    </div>
  );
}
