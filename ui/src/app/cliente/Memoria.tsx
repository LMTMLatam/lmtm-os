// Ficha del cliente, sección partida de pages/ClientDashboard.tsx (rediseño 20/11).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientsApi, type Client } from "../../api/clients";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCcw, Loader2, Plus } from "lucide-react";
import { DecisorCard } from "@/components/DecisorCard";

function AddBrainNote({ client, onSaved }: { client: Client; onSaved: () => void }) {
  const [content, setContent] = useState("");
  const [kind, setKind] = useState("context");
  const [msg, setMsg] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => clientsApi.addBrainNote(client.slug, { content: content.trim(), kind }),
    onSuccess: () => { setContent(""); setMsg("Guardado — los agentes ya lo ven ✓"); onSaved(); setTimeout(() => setMsg(null), 4000); },
    onError: (e) => setMsg((e as Error).message),
  });
  return (
    <Card className="p-3 space-y-2">
      <p className="text-xs font-medium">Banco de información — agregá contexto que los agentes deben saber</p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Novedades, lista de productos en stock, cosas que el cliente quiere reventar, links a catálogos/manuales, datos de la empresa…"
        className="w-full h-20 rounded-md border border-border bg-transparent px-2 py-1.5 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-violet-500/40"
      />
      <div className="flex items-center gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)}
          className="h-8 rounded-md border border-border bg-transparent px-2 text-xs">
          <option value="context">Contexto / novedad</option>
          <option value="fact">Dato de la empresa</option>
          <option value="preference">Preferencia del cliente</option>
          <option value="event">Evento / lanzamiento</option>
          <option value="risk">Riesgo / cuidado</option>
        </select>
        <Button size="sm" className="h-8" disabled={!content.trim() || add.isPending} onClick={() => add.mutate()}>
          {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />} Guardar en la memoria
        </Button>
        {msg && <span className="text-[11px] text-muted-foreground">{msg}</span>}
      </div>
    </Card>
  );
}

// ── Perfil de videos del cliente: referencias etiquetables (tipo + concepto).
// Etiquetar acá define el perfil que refreshClientBrain pinnea al brain y que
// los agentes siguen al crear ideas de video en Super Redes.
const VIDEO_TIPOS = ["Blanda", "VSL", "Comercial", "Engagement"] as const;
const VIDEO_CONCEPTOS = ["Cinemático", "UGC", "Institucional", "Viral", "Tendencia", "Inspiracional", "Refe edición"] as const;

