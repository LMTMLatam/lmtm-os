// LMTM: lo que se edita en Nichos (movido de pages/Niches.tsx el 7/10, cuando
// la pantalla pasó a la app nueva): etiquetar referencias de video y ordenar
// rubros (renombrar un rubro en todos sus clientes, asignar el de cada cliente).

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nichesApi, VIDEO_TIPOS, VIDEO_CONCEPTOS, type NicheIntel } from "../api/niches";
import { clientsApi, type Client } from "../api/clients";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Film, Loader2, Pencil, Search, Settings2, Tag, X } from "lucide-react";

/** Una referencia de video con sus etiquetas editables (tipo + concepto).
 * Click en una etiqueta estándar la agrega/quita; guarda al instante. */
export function VideoRefRow({ nicheKey, r }: { nicheKey: string; r: NicheIntel["videoReferences"][number] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const toggle = async (tag: string) => {
    const next = r.categorias.includes(tag) ? r.categorias.filter((c) => c !== tag) : [...r.categorias, tag];
    setSaving(true);
    try {
      await nichesApi.tagVideoReference(r.id, next);
      await qc.invalidateQueries({ queryKey: ["niches"] });
    } finally { setSaving(false); }
  };
  const STD = [...VIDEO_TIPOS, ...VIDEO_CONCEPTOS] as readonly string[];
  return (
    <div className="text-xs py-1" key={nicheKey + r.id}>
      <div className="flex items-center gap-2">
        <img src={`/api/growth/video-thumb?url=${encodeURIComponent(r.url)}`} alt="" loading="lazy"
          className="h-9 w-14 rounded object-cover bg-muted/50 shrink-0 border border-border"
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
        <Film className="h-3 w-3 text-violet-400 shrink-0" />
        <a href={r.url} target="_blank" rel="noreferrer noopener" className="truncate text-muted-foreground hover:underline max-w-[16rem]" title={r.comentario ?? r.url}>{r.url.replace(/^https?:\/\/(www\.)?/, "")}</a>
        <span className="text-[10px] text-muted-foreground/60 shrink-0">{r.clientName}</span>
        <span className="flex flex-wrap gap-1 ml-auto items-center">
          {r.categorias.map((c) => (
            <Badge key={c} className="text-[9px] px-1.5 py-0 bg-violet-500/10 text-violet-700 dark:text-violet-300">{c}</Badge>
          ))}
          {r.categorias.length === 0 && <span className="text-[9px] text-amber-500">sin etiquetar</span>}
          <button onClick={() => setEditing((v) => !v)} className="text-muted-foreground hover:text-foreground" title="Etiquetar (tipo + concepto)">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Tag className="h-3 w-3" />}
          </button>
        </span>
      </div>
      {editing && (
        <div className="mt-1.5 ml-5 flex flex-wrap gap-1 items-center">
          <span className="text-[9px] text-muted-foreground mr-0.5">Tipo:</span>
          {VIDEO_TIPOS.map((t) => (
            <button key={t} onClick={() => toggle(t)}
              className={`text-[9px] px-1.5 py-0.5 rounded border transition ${r.categorias.includes(t) ? "border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300" : "border-border text-muted-foreground hover:bg-muted"}`}>
              {t}
            </button>
          ))}
          <span className="text-[9px] text-muted-foreground ml-1.5 mr-0.5">Concepto:</span>
          {VIDEO_CONCEPTOS.map((t) => (
            <button key={t} onClick={() => toggle(t)}
              className={`text-[9px] px-1.5 py-0.5 rounded border transition ${r.categorias.includes(t) ? "border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300" : "border-border text-muted-foreground hover:bg-muted"}`}>
              {t}
            </button>
          ))}
          {r.categorias.filter((c) => !STD.includes(c)).map((c) => (
            <button key={c} onClick={() => toggle(c)} title="Etiqueta libre (click para quitar)"
              className="text-[9px] px-1.5 py-0.5 rounded border border-zinc-500/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">
              {c} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// One client row: its niche is a free-text field with a datalist of the
// niches already in use — pick an existing one or type a new one (that's how a
// niche gets "created"). Saves on blur/Enter only when it actually changed.
function ClientNicheRow({ client, onSaved }: { client: Client; onSaved: () => void }) {
  const [value, setValue] = useState(client.industry ?? "");
  useEffect(() => { setValue(client.industry ?? ""); }, [client.industry]);
  const save = useMutation({
    mutationFn: () => clientsApi.setNiche(client.slug, value.trim()),
    onSuccess: onSaved,
  });
  const dirty = value.trim() !== (client.industry ?? "");
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Link to={`/clientes/${client.slug}`} className="text-xs w-44 shrink-0 truncate hover:underline" title={client.name}>{client.name}</Link>
      <input
        list="niche-options"
        value={value}
        placeholder="Sin nicho"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && dirty) save.mutate(); }}
        onBlur={() => { if (dirty) save.mutate(); }}
        className="flex-1 h-7 rounded-md border border-border bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500/40"
      />
      <span className="w-4 shrink-0 text-center">
        {save.isPending ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          : save.isSuccess && !dirty ? <Check className="h-3 w-3 text-emerald-500" />
          : dirty ? <span className="text-[9px] text-amber-500">•</span> : null}
      </span>
    </div>
  );
}

// Inline rename for an existing niche — renames it across ALL its clients.
function NicheRenameChip({ niche, count, onDone }: { niche: string; count: number; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [to, setTo] = useState(niche);
  const rename = useMutation({
    mutationFn: () => nichesApi.rename(niche, to.trim()),
    onSuccess: () => { setEditing(false); onDone(); },
  });
  if (!editing) {
    return (
      <button onClick={() => { setTo(niche); setEditing(true); }}
        className="text-[11px] px-2 py-0.5 rounded-full border border-border hover:bg-muted inline-flex items-center gap-1"
        title="Renombrar este nicho en todos sus clientes">
        {niche} <span className="text-muted-foreground/60">{count}</span> <Pencil className="h-2.5 w-2.5 opacity-50" />
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Input value={to} onChange={(e) => setTo(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") rename.mutate(); if (e.key === "Escape") setEditing(false); }}
        className="h-7 w-40 text-xs" />
      <button onClick={() => rename.mutate()} disabled={rename.isPending || !to.trim()}
        className="text-emerald-600 disabled:opacity-40" title="Aplicar a los clientes del nicho">
        {rename.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button onClick={() => setEditing(false)} className="text-muted-foreground" title="Cancelar"><X className="h-3.5 w-3.5" /></button>
    </span>
  );
}

export function NicheManager() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["niche-manager", "clients"], queryFn: () => clientsApi.list() });
  const clients = data?.clients ?? [];

  const options = useMemo(
    () => [...new Set(clients.map((c) => c.industry?.trim()).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b)),
    [clients],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clients) { const n = c.industry?.trim(); if (n) m.set(n, (m.get(n) ?? 0) + 1); }
    return m;
  }, [clients]);
  const unassigned = clients.filter((c) => !c.industry?.trim()).length;

  const refresh = () => { void qc.invalidateQueries({ queryKey: ["niche-manager", "clients"] }); void qc.invalidateQueries({ queryKey: ["niches"] }); };

  const filtered = useMemo(() => {
    const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
    if (!q.trim()) return sorted;
    const needle = q.toLowerCase();
    return sorted.filter((c) => c.name.toLowerCase().includes(needle) || (c.industry ?? "").toLowerCase().includes(needle));
  }, [clients, q]);

  return (
    <Card className="p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 w-full text-left">
        <Settings2 className="h-4 w-4 text-violet-500" />
        <span className="font-medium text-sm">Gestión de nichos</span>
        <span className="text-xs text-muted-foreground">
          {options.length} nicho{options.length === 1 ? "" : "s"} · {clients.length} clientes{unassigned > 0 ? ` · ${unassigned} sin asignar` : ""}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{open ? "Ocultar" : "Editar"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {isLoading && <Skeleton className="h-32 w-full" />}
          {!isLoading && (
            <>
              {options.length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1.5">Nichos existentes (clic para renombrar en todos sus clientes):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {options.map((n) => <NicheRenameChip key={n} niche={n} count={counts.get(n) ?? 0} onDone={refresh} />)}
                  </div>
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 h-8 text-sm" />
              </div>

              {/* Native datalist shared by every row's input. */}
              <datalist id="niche-options">{options.map((n) => <option key={n} value={n} />)}</datalist>

              <div className="divide-y divide-border/60 max-h-[28rem] overflow-y-auto pr-1">
                {filtered.map((c) => <ClientNicheRow key={c.id} client={c} onSaved={refresh} />)}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
