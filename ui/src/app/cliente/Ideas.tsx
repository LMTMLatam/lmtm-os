// Ficha del cliente, sección partida de pages/ClientDashboard.tsx (rediseño 20/11).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientsApi, type Client, type ContentIdea } from "../../api/clients";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Target, Megaphone, Download, Lightbulb, RefreshCw } from "lucide-react";

export function IdeasTab({ client }: { client: Client }) {
  const qc = useQueryClient();
  const ideasQuery = useQuery({
    queryKey: ["client", client.slug, "content-ideas"],
    queryFn: () => clientsApi.listContentIdeas(client.slug),
  });
  const gen = useMutation({
    mutationFn: () => clientsApi.generateContent(client.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", client.slug, "content-ideas"] }),
  });

  const ideas = ideasQuery.data?.ideas ?? [];
  const pauta = ideas.filter((i) => i.kind === "pauta");
  const posteo = ideas.filter((i) => i.kind === "posteo");

  const IdeaCard = ({ i }: { i: ContentIdea }) => (
    <Card className="p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{i.title}</p>
        {i.format && <Badge variant="outline" className="shrink-0 text-[10px] uppercase">{i.format}</Badge>}
      </div>
      {i.copy && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{i.copy}</p>}
      {i.rationale && (
        <p className="text-[11px] text-violet-600 dark:text-violet-400 flex items-start gap-1">
          <Target className="h-3 w-3 mt-0.5 shrink-0" /> {i.rationale}
        </p>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Ideas personalizadas (usan competidores cargados + Enfoque Técnico + memoria del cliente).
        </p>
        <div className="flex items-center gap-1.5">
          {ideas.length > 0 && (
            <a href={clientsApi.contentCsvUrl(client.slug)} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline"><Download className="h-3 w-3 mr-1" /> CSV</Button>
            </a>
          )}
          <Button size="sm" disabled={gen.isPending} onClick={() => gen.mutate()}>
            <RefreshCw className={`h-3 w-3 mr-1 ${gen.isPending ? "animate-spin" : ""}`} />
            {ideas.length > 0 ? "Regenerar" : "Generar ideas"}
          </Button>
        </div>
      </div>

      {ideasQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando ideas…</p>
      ) : ideas.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Todavía no hay ideas para {client.name}. Tocá <span className="font-medium">Generar ideas</span> para crear
          una tanda usando sus competidores y su Enfoque Técnico.
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Megaphone className="h-4 w-4 text-rose-500" /> Pauta ({pauta.length})</h3>
            <div className="space-y-2">{pauta.map((i) => <IdeaCard key={i.id} i={i} />)}</div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Lightbulb className="h-4 w-4 text-amber-500" /> Posteo orgánico ({posteo.length})</h3>
            <div className="space-y-2">{posteo.map((i) => <IdeaCard key={i.id} i={i} />)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Memoria ─────────────────────────────────────────────────────────────────
// The living client brain: Enfoque Técnico + durable learnings the agents save.
// Banco de información: manual context entry into the client brain (novedades,
// stock, catálogos, docs) — the agents read this before working the client.