function VideoProfile({ client }: { client: Client }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["client", client.slug, "video-refs"],
    queryFn: () => clientsApi.videoReferences(client.slug),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const refs = data?.references ?? [];
  const toggle = async (refId: string, current: string[], tag: string) => {
    const next = current.includes(tag) ? current.filter((c) => c !== tag) : [...current, tag];
    await clientsApi.tagVideoReference(refId, next);
    await qc.invalidateQueries({ queryKey: ["client", client.slug, "video-refs"] });
  };
  if (refs.length === 0) return null;
  const STD = [...VIDEO_TIPOS, ...VIDEO_CONCEPTOS] as readonly string[];
  return (
    <Card className="p-4 space-y-2">
      <div className="text-sm font-medium">🎬 Perfil de videos</div>
      <p className="text-[11px] text-muted-foreground">
        Etiquetá cada referencia con tipo (Blanda/VSL/Comercial/Engagement) y concepto (Cinemático, UGC…). El perfil dominante se fija solo al brain y guía las ideas de video del agente.
      </p>
      <div className="divide-y divide-border/40">
        {refs.map((r) => (
          <div key={r.id} className="text-xs py-1.5">
            <div className="flex items-center gap-2">
              <a href={r.url} target="_blank" rel="noreferrer noopener" className="truncate text-muted-foreground hover:underline max-w-[18rem]" title={r.comentario ?? r.url}>
                {r.url.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
              <span className="flex flex-wrap gap-1 ml-auto items-center">
                {r.categorias.map((c) => (
                  <Badge key={c} className="text-[9px] px-1.5 py-0 bg-violet-500/10 text-violet-700 dark:text-violet-300">{c}</Badge>
                ))}
                {r.categorias.length === 0 && <span className="text-[9px] text-amber-500">sin etiquetar</span>}
                <button onClick={() => setEditingId(editingId === r.id ? null : r.id)} className="text-muted-foreground hover:text-foreground text-[10px] px-1 border border-border rounded">
                  etiquetar
                </button>
              </span>
            </div>
            {editingId === r.id && (
              <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                <span className="text-[9px] text-muted-foreground">Tipo:</span>
                {VIDEO_TIPOS.map((t) => (
                  <button key={t} onClick={() => toggle(r.id, r.categorias, t)}
                    className={`text-[9px] px-1.5 py-0.5 rounded border ${r.categorias.includes(t) ? "border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300" : "border-border text-muted-foreground hover:bg-muted"}`}>{t}</button>
                ))}
                <span className="text-[9px] text-muted-foreground ml-1.5">Concepto:</span>
                {VIDEO_CONCEPTOS.map((t) => (
                  <button key={t} onClick={() => toggle(r.id, r.categorias, t)}
                    className={`text-[9px] px-1.5 py-0.5 rounded border ${r.categorias.includes(t) ? "border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300" : "border-border text-muted-foreground hover:bg-muted"}`}>{t}</button>
                ))}
                {r.categorias.filter((c) => !STD.includes(c)).map((c) => (
                  <button key={c} onClick={() => toggle(r.id, r.categorias, c)} title="Etiqueta libre (click para quitar)"
                    className="text-[9px] px-1.5 py-0.5 rounded border border-zinc-500/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">{c} ×</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function MemoriaTab({ client }: { client: Client }) {
  const qc = useQueryClient();
  const intelQuery = useQuery({
    queryKey: ["client", client.slug, "intel"],
    queryFn: () => clientsApi.intel(client.slug),
  });
  const refresh = useMutation({
    mutationFn: () => clientsApi.refreshBrain(client.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", client.slug, "intel"] }),
  });

  const intel = intelQuery.data;
  const brain = (intel?.brain ?? []).slice().sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Memoria viva del cliente — Enfoque Técnico + aprendizajes guardados por los agentes.</p>
        <div className="flex items-center gap-1.5">
          {intel?.client.enfoqueTecnicoUrl && (
            <a href={intel.client.enfoqueTecnicoUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline"><ExternalLink className="h-3 w-3 mr-1" /> Enfoque Técnico</Button>
            </a>
          )}
          <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            <RefreshCcw className={`h-3 w-3 mr-1 ${refresh.isPending ? "animate-spin" : ""}`} /> Refrescar
          </Button>
        </div>
      </div>

      <AddBrainNote client={client} onSaved={() => qc.invalidateQueries({ queryKey: ["client", client.slug, "intel"] })} />

      {/* Va antes que el perfil de video: a quién le hablamos manda sobre qué
          formato usamos, y es lo primero que alguien tiene que poder cargar. */}
      <DecisorCard client={client} />

      <VideoProfile client={client} />

      {intel?.score && (
        <div className="flex gap-2">
          <Card className="p-3 flex-1"><p className="text-xs text-muted-foreground">Salud de pauta</p><p className="text-lg font-semibold tabular-nums">{intel.score.healthScore != null ? `${intel.score.healthScore}/100` : <span className="text-sm font-normal text-muted-foreground">sin pauta corriendo</span>}</p></Card>
          <Card className="p-3 flex-1"><p className="text-xs text-muted-foreground">Score operativo</p><p className="text-lg font-semibold tabular-nums">{intel.score.opsScore != null ? `${intel.score.opsScore}/100` : <span className="text-sm font-normal text-muted-foreground">sin fechas en ClickUp</span>}</p></Card>
        </div>
      )}

      {intelQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando memoria…</p>
      ) : brain.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Sin memoria todavía. Se llena con el Enfoque Técnico (ClickUp) y lo que aprenden los agentes.</Card>
      ) : (
        <div className="space-y-2">
          {brain.map((b) => (
            <Card key={b.id} className="p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                {b.pinned && <Badge variant="outline" className="text-[10px]">📌 fijado</Badge>}
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{b.kind} · {b.key}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{b.content}</p>
              <p className="text-[10px] text-muted-foreground">{new Date(b.updatedAt).toLocaleDateString("es-AR")}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Competidores ────────────────────────────────────────────────────────────
// Per-client competitors. These feed the Ideas engine (differentiation angles).
