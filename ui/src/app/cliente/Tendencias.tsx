// Ficha del cliente, sección partida de pages/ClientDashboard.tsx (rediseño 20/11).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clientsApi, type Client, type Trend } from "../../api/clients";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, TrendingUp } from "lucide-react";

const TAG_STYLE: Record<string, string> = {
  "potencial-de-gancho": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  explicativo: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  ignorar: "bg-zinc-500/10 text-zinc-500",
};

export function TendenciasTab({ client }: { client: Client }) {
  const qc = useQueryClient();
  const [showIgnored, setShowIgnored] = useState(false);
  const query = useQuery({
    queryKey: ["trends", client.industry ?? "all"],
    queryFn: () => clientsApi.listTrends({ niche: client.industry ?? undefined, days: 14 }),
  });
  const all = query.data?.trends ?? [];
  const visible = showIgnored ? all : all.filter((t) => t.tag !== "ignorar");

  const retag = (t: Trend, tag: string) =>
    clientsApi.setTrendTag(t.id, tag).then(() => qc.invalidateQueries({ queryKey: ["trends"] }));

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        <span>Últimos 14 días{client.industry ? ` · filtrado para ${client.industry}` : ""} · los agentes las minan a diario</span>
        <button onClick={() => setShowIgnored((v) => !v)} className="ml-auto px-2 py-0.5 rounded border border-border hover:bg-muted">
          {showIgnored ? "Ocultar ignoradas" : `Ver ignoradas (${all.length - visible.length})`}
        </button>
      </div>

      {query.isLoading && <Skeleton className="h-40 w-full" />}
      {query.isSuccess && visible.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="mt-3">Sin tendencias todavía. La rutina diaria de los agentes las va cargando acá.</p>
        </Card>
      )}

      <div className="space-y-2">
        {visible.map((t) => (
          <Card key={t.id} className="p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {t.url ? (
                    <a href={t.url} target="_blank" rel="noreferrer noopener" className="text-sm font-medium hover:underline inline-flex items-center gap-1">
                      {t.title} <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : <span className="text-sm font-medium">{t.title}</span>}
                </div>
                {t.summary && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.summary}</p>}
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
                  <span>{t.day}</span>
                  {t.source && <span>· {t.source}</span>}
                  {t.niches.map((n) => <Badge key={n} className="px-1.5 py-0 bg-violet-500/10 text-violet-700 dark:text-violet-300">{n}</Badge>)}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge className={`px-1.5 py-0 text-[10px] ${TAG_STYLE[t.tag] ?? TAG_STYLE.explicativo}`}>{t.tag}</Badge>
                <div className="flex gap-1">
                  {["potencial-de-gancho", "explicativo", "ignorar"].filter((x) => x !== t.tag).map((x) => (
                    <button key={x} onClick={() => retag(t, x)} className="text-[9px] px-1.5 py-0.5 rounded border border-border hover:bg-muted text-muted-foreground" title={`Re-etiquetar como ${x}`}>
                      → {x === "potencial-de-gancho" ? "gancho" : x}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Ideas de posteos ────────────────────────────────────────────────────────
// Surfaces the competitor-driven content ideas (pauta + posteo). Every client
// should always have ideas; if none exist yet the user can generate them, and
// the backend also auto-generates them weekly.
