// LMTM-OS: client-facing chart primitives (public dashboard).
//
// Hand-rolled SVG (no chart lib) styled with a validated categorical palette
// (dataviz method: adjacent CVD ΔE ≥ 8, normal-vision ≥ 15 in both modes;
// the light-mode contrast WARN on aqua/yellow/magenta is relieved with direct
// labels + table views). Colors live in CSS vars declared by <PubvizTheme/> so
// the same marks re-step for dark mode via the app's `.dark` class.

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

// Categorical slots (fixed order — identity, never re-painted on filter).
export const PV_SLOTS = ["var(--pv-c1)", "var(--pv-c2)", "var(--pv-c3)", "var(--pv-c4)", "var(--pv-c5)"] as const;
export const PV_OTHER = "var(--pv-other)";

/** Catmull-Rom → cubic bezier: la curva suave del reference (28/7). */
function smoothPath(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n < 2) return "";
  if (n === 2) return `M${xs[0]},${ys[0]} L${xs[1]},${ys[1]}`;
  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[Math.max(i - 1, 0)], y0 = ys[Math.max(i - 1, 0)];
    const x1 = xs[i], y1 = ys[i];
    const x2 = xs[i + 1], y2 = ys[i + 1];
    const x3 = xs[Math.min(i + 2, n - 1)], y3 = ys[Math.min(i + 2, n - 1)];
    const c1x = x1 + (x2 - x0) / 6, c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6, c2y = y2 - (y3 - y1) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return d;
}

