// Ficha del cliente, sección partida de pages/ClientDashboard.tsx (rediseño 20/11).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Client } from "../../api/clients";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Target, Activity, Users, BarChart3, AlertCircle, Lightbulb, Sparkles } from "lucide-react";
import { api } from "../../api/client";

interface PlanProfundo {
  benchmark: { cpl: number | null; rubroCplProm: number; rubroCplIdeal: number; deltaPct: number | null } | null;
  formatos: { mix: Record<string, number>; dominante: string | null; dominantePct: number } | null;
  porEdad: Array<{ rango: string; spend: number; leads: number; cpl: number | null }>;
  porConjunto?: Array<{ id: string; nombre: string; spend: number; leads: number; cpl: number | null; ctrPct: number | null; deltaVsRubroPct: number | null; creativosActivos: number; formatos: string[]; monoCreativo: boolean; creativoUnico: string | null }>;
  resumen: string[];
}

/** Parte el markdown del agente en secciones por encabezado (## Título). */
function parseSecciones(md: string): Array<{ titulo: string; lineas: string[] }> {
  const out: Array<{ titulo: string; lineas: string[] }> = [];
  let cur: { titulo: string; lineas: string[] } = { titulo: "", lineas: [] };
  for (const raw of md.split("\n")) {
    const h = raw.match(/^#{1,3}\s+(.*)/);
    if (h) {
      if (cur.titulo || cur.lineas.some((l) => l.trim())) out.push(cur);
      cur = { titulo: h[1].replace(/\*\*/g, "").replace(/^\d+\.\s*/, "").trim(), lineas: [] };
    } else {
      cur.lineas.push(raw);
    }
  }
  if (cur.titulo || cur.lineas.some((l) => l.trim())) out.push(cur);
  return out;
}

function seccionEstilo(titulo: string): { Icon: typeof Sparkles; color: string } {
  const t = titulo.toLowerCase();
  if (/radiograf|diagn|score|n[úu]mero/.test(t)) return { Icon: Activity, color: "text-sky-500" };
  if (/rubro|funciona|nicho|referent|mercado/.test(t)) return { Icon: TrendingUp, color: "text-emerald-500" };
  if (/competidor|contraste/.test(t)) return { Icon: Users, color: "text-orange-500" };
  if (/idea|creativ/.test(t)) return { Icon: Lightbulb, color: "text-amber-500" };
  if (/fallo|soluci|problema|riesgo/.test(t)) return { Icon: AlertCircle, color: "text-rose-500" };
  if (/acci[oó]n|semana|siguiente/.test(t)) return { Icon: Target, color: "text-violet-500" };
  if (/pauta|ads|inversi/.test(t)) return { Icon: BarChart3, color: "text-blue-500" };
  return { Icon: Sparkles, color: "text-muted-foreground" };
}

/** Negritas **x** inline, sin librería. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="text-foreground font-semibold">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)}</>;
}

/** Cuerpo de una sección: junta bullets consecutivos en listas, el resto en párrafos. */
function SeccionCuerpo({ lineas }: { lineas: string[] }) {
  const bloques: Array<{ tipo: "ul" | "ol" | "p"; items: string[] }> = [];
  for (const raw of lineas) {
    const l = raw.trim();
    if (!l) continue;
    const bullet = l.match(/^[-*•]\s+(.*)/);
    const numerado = l.match(/^\d+[.)]\s+(.*)/);
    const tipo = bullet ? "ul" : numerado ? "ol" : "p";
    const texto = (bullet?.[1] ?? numerado?.[1] ?? l);
    const last = bloques[bloques.length - 1];
    if (last && last.tipo === tipo && tipo !== "p") last.items.push(texto);
    else bloques.push({ tipo, items: [texto] });
  }
  return (
    <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
      {bloques.map((b, i) => b.tipo === "p"
        ? b.items.map((t, j) => <p key={`${i}-${j}`}><Inline text={t} /></p>)
        : b.tipo === "ol"
          ? <ol key={i} className="list-decimal ml-4 space-y-1.5">{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ol>
          : <ul key={i} className="list-disc ml-4 space-y-1">{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ul>)}
    </div>
  );
}

const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

/** Narrativa del estratega (LLM sobre los datos duros) — se pide aparte
 *  porque la primera generación tarda unos segundos. */
function NarrativaPauta({ slug }: { slug: string }) {
  const q = useQuery({
    queryKey: ["analisis-narrativa", slug],
    queryFn: () => api.get<{ texto: string | null }>(`/clients/${slug}/analisis-narrativa`),
    staleTime: 30 * 60_000,
    retry: false,
  });
  if (q.isLoading) return <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground animate-pulse">El estratega está escribiendo el análisis…</div>;
  if (!q.data?.texto) return null;
  return (
    <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 p-3">
      <SeccionCuerpo lineas={q.data.texto.split("\n")} />
    </div>
  );
}

/** Análisis de pauta (estilo IA de Meta): narrativa + conjuntos + benchmark,
 *  formatos y edades. */
function AnalisisPautaCard({ profundo, slug }: { profundo: PlanProfundo | null; slug: string }) {
  if (!profundo) return null;
  const { benchmark, formatos, porEdad, resumen } = profundo;
  const porConjunto = profundo.porConjunto ?? [];
  const hayAlgo = benchmark || (formatos && Object.keys(formatos.mix).length > 0) || porEdad.length > 0 || resumen.length > 0 || porConjunto.length > 0;
  if (!hayAlgo) return null;
  const conCpl = porEdad.filter((a) => a.cpl != null);
  const mejorCpl = conCpl.length ? Math.min(...conCpl.map((a) => a.cpl!)) : null;
  const peorCpl = conCpl.length ? Math.max(...conCpl.map((a) => a.cpl!)) : null;
  const totalFmt = formatos ? Object.values(formatos.mix).reduce((a, b) => a + b, 0) : 0;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-blue-500" />
        <h3 className="font-semibold text-sm">Análisis de pauta</h3>
        <span className="text-[11px] text-muted-foreground">por conjunto · benchmark del rubro · formatos · edades (30d)</span>
      </div>
      <NarrativaPauta slug={slug} />
      {porConjunto.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left border-b border-border">
                <th className="py-1 pr-2">Conjunto de anuncios</th>
                <th className="pr-2 text-right">Inversión</th>
                <th className="pr-2 text-right">Consultas</th>
                <th className="pr-2 text-right">Costo/consulta</th>
                <th className="pr-2 text-right">vs rubro</th>
                <th className="pr-2 text-right">Creativos</th>
              </tr>
            </thead>
            <tbody>
              {porConjunto.map((a) => (
                <tr key={a.id} className="border-b border-border/40">
                  <td className="py-1 pr-2 font-medium max-w-[220px] truncate" title={a.nombre}>{a.nombre}</td>
                  <td className="pr-2 text-right tabular-nums text-muted-foreground">{money(a.spend)}</td>
                  <td className="pr-2 text-right tabular-nums">{a.leads}</td>
                  <td className="pr-2 text-right tabular-nums">{a.cpl != null ? money(a.cpl) : "—"}</td>
                  <td className={`pr-2 text-right tabular-nums font-semibold ${a.deltaVsRubroPct == null ? "text-muted-foreground/50" : a.deltaVsRubroPct <= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                    {a.deltaVsRubroPct != null ? `${a.deltaVsRubroPct > 0 ? "+" : ""}${a.deltaVsRubroPct}%` : "—"}
                  </td>
                  <td className="pr-2 text-right">
                    {a.monoCreativo
                      ? <span className="text-amber-500" title={`Depende solo de "${a.creativoUnico ?? ""}"`}>⚠ 1 solo</span>
                      : <span className="text-muted-foreground">{a.creativosActivos || "—"}{a.formatos.length ? ` · ${a.formatos.join("/")}` : ""}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {resumen.length > 0 && (
        <ul className="space-y-1.5 text-xs">
          {resumen.map((r, i) => <li key={i} className="flex gap-2"><span className="text-blue-500 shrink-0">▸</span><span><Inline text={r} /></span></li>)}
        </ul>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        {benchmark && benchmark.cpl != null && (
          <div className="rounded-md border border-border p-2.5 text-xs space-y-1">
            <p className="font-medium">Costo por consulta vs el rubro</p>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold">{money(benchmark.cpl)}</span>
              {benchmark.deltaPct != null && (
                <span className={`text-[11px] font-semibold ${benchmark.deltaPct <= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {benchmark.deltaPct > 0 ? "+" : ""}{benchmark.deltaPct}% vs promedio
                </span>
              )}
            </div>
            <p className="text-muted-foreground">Rubro: promedio {money(benchmark.rubroCplProm)} · mejor cuartil {money(benchmark.rubroCplIdeal)}</p>
          </div>
        )}
        {formatos && totalFmt > 0 && (
          <div className="rounded-md border border-border p-2.5 text-xs space-y-1.5">
            <p className="font-medium">Mix de formatos ({totalFmt} avisos)</p>
            {Object.entries(formatos.mix).sort((a, b) => b[1] - a[1]).map(([fmt, n]) => (
              <div key={fmt} className="flex items-center gap-2">
                <span className="w-16 capitalize text-muted-foreground">{fmt}</span>
                <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                  <div className={`h-full ${formatos.dominantePct >= 70 && fmt === formatos.dominante ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${Math.round((n / totalFmt) * 100)}%` }} />
                </div>
                <span className="w-10 text-right text-muted-foreground">{Math.round((n / totalFmt) * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {porEdad.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left border-b border-border">
                <th className="py-1 pr-2">Edad</th>
                <th className="pr-2 text-right">Inversión</th>
                <th className="pr-2 text-right">Consultas</th>
                <th className="pr-2 text-right">Costo por consulta</th>
              </tr>
            </thead>
            <tbody>
              {porEdad.map((a) => (
                <tr key={a.rango} className="border-b border-border/40">
                  <td className="py-1 pr-2 font-medium">{a.rango}</td>
                  <td className="pr-2 text-right tabular-nums text-muted-foreground">{money(a.spend)}</td>
                  <td className="pr-2 text-right tabular-nums">{a.leads}</td>
                  <td className={`pr-2 text-right tabular-nums font-semibold ${a.cpl == null ? "text-rose-500" : a.cpl === mejorCpl ? "text-emerald-500" : a.cpl === peorCpl && conCpl.length > 1 ? "text-rose-500" : ""}`}>
                    {a.cpl != null ? money(a.cpl) : "sin consultas"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function PlanAccionTab({ client }: { client: Client }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["plan-accion", client.slug],
    queryFn: () => api.get<{ plan: {
      semaforo: "rojo" | "amarillo" | "verde" | "sin-datos";
      salud: number | null; scorePauta: number | null; cumplimientoPct: number | null;
      problemas: string[]; acciones: string[]; etapa?: string | null;
      reporteAgente: { title: string; content: string; createdAt: string } | null;
    } | null; profundo: PlanProfundo | null }>(`/clients/${client.slug}/plan-accion`),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const regenerar = useMutation({
    mutationFn: () => api.post(`/clients/${client.slug}/plan-accion/regenerar`, {}),
    onSuccess: () => setMsg("Pedido enviado — Luna está armando el plan; refrescá en unos minutos."),
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "No se pudo pedir la regeneración."),
  });
  const p = q.data?.plan;
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return (
    <div className="text-sm text-muted-foreground space-y-2">
      <p>No se pudo cargar el plan ({(q.error as Error).message.slice(0, 120)}).</p>
      <button onClick={() => void q.refetch()} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted">Reintentar</button>
    </div>
  );
  if (!p) return <p className="text-sm text-muted-foreground">Sin datos de triage todavía (corre con los vigilantes diarios).</p>;
  const dot = p.semaforo === "verde" ? "bg-emerald-500" : p.semaforo === "amarillo" ? "bg-amber-500" : p.semaforo === "sin-datos" ? "bg-muted-foreground/40" : "bg-rose-500";
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`h-3 w-3 rounded-full ${dot}`} />
          <h3 className="font-semibold text-sm capitalize">{p.semaforo === "sin-datos" ? "Sin datos para juzgar" : p.semaforo}</h3>
          {p.salud != null && <span className="text-[11px] text-muted-foreground">salud {p.salud}/100</span>}
          {p.cumplimientoPct != null && <span className="text-[11px] text-muted-foreground">cotizado {p.cumplimientoPct}%</span>}
          {p.scorePauta != null && <span className="text-[11px] text-muted-foreground">pauta {p.scorePauta}/100</span>}
          <button onClick={() => { setMsg(null); regenerar.mutate(); }} disabled={regenerar.isPending} className="ml-auto text-[11px] px-2 py-0.5 rounded-md border border-border hover:bg-muted disabled:opacity-40">
            {regenerar.isPending ? "Pidiendo…" : "Regenerar plan estratégico"}
          </button>
        </div>
        {msg && <p className="text-[11px] text-muted-foreground">{msg}</p>}
        {p.etapa && <p className="text-xs"><span className="font-medium text-muted-foreground">Dónde está parado: </span>{p.etapa}</p>}
        {p.problemas.length > 0 && (
          <div className="text-xs">
            <p className="font-medium text-muted-foreground mb-1">Problemas abiertos</p>
            <ul className="list-disc ml-4 space-y-0.5">{p.problemas.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
        <div className="text-xs">
          <p className="font-medium text-muted-foreground mb-1">Plan corto (automático, siempre fresco)</p>
          <ul className="list-disc ml-4 space-y-0.5">{p.acciones.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      </Card>
      <AnalisisPautaCard profundo={q.data?.profundo ?? null} slug={client.slug} />
      {p.reporteAgente ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-500" />
            <h3 className="font-semibold text-sm">{p.reporteAgente.title}</h3>
            {(() => {
              const dias = Math.floor((Date.now() - new Date(p.reporteAgente.createdAt).getTime()) / 86400000);
              // Aviso de dato viejo (LMTM-3004): el plan se veía como actual
              // aunque tuviera semanas.
              return (
                <span className={`text-[11px] ${dias > 7 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
                  {new Date(p.reporteAgente.createdAt).toLocaleDateString("es-AR")}
                  {dias > 7 ? ` · desactualizado (hace ${dias} días) — regenerá` : ""}
                </span>
              );
            })()}
            <button onClick={() => void navigator.clipboard.writeText(p.reporteAgente!.content)} className="ml-auto text-[11px] px-2 py-0.5 rounded-md border border-border hover:bg-muted">Copiar todo</button>
          </div>
          {(() => {
            const secciones = parseSecciones(p.reporteAgente.content).filter((s) => s.titulo && s.lineas.some((l) => l.trim()));
            if (secciones.length < 2) {
              // Un plan corto o sin secciones es válido: el formato sale del caso (04/11).
              return (
                <Card className="p-4">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-[32rem] overflow-y-auto">{p.reporteAgente.content}</pre>
                </Card>
              );
            }
            return (
              <div className="grid gap-3">
                {secciones.map((s, i) => {
                  const { Icon, color } = seccionEstilo(s.titulo);
                  return (
                    <Card key={i} className="p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${color}`} />
                        <h4 className="font-semibold text-sm">{s.titulo}</h4>
                      </div>
                      <SeccionCuerpo lineas={s.lineas} />
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Todavía no hay reporte estratégico del agente — la rutina semanal lo va generando cliente por cliente, o pedilo ya con "Regenerar".</p>
      )}
    </div>
  );
}

/** Consultas IA (pedido 20/7): lo que el equipo le pregunta a ChatGPT/Gemini
 *  sobre este cliente se pega acá → documento + issue de destilación al brain. */
