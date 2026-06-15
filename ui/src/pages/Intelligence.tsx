import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { clientsApi, type Client } from "../api/clients";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Gauge, Lightbulb, MessageSquareWarning, BarChart3, RefreshCw, ExternalLink, FileText } from "lucide-react";

function scoreColor(v: number): string {
  if (v >= 70) return "text-emerald-500";
  if (v >= 40) return "text-amber-500";
  return "text-rose-500";
}

export function Intelligence() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const qc = useQueryClient();
  const [slug, setSlug] = useState<string>("");

  useEffect(() => { setBreadcrumbs([{ label: "Inteligencia" }]); }, [setBreadcrumbs]);

  const clientsQuery = useQuery({ queryKey: ["clients", "list", "active"], queryFn: () => clientsApi.list("active") });
  const clients: Client[] = clientsQuery.data?.clients ?? [];
  useEffect(() => { if (!slug && clients[0]) setSlug(clients[0].slug); }, [clients, slug]);

  const intelQuery = useQuery({
    queryKey: ["intel", slug],
    queryFn: () => clientsApi.intel(slug),
    enabled: !!slug,
  });
  const intel = intelQuery.data;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["intel", slug] });
  const mScore = useMutation({ mutationFn: () => clientsApi.runScore(slug), onSuccess: invalidate });
  const mBrain = useMutation({ mutationFn: () => clientsApi.refreshBrain(slug), onSuccess: invalidate });
  const mOpps = useMutation({ mutationFn: () => clientsApi.runOpportunities(slug), onSuccess: invalidate });
  const mContent = useMutation({ mutationFn: () => clientsApi.rebuildContent(slug), onSuccess: invalidate });
  const busy = mScore.isPending || mBrain.isPending || mOpps.isPending || mContent.isPending;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Brain className="h-6 w-6 text-violet-500" /> Inteligencia
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Memoria viva, scores, oportunidades y feedback por cliente.
          </p>
        </div>
        <select value={slug} onChange={(e) => setSlug(e.target.value)} className="h-9 px-3 rounded-md border border-border bg-background text-sm min-w-[200px]">
          {clients.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => mScore.mutate()} disabled={busy || !slug} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" />Recalcular score</button>
        <button onClick={() => mBrain.mutate()} disabled={busy || !slug} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"><Brain className="h-3.5 w-3.5" />Refrescar memoria</button>
        <button onClick={() => mOpps.mutate()} disabled={busy || !slug} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5" />Generar oportunidades</button>
        <button onClick={() => mContent.mutate()} disabled={busy || !slug} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Reconstruir contenido</button>
      </div>

      {intelQuery.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {intel && (
        <>
          {/* Scores */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><Gauge className="h-4 w-4" /><h2 className="font-medium">Scores</h2></div>
            {intel.score ? (
              <div className="flex gap-8">
                <div><p className="text-xs text-muted-foreground">Salud de cuenta</p><p className={`text-3xl font-semibold ${scoreColor(intel.score.healthScore)}`}>{intel.score.healthScore}</p></div>
                <div><p className="text-xs text-muted-foreground">Operativo</p><p className={`text-3xl font-semibold ${scoreColor(intel.score.opsScore)}`}>{intel.score.opsScore}</p></div>
                <div className="flex-1 text-xs text-muted-foreground self-center">
                  {Object.entries(intel.score.components).map(([k, v]) => <span key={k} className="inline-block mr-3">{k}: {String(v)}</span>)}
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Sin score aún. Tocá "Recalcular score".</p>}
          </Card>

          {/* Opportunities */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><Lightbulb className="h-4 w-4" /><h2 className="font-medium">Oportunidades</h2></div>
            {intel.opportunities.length === 0 ? <p className="text-sm text-muted-foreground">Sin oportunidades. Tocá "Generar oportunidades".</p> : (
              <div className="space-y-2">
                {intel.opportunities.map((o) => (
                  <div key={o.id} className="border-l-2 border-violet-400 pl-3 py-1">
                    <div className="flex items-center gap-2"><Badge className="text-[10px] px-1.5 py-0 bg-violet-500/10 text-violet-700 dark:text-violet-300">{o.kind}</Badge><span className="text-sm font-medium">{o.title}</span><span className="text-[10px] text-muted-foreground ml-auto">prioridad {o.priority}</span></div>
                    {o.suggestedAction && <p className="text-xs text-muted-foreground mt-0.5">{o.suggestedAction}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Customer Brain */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2"><Brain className="h-4 w-4" /><h2 className="font-medium">Customer Brain</h2></div>
              {intel.client.enfoqueTecnicoUrl && (
                <a href={intel.client.enfoqueTecnicoUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-violet-500 hover:text-violet-400 transition-colors">
                  <FileText className="h-3.5 w-3.5" />Enfoque Técnico<ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">Sincronizado con el Enfoque Técnico de ClickUp al cargar.</p>
            {intel.brain.length === 0 ? <p className="text-sm text-muted-foreground">Memoria vacía. Completá el Enfoque Técnico en ClickUp o tocá "Refrescar memoria".</p> : (
              <div className="space-y-1.5">
                {/* Enfoque Técnico pinned entry — shown first and highlighted */}
                {(() => {
                  const enfoqueEntry = intel.brain.find(m => m.key === "enfoque-tecnico");
                  const rest = intel.brain.filter(m => m.key !== "enfoque-tecnico").slice(0, 18);
                  return (
                    <>
                      {enfoqueEntry && (
                        <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 mb-2">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <FileText className="h-3.5 w-3.5 text-violet-400" />
                            <span className="text-xs font-medium text-violet-400">Enfoque Técnico</span>
                            {intel.client.enfoqueTecnicoUrl && (
                              <a href={intel.client.enfoqueTecnicoUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-violet-400 hover:text-violet-300"><ExternalLink className="h-3 w-3" /></a>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                            {enfoqueEntry.content.length > 600 ? enfoqueEntry.content.slice(0, 600) + "…" : enfoqueEntry.content}
                          </p>
                        </div>
                      )}
                      {rest.map((m) => (
                        <div key={m.id} className="text-sm flex gap-2">
                          <Badge className="text-[10px] px-1.5 py-0 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 shrink-0 self-start">{m.kind}</Badge>
                          <span className="text-muted-foreground whitespace-pre-wrap">{m.content.slice(0, 280)}</span>
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
            )}
          </Card>

          {/* Feedback */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><MessageSquareWarning className="h-4 w-4" /><h2 className="font-medium">Feedback</h2></div>
            {intel.feedback.length === 0 ? <p className="text-sm text-muted-foreground">Sin feedback capturado.</p> : (
              <div className="space-y-1.5">
                {intel.feedback.slice(0, 15).map((f) => (
                  <div key={f.id} className="text-sm flex gap-2">
                    <Badge className={`text-[10px] px-1.5 py-0 shrink-0 self-start ${f.sentiment === "negative" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : f.sentiment === "positive" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300"}`}>{f.classification}</Badge>
                    <span className="text-muted-foreground">{f.rawText.slice(0, 200)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Top content (knowledge graph) */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><BarChart3 className="h-4 w-4" /><h2 className="font-medium">Mejor contenido</h2></div>
            {intel.topContent.length === 0 ? <p className="text-sm text-muted-foreground">Sin datos de contenido. Tocá "Reconstruir contenido".</p> : (
              <div className="space-y-1">
                {intel.topContent.map((c) => (
                  <div key={c.id} className="text-sm flex items-center gap-2">
                    <Badge className="text-[10px] px-1.5 py-0 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 shrink-0">{c.format ?? c.source}</Badge>
                    <span className="truncate">{c.title ?? "(sin título)"}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">score {Math.round(Number(c.score ?? 0))}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