/** Redondea el máximo del eje a un valor "lindo" (1/2/2.5/5 × 10^k). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * mag) return m * mag;
  return 10 * mag;
}

export function PubvizTheme() {
  return (
    <style>{`
      .pv { --pv-c1:#2a78d6; --pv-c2:#eb6834; --pv-c3:#1baf7a; --pv-c4:#eda100; --pv-c5:#e87ba4;
            --pv-other:#c3c2b7; --pv-grid:#e1e0d9; --pv-axis:#c3c2b7; --pv-muted:#898781;
            --pv-up:#006300; --pv-down:#d03b3b;
            --pv-f1:#86b6ef; --pv-f2:#5598e7; --pv-f3:#2a78d6; --pv-f4:#1c5cab; --pv-f5:#104281; }
      .dark .pv { --pv-c1:#3987e5; --pv-c2:#d95926; --pv-c3:#199e70; --pv-c4:#c98500; --pv-c5:#d55181;
            --pv-other:#52514e; --pv-grid:#2c2c2a; --pv-axis:#383835;
            --pv-up:#0ca30c; --pv-down:#e66767;
            --pv-f1:#9ec5f4; --pv-f2:#6da7ec; --pv-f3:#3987e5; --pv-f4:#256abf; --pv-f5:#184f95; }
    `}</style>
  );
}

// ── Delta vs previous period ────────────────────────────────────────────────
export function Delta({ curr, prev, goodWhen = "up", fmtPct }: { curr: number; prev: number; goodWhen?: "up" | "down"; fmtPct?: (n: number) => string }) {
  if (!(prev > 0) || !Number.isFinite(curr)) return null;
  const change = (curr - prev) / prev;
  if (!Number.isFinite(change) || Math.abs(change) < 0.005) return null;
  const up = change > 0;
  const good = up === (goodWhen === "up");
  const Icon = up ? ArrowUp : ArrowDown;
  const label = fmtPct ? fmtPct(Math.abs(change)) : `${(Math.abs(change) * 100).toFixed(0)}%`;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-semibold rounded-full px-1.5 py-0.5"
      style={{ color: good ? "var(--pv-up)" : "var(--pv-down)", background: good ? "color-mix(in srgb, var(--pv-up) 12%, transparent)" : "color-mix(in srgb, var(--pv-down) 12%, transparent)" }}
      title="vs período anterior"
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ── Area chart (single series, crosshair + tooltip) ─────────────────────────
interface AreaPoint { date: string; value: number }

export function AreaChart({ points, color = PV_SLOTS[0], height = 160, fmtValue, id }: {
  points: AreaPoint[];
  color?: string;
  height?: number;
  fmtValue: (n: number) => string;
  id: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const W = 600;
  const PAD = { t: 10, r: 8, b: 20, l: 8 };
  const H = height;

  const { path, area, xs, ys, max } = useMemo(() => {
    const max = Math.max(...points.map((p) => p.value), 1);
    const n = Math.max(points.length - 1, 1);
    const xs = points.map((_, i) => PAD.l + (i / n) * (W - PAD.l - PAD.r));
    const ys = points.map((p) => PAD.t + (1 - p.value / max) * (H - PAD.t - PAD.b));
    const path = points.length ? "M" + xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" L") : "";
    const area = path ? `${path} L${xs[xs.length - 1].toFixed(1)},${H - PAD.b} L${xs[0].toFixed(1)},${H - PAD.b} Z` : "";
    return { path, area, xs, ys, max };
  }, [points, H]);

  if (points.length === 0) return <div style={{ height }} className="flex items-center justify-center text-xs text-muted-foreground">Sin datos en el período</div>;

  const shortDate = (iso: string) => {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  };
  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    setHover(best);
  };
  const h = hover != null ? points[hover] : null;

  return (
    <div ref={ref} className="relative select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img">
        <defs>
          <linearGradient id={`pvg-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.5, 0].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)} stroke="var(--pv-grid)" strokeWidth="1" />
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--pv-axis)" strokeWidth="1" />
        <path d={area} fill={`url(#pvg-${id})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* last point marker */}
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="4" fill={color} stroke="var(--color-card, #fff)" strokeWidth="2" />
        {hover != null && (
          <g>
            <line x1={xs[hover]} x2={xs[hover]} y1={PAD.t} y2={H - PAD.b} stroke="var(--pv-muted)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={xs[hover]} cy={ys[hover]} r="4.5" fill={color} stroke="var(--color-card, #fff)" strokeWidth="2" />
          </g>
        )}
        <text x={PAD.l} y={PAD.t - 1} fontSize="9" fill="var(--pv-muted)">{fmtValue(max)}</text>
        <text x={PAD.l} y={H - 6} fontSize="9" fill="var(--pv-muted)">{shortDate(points[0].date)}</text>
        <text x={W - PAD.r} y={H - 6} fontSize="9" fill="var(--pv-muted)" textAnchor="end">{shortDate(points[points.length - 1].date)}</text>
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute -top-1 z-10 rounded-md border bg-popover text-popover-foreground shadow-md px-2 py-1 text-[11px] whitespace-nowrap"
          style={{ left: `${(xs[hover!] / W) * 100}%`, transform: `translateX(${xs[hover!] > W / 2 ? "-105%" : "5%"})` }}
        >
          <span className="text-muted-foreground">{shortDate(h.date)}</span>{" · "}
          <span className="font-semibold">{fmtValue(h.value)}</span>
        </div>
      )}
    </div>
  );
}

