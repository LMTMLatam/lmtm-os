// Ficha del cliente, sección partida de pages/ClientDashboard.tsx (rediseño 20/11).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientsApi, type Client, type Hook } from "../../api/clients";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, Loader2, Anchor, Pin, Copy, Trash2, Plus } from "lucide-react";

const SOURCE_BADGE: Record<string, string> = {
  organico: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  competidor: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  tendencia: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  manual: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
};

export function GanchosTab({ client }: { client: Client }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [newText, setNewText] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["client", client.slug, "hooks"],
    queryFn: () => clientsApi.listHooks(client.slug),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["client", client.slug, "hooks"] });
  const add = useMutation({
    mutationFn: () => clientsApi.addHook(client.slug, { text: newText.trim() }),
    onSuccess: () => { setNewText(""); refresh(); },
  });

  const all = query.data?.hooks ?? [];
  const filtered = q.trim()
    ? all.filter((h) => h.text.toLowerCase().includes(q.toLowerCase()) || (h.sourceRef ?? "").toLowerCase().includes(q.toLowerCase()))
    : all;

  const usar = async (h: Hook) => {
    await navigator.clipboard.writeText(h.text).catch(() => {});
    setCopied(h.id);
    setTimeout(() => setCopied(null), 1500);
    clientsApi.useHook(h.id).then(refresh).catch(() => {});
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar gancho…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 h-8 text-sm" />
        </div>
        <span className="text-xs text-muted-foreground">{all.length} gancho{all.length === 1 ? "" : "s"} en el baúl</span>
      </div>

      {/* Add manual */}
      <div className="flex items-center gap-2">
        <Input placeholder='Guardar un gancho nuevo… ej: "[X] acaba de matar a [Y]"' value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newText.trim()) add.mutate(); }}
          className="h-8 text-sm flex-1" />
        <Button size="sm" variant="outline" className="h-8" disabled={!newText.trim() || add.isPending} onClick={() => add.mutate()}>
          {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Guardar
        </Button>
      </div>

      {query.isLoading && <Skeleton className="h-40 w-full" />}
      {query.isSuccess && filtered.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Anchor className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="mt-3">{q ? `Nada matchea "${q}".` : "Baúl vacío. Los agentes lo van llenando con ganchos de tus posts top y de la competencia — o guardá uno arriba."}</p>
        </Card>
      )}

      <div className="space-y-2">
        {filtered.map((h) => (
          <Card key={h.id} className={`p-3 ${h.pinned ? "border-amber-500/40" : ""}`}>
            <p className="text-sm leading-relaxed">"{h.text}"</p>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[10px]">
              <Badge className={`px-1.5 py-0 ${SOURCE_BADGE[h.sourceKind] ?? SOURCE_BADGE.manual}`}>{h.sourceKind}</Badge>
              {h.format && <Badge className="px-1.5 py-0 bg-sky-500/10 text-sky-700 dark:text-sky-300">{h.format}</Badge>}
              {h.clientId === null && <Badge className="px-1.5 py-0 bg-violet-500/10 text-violet-700 dark:text-violet-300" title="Gancho global del nicho">nicho</Badge>}
              {h.views != null && <span className="text-muted-foreground">{Intl.NumberFormat("es-AR", { notation: "compact" }).format(h.views)} vistas</span>}
              {h.sourceRef && <span className="text-muted-foreground truncate max-w-[180px]" title={h.sourceRef}>{h.sourceRef}</span>}
              {h.timesUsed > 0 && <span className="text-muted-foreground">· usado {h.timesUsed}×</span>}
              <span className="ml-auto flex items-center gap-1">
                <button onClick={() => usar(h)} className="px-2 py-0.5 rounded border border-border hover:bg-muted inline-flex items-center gap-1 text-[10px]" title="Copiar al portapapeles (cuenta como uso)">
                  <Copy className="h-3 w-3" />{copied === h.id ? "Copiado ✓" : "Usar este"}
                </button>
                <button onClick={() => clientsApi.pinHook(h.id, !h.pinned).then(refresh)} className={`p-1 rounded hover:bg-muted ${h.pinned ? "text-amber-500" : "text-muted-foreground/50"}`} title={h.pinned ? "Despinear" : "Pinear arriba"}>
                  <Pin className="h-3 w-3" />
                </button>
                <button onClick={() => clientsApi.deleteHook(h.id).then(refresh)} className="p-1 rounded hover:bg-muted text-muted-foreground/50 hover:text-rose-500" title="Borrar">
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Tendencias ──────────────────────────────────────────────────────────────
// External news mined daily by the agents, filtered to this client's niche.

