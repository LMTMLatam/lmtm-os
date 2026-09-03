// LMTM-OS: agency-wide Growth panel.
//
// Aggregates real data only — no invented metrics. Ad spend/leads trend and
// issue throughput come straight from ads_insights / issues. The "ideas"
// section surfaces the weekly growth-roundtable debates (see
// services/growth-roundtable.ts) and their follow-up proposals, which are
// real child issues (issues.parentId), not text-matched guesses.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { growthApi, type GrowthSpendPoint, type GrowthThroughputPoint } from "../api/growth";
import { api } from "../api/client";
import { AgentEfficiencyCard } from "../components/AgentEfficiencyCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { statusBadge, statusBadgeDefault } from "@/lib/status-colors";
import { TrendingUp, Building2, DollarSign, Filter, CheckCircle2, Lightbulb } from "lucide-react";

// Spend is a cross-client sum, only meaningful in a single currency; the server
// sends the shared currency (or null if clients bill in mixed currencies).
function fmtMoney(n: number, currency: string | null): string {
  if (!currency) return `${new Intl.NumberFormat("es-AR").format(Math.round(n))} (multi-moneda)`;
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}
function fmtInt(n: number): string {
  return new Intl.NumberFormat("es-AR").format(Math.round(n));
}

function Kpi({ label, value, icon: Icon }: { label: string; value: string; icon: typeof DollarSign }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
    </Card>
  );
}

function BarRow({ points, metric, color, currency }: { points: GrowthSpendPoint[]; metric: "spend" | "leads"; color: string; currency: string | null }) {
  if (points.length === 0) return <div className="h-14 flex items-center justify-center text-xs text-muted-foreground">Sin datos</div>;
  const max = Math.max(...points.map((p) => p[metric]), 1);
  return (
    <div className="flex items-end gap-[2px]" style={{ height: 56 }}>
      {points.map((p, i) => {
        const v = p[metric];
        const pct = max > 0 ? (v / max) * 100 : 0;
        return (
          <div key={i} className={`flex-1 rounded-sm ${v > 0 ? color : "bg-muted/40"}`} style={{ height: `${Math.max(pct, 2)}%` }}
            title={`${p.date}: ${metric === "spend" ? fmtMoney(v, currency) : fmtInt(v)}`} />
        );
      })}
    </div>
  );
}

function ThroughputChart({ points }: { points: GrowthThroughputPoint[] }) {
  if (points.length === 0) return <div className="h-16 flex items-center justify-center text-xs text-muted-foreground">Sin datos</div>;
  const max = Math.max(...points.flatMap((p) => [p.created, p.done]), 1);
  return (
    <div className="flex items-end gap-2" style={{ height: 72 }}>
      {points.map((p, i) => (
        <div key={i} className="flex-1 flex items-end gap-[2px]" title={`Semana ${p.week}: creados ${p.created}, cerrados ${p.done}`}>
          <div className="flex-1 rounded-sm bg-sky-500/70" style={{ height: `${Math.max((p.created / max) * 100, 2)}%` }} />
          <div className="flex-1 rounded-sm bg-emerald-500/70" style={{ height: `${Math.max((p.done / max) * 100, 2)}%` }} />
        </div>
      ))}
    </div>
  );
}

const statusColor = (status: string): string => statusBadge[status] ?? statusBadgeDefault;

interface CotizadoRow {
  clienteSheet: string;
  clientName: string | null;
  slug: string | null;
  cotizado: { igPosteosSemana: number | null; igStoriesSemana: number | null; pautaIg: boolean; pautaMeta: boolean; pautaGoogle: boolean };
  realizado: { posteosMes: number; videosMes: number; storiesMes: number; spendMeta: number; spendGoogle: number };
  sinListaClickup: boolean;
  esperadoMes: { posteos: number; videos: number; stories: number };
  cumplimientoPct: number | null;
}

/** Cotizado (planilla del equipo) vs realizado (datos reales de LMTM-OS) —
 *  base del control mensual/trimestral para saber si hay que cobrar más. */