// ── Bar chart (daily counts, rounded tops, tooltip) ─────────────────────────
export function BarsChart({ points, color = PV_SLOTS[2], height = 160, fmtValue }: {
  points: AreaPoint[];
  color?: string;
  height?: number;
  fmtValue: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <div style={{ height }} className="flex items-center justify-center text-xs text-muted-foreground">Sin datos en el período</div>;
  const max = Math.max(...points.map((p) => p.value), 1);
  const shortDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  const h = hover != null ? points[hover] : null;
  return (
    <div className="relative">
      <div className="flex items-end gap-[2px]" style={{ height: height - 18 }}>
        {points.map((p, i) => {
          const pct = (p.value / max) * 100;
          return (
            <div
              key={i}
              className="flex-1 rounded-t-[4px] transition-opacity min-w-0"
              style={{ height: `${Math.max(pct, 2)}%`, background: p.value > 0 ? color : "var(--pv-grid)", opacity: hover == null || hover === i ? 1 : 0.45 }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] mt-1" style={{ color: "var(--pv-muted)" }}>
        <span>{shortDate(points[0].date)}</span>
        <span>{shortDate(points[points.length - 1].date)}</span>
      </div>
      {h && (
        <div className="pointer-events-none absolute -top-7 z-10 rounded-md border bg-popover text-popover-foreground shadow-md px-2 py-1 text-[11px] whitespace-nowrap" style={{ left: `${((hover! + 0.5) / points.length) * 100}%`, transform: "translateX(-50%)" }}>
          <span className="text-muted-foreground">{shortDate(h.date)}</span>{" · "}
          <span className="font-semibold">{fmtValue(h.value)}</span>
        </div>
      )}
    </div>
  );
}

// ── Donut (share of total, ≤5 slices + Otras, legend with direct labels) ────
export function Donut({ slices, fmtValue, centerLabel }: {
  slices: Array<{ label: string; value: number }>;
  fmtValue: (n: number) => string;
  centerLabel: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return <p className="text-xs text-muted-foreground py-8 text-center">Sin datos en el período</p>;
  const top = slices.slice(0, 5);
  const rest = slices.slice(5).reduce((a, s) => a + s.value, 0);
  const parts = [...top.map((s, i) => ({ ...s, color: PV_SLOTS[i] })), ...(rest > 0 ? [{ label: "Otras", value: rest, color: PV_OTHER }] : [])];
  const R = 42;
  const C = 2 * Math.PI * R;
  const GAP = parts.length > 1 ? 2.5 : 0;
  let acc = 0;
  return (
    // Donut arriba, leyenda ABAJO a todo el ancho (review 27/7: los nombres se
    // truncaban ilegibles con la leyenda al costado).
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 120 120" className="w-40 h-40 shrink-0" role="img">
        {parts.map((p, i) => {
          const frac = p.value / total;
          const len = Math.max(frac * C - GAP, 0.5);
          const el = (
            <circle
              key={i}
              cx="60" cy="60" r={R}
              fill="none"
              stroke={p.color}
              strokeWidth="15"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-acc * C - GAP / 2}
              transform="rotate(-90 60 60)"
            />
          );
          acc += frac;
          return el;
        })}
        <text x="60" y="57" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">{fmtValue(total)}</text>
        <text x="60" y="70" textAnchor="middle" fontSize="8" fill="var(--pv-muted)">{centerLabel}</text>
      </svg>
      <div className="w-full space-y-1.5">
        {parts.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs min-w-0">
            <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: p.color }} />
            <span className="truncate flex-1" title={p.label}>{p.label}</span>
            <span className="tabular-nums font-medium shrink-0">{fmtValue(p.value)}</span>
            <span className="tabular-nums text-muted-foreground shrink-0 w-9 text-right">{((p.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Funnel (ordinal blue ramp, rate chips between stages) ───────────────────
export function FunnelViz({ stages, fmtValue }: {
  stages: Array<{ label: string; value: number }>;
  fmtValue: (n: number) => string;
}) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  const ramp = ["var(--pv-f1)", "var(--pv-f2)", "var(--pv-f3)", "var(--pv-f4)", "var(--pv-f5)"];
  return (
    <div className="space-y-1">
      {stages.map((s, i) => {
        const pct = Math.max((s.value / max) * 100, 2);
        const prev = i > 0 ? stages[i - 1].value : null;
        const conv = prev != null && prev > 0 ? (s.value / prev) * 100 : null;
        return (
          <div key={s.label}>
            {conv != null && (
              <div className="flex items-center gap-1.5 pl-1 py-0.5 text-[10px]" style={{ color: "var(--pv-muted)" }}>
                <ArrowDown className="h-3 w-3" />
                <span className="font-medium">{conv >= 10 ? conv.toFixed(0) : conv.toFixed(1)}% pasa a la siguiente etapa</span>
              </div>
            )}
            <div className="relative h-9 rounded-md overflow-hidden" style={{ background: "color-mix(in srgb, var(--pv-grid) 45%, transparent)" }}>
              <div className="h-full rounded-r-[4px]" style={{ width: `${pct}%`, background: ramp[Math.min(i, ramp.length - 1)] }} />
              <div className="absolute inset-0 flex items-center justify-between px-3 text-xs">
                <span className="font-medium">{s.label}</span>
                <span className="tabular-nums font-semibold">{fmtValue(s.value)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Sparkline: progreso del período dentro de una KPI card ──────────────────
export function Spark({ points, color, id, height = 34 }: {
  points: number[];
  color: string;
  id: string;
  height?: number;
}) {
  if (points.length < 2) return null;
  const W = 200;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = Math.max(max - min, 1);
  const xs = points.map((_, i) => (i / (points.length - 1)) * W);
  const ys = points.map((v) => 3 + (1 - (v - min) / range) * (height - 6));
  const line = "M" + xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" L");
  const area = `${line} L${W},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full mt-2" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={`pvsp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#pvsp-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── Stat header row inside a chart card (estilo "Weekly Project Health") ────
export function StatRow({ stats }: { stats: Array<{ label: string; value: string; sub?: string }> }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 pb-3 mb-3 border-b">
      {stats.map((s, i) => (
        <div key={i} className={i > 0 ? "pl-6 border-l" : ""}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</p>
          <p className="text-xl font-bold leading-tight">
            {s.value}
            {s.sub && <span className="text-[11px] font-normal text-muted-foreground ml-1.5">{s.sub}</span>}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Combo chart: barras diarias + media móvil (línea) + promedio (punteada) ─
// Una sola escala/unidad — nunca dual axis.
export function ComboChart({ points, color = PV_SLOTS[0], height = 190, fmtValue, labels }: {
  points: Array<{ date: string; value: number }>;
  color?: string;
  height?: number;
  fmtValue: (n: number) => string;
  labels: { bars: string; line: string; guide: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const W = 600;
  const PAD = { t: 12, r: 8, b: 20, l: 8 };
  const H = height;
  const n = points.length;
  if (n === 0) return <div style={{ height }} className="flex items-center justify-center text-xs text-muted-foreground">Sin datos en el período</div>;

  const vals = points.map((p) => p.value);
  const promedio = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
  const win = Math.min(7, Math.max(2, Math.floor(vals.length / 4)));
  const avgLine = vals.map((_, i) => {
    const from = Math.max(0, i - win + 1);
    const slice = vals.slice(from, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const max = Math.max(...vals, ...avgLine, promedio, 1);
  const xs = points.map((_, i) => PAD.l + ((W - PAD.l - PAD.r) / n) * i + ((W - PAD.l - PAD.r) / n) / 2);

  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const step = (W - PAD.l - PAD.r) / n;
  const barW = Math.max(step - 2, 1.5);
  const linePath = "M" + xs.map((x, i) => `${x.toFixed(1)},${y(avgLine[i]).toFixed(1)}`).join(" L");
  const shortDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round((x - PAD.l - step / 2) / step))));
  };
  const h = hover != null ? points[hover] : null;

  return (
    <div>
      <div ref={ref} className="relative select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img">
          {[0.5, 0].map((f) => (
            <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)} stroke="var(--pv-grid)" strokeWidth="1" />
          ))}
          {points.map((p, i) => (
            <rect
              key={i}
              x={xs[i] - barW / 2}
              y={y(p.value)}
              width={barW}
              height={Math.max(H - PAD.b - y(p.value), 1)}
              rx={Math.min(2, barW / 2)}
              fill={color}
              opacity={hover == null || hover === i ? 0.35 : 0.15}
            />
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(promedio)} y2={y(promedio)} stroke="var(--pv-muted)" strokeWidth="1.5" strokeDasharray="5 4" />
          <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--pv-axis)" strokeWidth="1" />
          {hover != null && <circle cx={xs[hover]} cy={y(avgLine[hover])} r="4" fill={color} stroke="var(--color-card, #fff)" strokeWidth="2" />}
          <text x={PAD.l} y={PAD.t - 3} fontSize="9" fill="var(--pv-muted)">{fmtValue(max)}</text>
          <text x={PAD.l} y={H - 6} fontSize="9" fill="var(--pv-muted)">{shortDate(points[0].date)}</text>
          <text x={W - PAD.r} y={H - 6} fontSize="9" fill="var(--pv-muted)" textAnchor="end">{shortDate(points[n - 1].date)}</text>
        </svg>
        {h && (
          <div className="pointer-events-none absolute -top-1 z-10 rounded-md border bg-popover text-popover-foreground shadow-md px-2 py-1 text-[11px] whitespace-nowrap" style={{ left: `${(xs[hover!] / W) * 100}%`, transform: `translateX(${xs[hover!] > W / 2 ? "-105%" : "5%"})` }}>
            <span className="text-muted-foreground">{shortDate(h.date)}</span>{" · "}
            <span className="font-semibold">{fmtValue(h.value)}</span>
            <span className="text-muted-foreground"> · media {fmtValue(avgLine[hover!])}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: color, opacity: 0.4 }} /> {labels.bars}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-4 rounded" style={{ background: color }} /> {labels.line}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-4 rounded border-t border-dashed" style={{ borderColor: "var(--pv-muted)", background: "transparent" }} /> {labels.guide}</span>
      </div>
    </div>
  );
}

// ── Flujo acumulado: áreas superpuestas de la MISMA unidad (leads vs ventas) ─
export function CumulativeFlow({ series, height = 190, fmtValue, id }: {
  series: Array<{ label: string; color: string; points: Array<{ date: string; value: number }> }>;
  height?: number;
  fmtValue: (n: number) => string;
  id: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const W = 600;
  const PAD = { t: 12, r: 8, b: 20, l: 8 };
  const H = height;
  const n = series[0]?.points.length ?? 0;
  if (n === 0) return <div style={{ height }} className="flex items-center justify-center text-xs text-muted-foreground">Sin datos en el período</div>;

  // Acumular cada serie
  const cum = series.map((s) => {
    let acc = 0;
    return { ...s, points: s.points.map((p) => ({ date: p.date, value: (acc += p.value) })) };
  });
  const max = niceMax(Math.max(...cum.flatMap((s) => s.points.map((p) => p.value)), 1));
  const AXIS_L = Math.min(64, fmtValue(max).length * 5 + 8);
  const stepX = (W - PAD.l - AXIS_L - PAD.r) / Math.max(n - 1, 1);
  const xs = Array.from({ length: n }, (_, i) => PAD.l + AXIS_L + stepX * i);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  // Puntos marcados cada ~1/6 del período + el último (estilo reference 28/7).
  const dotEvery = Math.max(1, Math.round(n / 6));
  const shortDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round((x - PAD.l - AXIS_L) / stepX))));
  };
  // Dibujar la mayor primero para que la menor quede visible encima.
  const ordered = [...cum].sort((a, b) => (b.points[n - 1]?.value ?? 0) - (a.points[n - 1]?.value ?? 0));

  return (
    <div>
      <div ref={ref} className="relative select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img">
          <defs>
            {ordered.map((s, si) => (
              <linearGradient key={si} id={`pvcf-${id}-${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.06" />
              </linearGradient>
            ))}
          </defs>
          {/* Grilla con valores en Y (estilo reference 28/7). */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const gy = PAD.t + (1 - f) * (H - PAD.t - PAD.b);
            return (
              <g key={f}>
                <line x1={PAD.l + AXIS_L} x2={W - PAD.r} y1={gy} y2={gy} stroke={f === 0 ? "var(--pv-axis)" : "var(--pv-grid)"} strokeWidth="1" />
                {f > 0 && <text x={PAD.l + AXIS_L - 3} y={gy + 3} fontSize="8.5" fill="var(--pv-muted)" textAnchor="end">{fmtValue(max * f)}</text>}
              </g>
            );
          })}
          {ordered.map((s, si) => {
            const ys = s.points.map((p) => y(p.value));
            const path = smoothPath(xs, ys);
            const area = `${path} L${xs[n - 1].toFixed(1)},${H - PAD.b} L${xs[0].toFixed(1)},${H - PAD.b} Z`;
            return (
              <g key={si}>
                <path d={area} fill={`url(#pvcf-${id}-${si})`} />
                <path d={path} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {xs.map((x, i) =>
                  (i % dotEvery === 0 || i === n - 1) ? (
                    <circle key={i} cx={x} cy={ys[i]} r="3.5" fill={s.color} stroke="var(--color-card, #fff)" strokeWidth="1.5" />
                  ) : null,
                )}
              </g>
            );
          })}
          {/* Ritmo promedio (review 27/7): línea punteada 0→total de la serie
              principal — si la curva va por arriba, el mes viene acelerado. */}
          <line x1={xs[0]} y1={H - PAD.b} x2={xs[n - 1]} y2={y(ordered[0].points[n - 1].value)} stroke="var(--pv-muted)" strokeWidth="1.5" strokeDasharray="5 4" />
          {hover != null && (
            <g>
              <line x1={xs[hover]} x2={xs[hover]} y1={PAD.t} y2={H - PAD.b} stroke="var(--pv-muted)" strokeWidth="1" strokeDasharray="3 3" />
              {ordered.map((s, si) => (
                <circle key={si} cx={xs[hover]} cy={y(s.points[hover].value)} r="4.5" fill={s.color} stroke="var(--color-card, #fff)" strokeWidth="2" />
              ))}
            </g>
          )}
          <text x={PAD.l + AXIS_L} y={H - 6} fontSize="9" fill="var(--pv-muted)">{shortDate(series[0].points[0].date)}</text>
          <text x={W - PAD.r} y={H - 6} fontSize="9" fill="var(--pv-muted)" textAnchor="end">{shortDate(series[0].points[n - 1].date)}</text>
        </svg>
        {hover != null && (
          <div className="pointer-events-none absolute -top-1 z-10 rounded-md border bg-popover text-popover-foreground shadow-md px-2 py-1 text-[11px] whitespace-nowrap" style={{ left: `${(xs[hover] / W) * 100}%`, transform: `translateX(${xs[hover] > W / 2 ? "-105%" : "5%"})` }}>
            <span className="text-muted-foreground">{shortDate(series[0].points[hover].date)}</span>
            {cum.map((s, si) => (
              <span key={si}>{" · "}{s.label} <span className="font-semibold">{fmtValue(s.points[hover].value)}</span>
                <span className="text-muted-foreground"> (+{fmtValue(series[si].points[hover].value)} ese día)</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-muted-foreground">
        {cum.map((s, si) => (
          <span key={si} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} /> {s.label} (acumulado)</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-4 border-t border-dashed" style={{ borderColor: "var(--pv-muted)" }} /> Ritmo promedio del período</span>
      </div>
    </div>
  );
}

// ── Barras con línea de referencia (CPL por campaña vs promedio) ───────────
export function BarsVsRef({ rows, ref: refValue, refLabel, fmtValue, goodWhen = "down" }: {
  rows: Array<{ label: string; value: number }>;
  ref: number;
  refLabel: string;
  fmtValue: (n: number) => string;
  /** "down" = valores por debajo de la referencia son buenos (CPL). */
  goodWhen?: "down" | "up";
}) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground py-6 text-center">Sin datos en el período</p>;
  const max = Math.max(...rows.map((r) => r.value), refValue) * 1.05;
  return (
    <div>
      <div className="space-y-2.5">
        {rows.map((r, i) => {
          const bueno = goodWhen === "down" ? r.value <= refValue : r.value >= refValue;
          const color = bueno ? "var(--pv-c3)" : "var(--pv-c2)";
          return (
            <div key={i}>
              <div className="flex items-center justify-between text-xs mb-1 gap-2">
                <span className="truncate flex-1" title={r.label}>{r.label}</span>
                <span className="tabular-nums font-semibold shrink-0" style={{ color }}>{fmtValue(r.value)}</span>
              </div>
              <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--pv-grid) 45%, transparent)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max((r.value / max) * 100, 1.5)}%`, background: color }} />
                <div className="absolute top-0 bottom-0 w-[2px]" style={{ left: `${(refValue / max) * 100}%`, background: "var(--pv-muted)" }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] mt-2.5 inline-flex items-center gap-1.5" style={{ color: "var(--pv-muted)" }}>
        <span className="inline-block w-[2px] h-3" style={{ background: "var(--pv-muted)" }} />
        {refLabel}: {fmtValue(refValue)}
      </p>
    </div>
  );
}

// ── Horizontal ranked bars (top campaigns / posts) ──────────────────────────
export function RankedBars({ rows, color = PV_SLOTS[0], fmtValue }: {
  rows: Array<{ label: string; value: number; sub?: string }>;
  color?: string;
  fmtValue: (n: number) => string;
}) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground py-6 text-center">Sin datos en el período</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-xs mb-1 gap-2">
            <span className="font-medium truncate flex-1" title={r.label}>{r.label}</span>
            <span className="tabular-nums shrink-0">
              <span className="font-semibold">{fmtValue(r.value)}</span>
              {r.sub && <span className="text-muted-foreground"> · {r.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--pv-grid) 45%, transparent)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max((r.value / max) * 100, 1.5)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
