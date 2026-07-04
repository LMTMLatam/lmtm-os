// LMTM-OS: per-niche intelligence panel.
//
// One card per niche: aggregated 30d ads performance, the mined benchmark
// (average vs best-quartile "ideal"), the winning content format, the
// suggested cross-niche experiment, top content and the competitor landscape.
// Reads the same learning-engine output the agents consume via
// lmtmGetNicheIntel — one source of truth for humans and agents.

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { nichesApi, type NicheIntel } from "../api/niches";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, Target, Trophy, FlaskConical, Swords, FileText, Briefcase, Loader2, X } from "lucide-react";

function fmtMoney(n: number): string {
  return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)}`;
}

function NicheCard({ n }: { n: NicheIntel }) {
  const [kit, setKit] = useState<string | null>(null);
  const gen = useMutation({
    mutationFn: () => nichesApi.salesKit(n.niche),
    onSuccess: (d) => setKit(d.onePager),
  });
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-semibold text-base">{n.niche}</h2>
        <Badge className="text-[10px] px-1.5 py-0 bg-violet-500/10 text-violet-700 dark:text-violet-300">
          {n.clients.length} cliente{n.clients.length === 1 ? "" : "s"}
        </Badge>
        <button onClick={() => gen.mutate()} disabled={gen.isPending}
          className="text-[11px] px-2 py-0.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1">
          {gen.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Briefcase className="h-3 w-3" />}
          Kit de venta
        </button>
        <span className="text-xs text-muted-foreground ml-auto">
          30d: {fmtMoney(n.ads30d.spend)} · {n.ads30d.leads} leads · CTR {(n.ads30d.ctr * 100).toFixed(2)}%
          {n.ads30d.cpl != null && ` · CPL ${fmtMoney(n.ads30d.cpl)}`}
        </span>
      </div>

      {kit && (
        <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 relative">
          <button onClick={() => setKit(null)} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-violet-500"><Briefcase className="h-3.5 w-3.5" />One-pager de venta — {n.niche}</div>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">{kit}</pre>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {n.clients.map((c) => (
          <Link key={c.id} to={`/c/${c.slug}`} className="text-[11px] px-2 py-0.5 rounded-full border border-border hover:bg-muted transition-colors">
            {c.name}
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="rounded-md border border-border p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5"><Target className="h-3.5 w-3.5 text-blue-500" />Benchmark del nicho</div>
          <p className="text-xs text-muted-foreground leading-relaxed">{n.benchmark?.pattern ?? "Sin benchmark todavía — necesita ≥2 clientes con pauta activa."}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5"><Trophy className="h-3.5 w-3.5 text-amber-500" />Formato ganador</div>
          <p className="text-xs text-muted-foreground leading-relaxed">{n.winningFormat?.pattern ?? "Sin datos de contenido suficientes todavía."}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5"><FlaskConical className="h-3.5 w-3.5 text-emerald-500" />Experimento sugerido</div>
          <p className="text-xs text-muted-foreground leading-relaxed">{n.experiment?.pattern ?? "Nada para testear cruzado por ahora."}</p>
        </div>
      </div>

      {(n.topContent.length > 0 || n.competitors.length > 0) && (
        <div className="grid md:grid-cols-2 gap-3">
          {n.topContent.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5"><FileText className="h-3.5 w-3.5" />Mejor contenido del nicho</div>
              <div className="space-y-1">
                {n.topContent.map((t, i) => (
                  <div key={i} className="text-xs flex items-center gap-2">
                    <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">{t.format ?? "?"}</Badge>
                    <span className="truncate text-muted-foreground">{t.title ?? "(sin título)"}</span>
                    <span className="text-[10px] text-muted-foreground/70 ml-auto shrink-0">{t.clientName} · {Math.round(t.score)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {n.competitors.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5"><Swords className="h-3.5 w-3.5" />Competidores del nicho</div>
              <div className="flex flex-wrap gap-1">
                {n.competitors.map((c, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground" title={`Competidor de ${c.clientName}`}>{c.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function Niches() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: "Nichos" }]); }, [setBreadcrumbs]);

  // Mined every 24h by the learning engine; no point refetching aggressively.
  const { data, isLoading } = useQuery({ queryKey: ["niches"], queryFn: () => nichesApi.list(), staleTime: 10 * 60_000 });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Layers className="h-6 w-6 text-violet-500" /> Nichos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inteligencia cruzada por rubro: benchmarks entre pares, formatos que ganan, experimentos y competencia. Lo mismo que consumen los agentes.
        </p>
      </div>

      {isLoading && <Skeleton className="h-48 w-full" />}
      {data && data.niches.length === 0 && <p className="text-sm text-muted-foreground">Sin nichos con clientes clasificados todavía.</p>}
      {data?.niches.map((n) => <NicheCard key={n.niche} n={n} />)}
    </div>
  );
}