function CotizadoVsRealizado() {
  const [months, setMonths] = useState<1 | 3>(1);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["growth", "cotizado", months],
    queryFn: () => api.get<{ month: string; rows: CotizadoRow[]; sinMatch: string[]; prorrateoPct?: number }>(`/growth/cotizado?months=${months}`),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const pctColor = (p: number | null) => p == null ? "text-muted-foreground/50" : p >= 85 ? "text-emerald-500" : p >= 50 ? "text-amber-500" : "text-rose-500";
  // "Debíamos X, hicimos Y": ✓ si cumplió (≥85% del cotizado), ✗ si no.
  const hechoVsCotizado = (hecho: number, cotizado: number) => {
    if (cotizado <= 0) return <span className="text-muted-foreground/50">—</span>;
    const ok = hecho >= cotizado * 0.85;
    return (
      <span className={ok ? "text-emerald-500" : hecho >= cotizado * 0.5 ? "text-amber-500" : "text-rose-500"}>
        {hecho}/{cotizado} {ok ? "✓" : "✗"}
      </span>
    );
  };
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-medium">Cotizado vs Realizado</h2>
        <span className="text-[11px] text-muted-foreground">lo vendido (planilla) contra lo que salió de verdad</span>
        <div className="ml-auto flex gap-1">
          <button onClick={() => setMonths(1)} className={`text-[11px] px-2 py-0.5 rounded-md border ${months === 1 ? "border-emerald-500 text-emerald-600" : "border-border hover:bg-muted"}`}>Mes</button>
          <button onClick={() => setMonths(3)} className={`text-[11px] px-2 py-0.5 rounded-md border ${months === 3 ? "border-emerald-500 text-emerald-600" : "border-border hover:bg-muted"}`}>Trimestre</button>
        </div>
      </div>
      {isLoading && <Skeleton className="h-24 w-full" />}
      {isError && <div className="text-xs text-rose-500">No se pudo leer la planilla: {(error as Error).message}</div>}
      {data && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left border-b border-border">
                <th className="py-1.5 pr-2">Cliente</th>
                <th className="pr-2 text-right">Posteos (hecho/cotiz.)</th>
                <th className="pr-2 text-right">Videos y reels</th>
                <th className="pr-2 text-right">Stories</th>
                <th className="pr-2 text-right">Cumplimiento</th>
                <th className="pr-2 text-right">Pauta Meta</th>
                <th className="pr-2 text-right">Pauta Google</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.filter((r) => r.clientName).map((r, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1.5 pr-2">
                    {r.slug ? <Link to={`/c/${r.slug}`} className="hover:underline">{r.clientName}</Link> : r.clienteSheet}
                  </td>
                  <td className="pr-2 text-right">{r.sinListaClickup ? <span className="text-muted-foreground/50">sin lista</span> : hechoVsCotizado(r.realizado.posteosMes, r.esperadoMes.posteos)}</td>
                  <td className="pr-2 text-right">{r.sinListaClickup ? <span className="text-muted-foreground/50">—</span> : hechoVsCotizado(r.realizado.videosMes, r.esperadoMes.videos)}</td>
                  <td className="pr-2 text-right text-muted-foreground">{r.sinListaClickup || !r.esperadoMes.stories ? "—" : `${r.realizado.storiesMes}/${r.esperadoMes.stories}`}</td>
                  <td className={`pr-2 text-right font-semibold ${pctColor(r.cumplimientoPct)}`}>{r.cumplimientoPct != null ? `${r.cumplimientoPct}%` : r.sinListaClickup ? "sin lista" : "—"}</td>
                  <td className="pr-2 text-right text-muted-foreground">{r.realizado.spendMeta ? `$${r.realizado.spendMeta.toLocaleString("es-AR")}` : (r.cotizado.pautaMeta || r.cotizado.pautaIg) ? <span className="text-amber-500">cotizada, $0</span> : "—"}</td>
                  <td className="pr-2 text-right text-muted-foreground">{r.realizado.spendGoogle ? `$${r.realizado.spendGoogle.toLocaleString("es-AR")}` : r.cotizado.pautaGoogle ? <span className="text-amber-500">cotizada, $0</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.sinMatch.length > 0 && (
            <div className="text-[11px] text-muted-foreground mt-2">Sin match con clientes del sistema: {data.sinMatch.join(", ")}</div>
          )}
          <div className="text-[11px] text-muted-foreground mt-1">
            El "hecho" sale del calendario Redes de ClickUp: piezas con tag "mandado a make" en el período. Las stories se muestran pero no pesan en el % — el equipo todavía no las registra como tareas del calendario.
            {data.prorrateoPct != null && data.prorrateoPct < 100 && ` El cotizado está prorrateado al ${data.prorrateoPct}% del período transcurrido (no se exige el mes entero a mitad de mes).`}
            {" "}"Sin lista" = cliente sin calendario Redes mapeado. La inversión cotizada en $ se suma cuando esté la planilla de facturación.
          </div>
        </div>
      )}
    </Card>
  );
}

