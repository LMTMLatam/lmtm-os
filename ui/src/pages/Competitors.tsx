import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { clientsApi, type Client, type Competitor, type ContentIdea } from "../api/clients";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Swords, Plus, Trash2, Sparkles, Download, Megaphone, Share2 } from "lucide-react";

export function Competitors() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const qc = useQueryClient();
  const [slug, setSlug] = useState<string>("");
  const [form, setForm] = useState({ name: "", fbPageUrl: "", notes: "", sampleAds: "" });

  useEffect(() => { setBreadcrumbs([{ label: "Competencia y Contenido" }]); }, [setBreadcrumbs]);

  const clientsQuery = useQuery({ queryKey: ["clients", "list", "active"], queryFn: () => clientsApi.list("active") });
  const clients: Client[] = clientsQuery.data?.clients ?? [];
  useEffect(() => { if (!slug && clients[0]) setSlug(clients[0].slug); }, [clients, slug]);

  const compQuery = useQuery({ queryKey: ["competitors", slug], queryFn: () => clientsApi.listCompetitors(slug), enabled: !!slug });
  const ideasQuery = useQuery({ queryKey: ["content-ideas", slug], queryFn: () => clientsApi.listContentIdeas(slug), enabled: !!slug });
  const competitors: Competitor[] = compQuery.data?.competitors ?? [];
  const ideas: ContentIdea[] = ideasQuery.data?.ideas ?? [];
  const pauta = ideas.filter((i) => i.kind === "pauta");
  const posteo = ideas.filter((i) => i.kind === "posteo");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["competitors", slug] });
    qc.invalidateQueries({ queryKey: ["content-ideas", slug] });
  };
  const mAdd = useMutation({
    mutationFn: () => clientsApi.addCompetitor(slug, {
      name: form.name.trim(),
      fbPageUrl: form.fbPageUrl.trim() || null,
      notes: form.notes.trim() || null,
      sampleAds: form.sampleAds.trim() ? form.sampleAds.split("\n").map((t) => ({ text: t.trim() })).filter((a) => a.text) : [],
    }),
    onSuccess: () => { setForm({ name: "", fbPageUrl: "", notes: "", sampleAds: "" }); invalidate(); },
  });
  const mDel = useMutation({ mutationFn: (cid: string) => clientsApi.deleteCompetitor(slug, cid), onSuccess: invalidate });
  const mGen = useMutation({ mutationFn: () => clientsApi.generateContent(slug), onSuccess: invalidate });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Swords className="h-6 w-6 text-violet-500" /> Competencia y Contenido
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cargá la competencia de cada cliente y generá contenido separado en pauta y posteo.
          </p>
        </div>
        <select value={slug} onChange={(e) => setSlug(e.target.value)} className="h-9 px-3 rounded-md border border-border bg-background text-sm min-w-[200px]">
          {clients.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
      </div>

      {/* Competitors */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3"><Swords className="h-4 w-4" /><h2 className="font-medium">Competidores</h2></div>
        {competitors.length === 0
          ? <p className="text-sm text-muted-foreground mb-3">Sin competidores cargados todavía.</p>
          : (
            <div className="space-y-2 mb-4">
              {competitors.map((c) => (
                <div key={c.id} className="flex items-start gap-2 border-b border-border/60 pb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{c.name}</p>
                    {c.fbPageUrl && <a href={c.fbPageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-500 break-all">{c.fbPageUrl}</a>}
                    {c.notes && <p className="text-xs text-muted-foreground mt-0.5">{c.notes}</p>}
                    {c.sampleAds.length > 0 && <p className="text-[11px] text-muted-foreground mt-0.5">{c.sampleAds.length} anuncio(s) observado(s)</p>}
                  </div>
                  <button onClick={() => mDel.mutate(c.id)} className="text-muted-foreground hover:text-rose-500 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        {/* Add form */}
        <div className="grid grid-cols-2 gap-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre del competidor *" className="h-9 px-3 rounded-md border border-border bg-background text-sm" />
          <input value={form.fbPageUrl} onChange={(e) => setForm({ ...form, fbPageUrl: e.target.value })} placeholder="URL de su página/Ads Library" className="h-9 px-3 rounded-md border border-border bg-background text-sm" />
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notas (qué hacen bien, su ángulo…)" className="h-9 px-3 rounded-md border border-border bg-background text-sm col-span-2" />
          <textarea value={form.sampleAds} onChange={(e) => setForm({ ...form, sampleAds: e.target.value })} placeholder="Anuncios/copys observados (uno por línea) — opcional" rows={2} className="px-3 py-2 rounded-md border border-border bg-background text-sm col-span-2 resize-y" />
        </div>
        <button onClick={() => mAdd.mutate()} disabled={!form.name.trim() || mAdd.isPending || !slug} className="mt-2 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" />Agregar competidor
        </button>
      </Card>

      {/* Generate */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => mGen.mutate()} disabled={mGen.isPending || !slug} className="text-sm px-4 py-2 rounded-md bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4" />{mGen.isPending ? "Generando…" : "Generar contenido (pauta + posteo)"}
        </button>
        {ideas.length > 0 && (
          <a href={clientsApi.contentCsvUrl(slug)} className="text-sm px-3 py-2 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1.5">
            <Download className="h-4 w-4" />Exportar planilla (CSV)
          </a>
        )}
      </div>

      {/* Generated content split */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3"><Megaphone className="h-4 w-4 text-amber-500" /><h2 className="font-medium">Contenido de Pauta</h2><Badge className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300">{pauta.length}</Badge></div>
          {pauta.length === 0 ? <p className="text-sm text-muted-foreground">Sin ideas todavía.</p> : (
            <div className="space-y-3">
              {pauta.map((i) => (
                <div key={i.id} className="border-l-2 border-amber-400 pl-3">
                  <div className="flex items-center gap-2"><span className="text-sm font-medium">{i.title}</span>{i.format && <Badge className="text-[10px] px-1.5 py-0 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">{i.format}</Badge>}</div>
                  {i.copy && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{i.copy}</p>}
                  {i.rationale && <p className="text-[11px] text-muted-foreground/80 mt-0.5 italic">{i.rationale}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3"><Share2 className="h-4 w-4 text-emerald-500" /><h2 className="font-medium">Contenido de Posteo</h2><Badge className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">{posteo.length}</Badge></div>
          {posteo.length === 0 ? <p className="text-sm text-muted-foreground">Sin ideas todavía.</p> : (
            <div className="space-y-3">
              {posteo.map((i) => (
                <div key={i.id} className="border-l-2 border-emerald-400 pl-3">
                  <div className="flex items-center gap-2"><span className="text-sm font-medium">{i.title}</span>{i.format && <Badge className="text-[10px] px-1.5 py-0 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">{i.format}</Badge>}</div>
                  {i.copy && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{i.copy}</p>}
                  {i.rationale && <p className="text-[11px] text-muted-foreground/80 mt-0.5 italic">{i.rationale}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
