// LMTM-OS: per-niche intelligence panel.
//
// One card per niche: aggregated 30d ads performance, the mined benchmark
// (average vs best-quartile "ideal"), the winning content format, the
// suggested cross-niche experiment, top content and the competitor landscape.
// Reads the same learning-engine output the agents consume via
// lmtmGetNicheIntel — one source of truth for humans and agents.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { nichesApi, type NicheIntel } from "../api/niches";
import { clientsApi, type Client } from "../api/clients";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, Target, Trophy, FlaskConical, Swords, FileText, Briefcase, Loader2, X, Settings2, Check, Pencil, Search } from "lucide-react";

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
          <p className="text-xs text-muted-foreground leading-relaxed"><span className="font-medium text-foreground/70">Orgánico:</span> {n.winningFormat?.pattern ?? "sin datos suficientes todavía."}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1"><span className="font-medium text-foreground/70">Ads:</span> {n.winningFormatAds?.pattern ?? "sin datos suficientes todavía (se mina a diario)."}</p>
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
      <Link to={`/c/${client.slug}`} className="text-xs w-44 shrink-0 truncate hover:underline" title={client.name}>{client.name}</Link>
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

function NicheManager() {
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

      <NicheManager />

      {isLoading && <Skeleton className="h-48 w-full" />}
      {data && data.niches.length === 0 && <p className="text-sm text-muted-foreground">Sin nichos con clientes clasificados todavía.</p>}
      {data?.niches.map((n) => <NicheCard key={n.niche} n={n} />)}
    </div>
  );
}