interface TriageCliente {
  clientId: string; name: string; slug: string; industry: string | null;
  semaforo: "rojo" | "amarillo" | "verde";
  salud: number | null; scorePauta: number | null; cumplimientoPct: number | null;
  problemas: string[]; acciones: string[];
}

/** La vista principal de Growth (pedido 20/7): 3 secciones rojo/amarillo/verde
 *  — la salud de cada cuenta hecha fácil de entender, cada cliente con sus
 *  problemas y el plan corto para salir del rojo. */
function SemaforoGeneral() {
  const [abierto, setAbierto] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["growth", "triage"],
    queryFn: () => api.get<{ rojo: TriageCliente[]; amarillo: TriageCliente[]; verde: TriageCliente[] }>("/growth/triage"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data) return null;
  const secciones: Array<{ key: "rojo" | "amarillo" | "verde"; titulo: string; sub: string; borde: string; dot: string; rows: TriageCliente[] }> = [
    { key: "rojo", titulo: "Rojo — atender ya", sub: "incumplimiento, problemas abiertos o pauta rota", borde: "border-rose-500/40", dot: "bg-rose-500", rows: data.rojo },
    { key: "amarillo", titulo: "Amarillo — seguimiento", sub: "algo flojea: no dejar que caiga a rojo", borde: "border-amber-500/40", dot: "bg-amber-500", rows: data.amarillo },
    { key: "verde", titulo: "Verde — sostener", sub: "en orden: buscar la próxima palanca de crecimiento", borde: "border-emerald-500/40", dot: "bg-emerald-500", rows: data.verde },
  ];
  return (
    <div className="space-y-4">
      {secciones.map((s) => (
        <Card key={s.key} className={`p-4 border ${s.borde}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`h-3 w-3 rounded-full ${s.dot}`} />
            <h2 className="font-semibold">{s.titulo}</h2>
            <span className="text-sm text-muted-foreground">({s.rows.length})</span>
            <span className="text-[11px] text-muted-foreground ml-2">{s.sub}</span>
          </div>
          {s.rows.length === 0 && <p className="text-xs text-muted-foreground">Ningún cliente acá. 🎉</p>}
          <div className="space-y-1">
            {s.rows.map((c) => (
              <div key={c.clientId} className="rounded-md border border-border/60">
                <button onClick={() => setAbierto(abierto === c.clientId ? null : c.clientId)} className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm">
                  <span className="font-medium truncate">{c.name}</span>
                  {c.salud != null && <span className="text-[11px] text-muted-foreground shrink-0">salud {c.salud}</span>}
                  {c.cumplimientoPct != null && <span className="text-[11px] text-muted-foreground shrink-0">cotizado {c.cumplimientoPct}%</span>}
                  {c.scorePauta != null && <span className="text-[11px] text-muted-foreground shrink-0">pauta {c.scorePauta}</span>}
                  <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{c.problemas.length ? `${c.problemas.length} problema${c.problemas.length > 1 ? "s" : ""}` : "sin problemas"} · {abierto === c.clientId ? "cerrar" : "ver plan"}</span>
                </button>
                {abierto === c.clientId && (
                  <div className="px-3 pb-2 text-xs space-y-2">
                    {c.problemas.length > 0 && (
                      <div>
                        <p className="font-medium text-muted-foreground mb-0.5">Problemas</p>
                        <ul className="list-disc ml-4 space-y-0.5">{c.problemas.map((p, i) => <li key={i}>{p}</li>)}</ul>
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-muted-foreground mb-0.5">Plan de acción</p>
                      <ul className="list-disc ml-4 space-y-0.5">{c.acciones.map((a, i) => <li key={i}>{a}</li>)}</ul>
                    </div>
                    <Link to={`/c/${c.slug}`} className="inline-block text-[11px] underline text-muted-foreground">Ver ficha y plan estratégico →</Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

interface CargaPersona { nombre: string; cuentas: number; porRol: Record<string, number>; clientes: string[] }

/** Carga del equipo (pedido 18/7): cuántas cuentas atiende cada persona según
 *  las columnas "Responsable de atención" de la planilla. Marca sobrecarga. */
function CargaEquipo() {
  const [expandida, setExpandida] = useState<string | null>(null);
  const { data, isError } = useQuery({
    queryKey: ["growth", "carga-equipo"],
    queryFn: () => api.get<{ personas: CargaPersona[] }>("/growth/carga-equipo"),
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (isError || !data?.personas.length) return null;
  const max = data.personas[0]?.cuentas ?? 1;
  const mediana = data.personas[Math.floor(data.personas.length / 2)]?.cuentas ?? 0;
  return (
    <Card className="p-5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-medium">Carga del equipo</h2>
        <span className="text-[11px] text-muted-foreground">cuentas por persona según la planilla — para ver quién está con muchas cuentas</span>
      </div>
      <div className="space-y-1.5">
        {data.personas.map((p) => {
          const sobrecarga = p.cuentas >= mediana * 2 && p.cuentas >= 8;
          return (
            <div key={p.nombre} className="text-xs">
              <button onClick={() => setExpandida(expandida === p.nombre ? null : p.nombre)} className="w-full flex items-center gap-2 text-left">
                <span className="w-24 truncate font-medium">{p.nombre}</span>
                <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                  <div className={`h-full ${sobrecarga ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${Math.round((p.cuentas / max) * 100)}%` }} />
                </div>
                <span className={`w-20 text-right ${sobrecarga ? "text-rose-500 font-semibold" : "text-muted-foreground"}`}>
                  {p.cuentas} cuentas{sobrecarga ? " ⚠" : ""}
                </span>
              </button>
              {expandida === p.nombre && (
                <div className="ml-24 mt-1 text-muted-foreground">
                  {Object.entries(p.porRol).map(([rol, n]) => `${rol}: ${n}`).join(" · ")}
                  <div className="mt-0.5">{p.clientes.join(", ")}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

interface SemaforoCliente {
  id: string; name: string; slug: string; industry: string | null;
  score: number; semaforo: "verde" | "amarillo" | "rojo"; oportunidades: string[];
}

/** Tablero master de pauta: cada cliente en semáforo + oportunidades, con el
 *  texto del análisis listo para copiar y reenviar al cliente. */
function SemaforoPauta() {
  const [expandido, setExpandido] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["growth", "semaforo"],
    queryFn: () => api.get<{ clientes: SemaforoCliente[] }>("/growth/semaforo-pauta"),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const dot = (s: string) => s === "verde" ? "bg-emerald-500" : s === "amarillo" ? "bg-amber-500" : "bg-rose-500";
  const copiar = async (slug: string, name: string) => {
    const a = await api.get<{ resumen: string[] }>(`/clients/${slug}/analisis-estrategico`);
    await navigator.clipboard.writeText([`📊 Análisis de pauta — ${name}`, "", ...(a.resumen ?? [])].join("\n"));
  };
  if (!data?.clientes.length) return null;
  return (
    <Card className="p-5 space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="font-medium">Semáforo de pauta — master</h2>
        <span className="text-[11px] text-muted-foreground">salud minada a diario · los peores primero · "copiar" arma el mensaje para el cliente</span>
      </div>
      <div className="grid md:grid-cols-2 gap-1.5">
        {data.clientes.map((c) => (
          <div key={c.id} className="rounded-md border border-border p-2 text-xs">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dot(c.semaforo)}`} />
              <Link to={`/c/${c.slug}`} className="font-medium hover:underline truncate">{c.name}</Link>
              <span className="text-muted-foreground">{c.score}/100</span>
              <button onClick={() => void copiar(c.slug, c.name)} className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted">Copiar</button>
              {c.oportunidades.length > 0 && (
                <button onClick={() => setExpandido(expandido === c.id ? null : c.id)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted">{c.oportunidades.length} opp</button>
              )}
            </div>
            {expandido === c.id && (
              <ul className="list-disc ml-6 mt-1 text-muted-foreground">
                {c.oportunidades.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Growth() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: "Growth" }]); }, [setBreadcrumbs]);

  // Data changes at most daily (ads sync) / hourly (issues); a 10-min staleTime
  // avoids re-running the 6-query aggregate on every window refocus.
  const { data, isLoading } = useQuery({ queryKey: ["growth", "overview"], queryFn: () => growthApi.overview(), staleTime: 10 * 60_000 });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-emerald-500" /> Growth
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Rojo: atender ya. Amarillo: seguimiento. Verde: sostener. Cada cliente con sus problemas y su plan. El detalle completo, abajo.
        </p>
      </div>

      <SemaforoGeneral />

      {isLoading && <Skeleton className="h-40 w-full" />}

      {data && (
        <details className="space-y-6 [&[open]>summary]:mb-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground select-none">
            Detalle completo — cotizado, carga del equipo, pauta, pulso operativo, mesa redonda
          </summary>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Clientes activos" value={fmtInt(data.kpis.activeClients)} icon={Building2} />
            <Kpi label="Pauta 30d (agregado)" value={fmtMoney(data.kpis.spend30d, data.kpis.spendCurrency)} icon={DollarSign} />
            <Kpi label="Leads 30d (agregado)" value={fmtInt(data.kpis.leads30d)} icon={Filter} />
            <Kpi label="Issues cerrados (últ. semana)" value={fmtInt(data.kpis.issuesDoneThisWeek)} icon={CheckCircle2} />
          </div>

          <CotizadoVsRealizado />

          <CargaEquipo />

          <SemaforoPauta />

          <Card className="p-5">
            <h2 className="font-medium mb-3">Pauta agregada — últimos 30 días</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Spend</p>
                <BarRow points={data.spendTrend} metric="spend" color="bg-blue-500" currency={data.kpis.spendCurrency} />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Leads</p>
                <BarRow points={data.spendTrend} metric="leads" color="bg-emerald-500" currency={data.kpis.spendCurrency} />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">Pulso operativo — issues por semana (últimas 8)</h2>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sky-500/70" />creados</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500/70" />cerrados</span>
              </div>
            </div>
            <ThroughputChart points={data.issuesThroughput} />
          </Card>

          <AgentEfficiencyCard />

          <div>
            <h2 className="font-medium flex items-center gap-2 mb-3"><Lightbulb className="h-4 w-4 text-amber-500" />Ideas de la mesa redonda semanal</h2>
            {data.roundtables.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no corrió ninguna mesa redonda.</p>
            ) : (
              <div className="space-y-3">
                {data.roundtables.map((rt) => (
                  <Card key={rt.id} className="p-4">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Badge className={`text-[10px] px-1.5 py-0 ${statusColor(rt.status)}`}>{rt.status}</Badge>
                      <Link to={`/issues/${rt.id}`} className="text-sm font-medium hover:underline">{rt.category}</Link>
                      <span className="text-[10px] text-muted-foreground ml-auto">{new Date(rt.createdAt).toLocaleDateString("es-AR")}</span>
                    </div>
                    {rt.proposals.length === 0 ? (
                      <p className="text-xs text-muted-foreground pl-1">Sin propuestas de seguimiento (todavía).</p>
                    ) : (
                      <div className="space-y-1 pl-1">
                        {rt.proposals.map((p) => (
                          <Link key={p.id} to={`/issues/${p.id}`} className="flex items-center gap-2 text-sm hover:bg-muted/50 rounded px-1.5 py-1 -mx-1.5">
                            <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${statusColor(p.status)}`}>{p.status}</Badge>
                            {p.identifier && <span className="text-[10px] text-muted-foreground shrink-0">{p.identifier}</span>}
                            <span className="truncate">{p.title}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
