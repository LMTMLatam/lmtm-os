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
import { nichesApi, VIDEO_TIPOS, VIDEO_CONCEPTOS, type NicheIntel } from "../api/niches";
import { clientsApi, type Client } from "../api/clients";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, Trophy, FlaskConical, Swords, Lightbulb, Briefcase, Loader2, X, Settings2, Check, Pencil, Search, TrendingUp, TrendingDown, Minus, Megaphone, ListChecks, Sparkles, Film, Tag } from "lucide-react";

/** Una referencia de video con sus etiquetas editables (tipo + concepto).
 * Click en una etiqueta estándar la agrega/quita; guarda al instante. */
function VideoRefRow({ nicheKey, r }: { nicheKey: string; r: NicheIntel["videoReferences"][number] }) {
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

function fmtMoney(n: number): string {
  return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)}`;
}
const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;

/** Big metric with its achievable target ("ideal" = best quartile of the
 * niche's own clients) and a green/red delta vs that target. */
function MetricCard({ label, value, ideal, higherIsBetter, hint }: {
  label: string; value: string; ideal?: string | null; higherIsBetter?: boolean;
  hint?: "good" | "bad" | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tracking-tight flex items-center gap-1.5">
        {value}
        {hint === "good" && (higherIsBetter ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />)}
        {hint === "bad" && (higherIsBetter ? <TrendingDown className="h-3.5 w-3.5 text-red-500" /> : <TrendingUp className="h-3.5 w-3.5 text-red-500" />)}
      </div>
      {ideal && <div className="text-[11px] text-muted-foreground mt-0.5">meta alcanzable: <span className="font-medium text-foreground/80">{ideal}</span></div>}
    </div>
  );
}

/** Semáforo of one client vs the niche's achievable ideal. */
function ClientVsIdeal({ c, idealCtr, idealCpl }: {
  c: NicheIntel["clients"][number]; idealCtr?: number; idealCpl?: number;
}) {
  const a = c.ads30d;
  const ctrOk = a && idealCtr != null ? a.ctr >= idealCtr : null;
  const cplOk = a?.cpl != null && idealCpl != null ? a.cpl <= idealCpl : null;
  const dot = (ok: boolean | null) =>
    ok === null ? <Minus className="h-3 w-3 text-muted-foreground/50" />
      : ok ? <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
      : <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />;
  return (
    <div className="flex items-center gap-2 text-xs py-1">
      <Link to={`/c/${c.slug}`} className="w-40 shrink-0 truncate hover:underline" title={c.name}>{c.name}</Link>
      {a && a.impressions > 0 ? (
        <>
          <span className="w-24 text-muted-foreground">{fmtMoney(a.spend)}</span>
          <span className="w-16 text-muted-foreground">{a.leads} leads</span>
          <span className="w-24 inline-flex items-center gap-1.5">{dot(ctrOk)} CTR {fmtPct(a.ctr)}</span>
          <span className="w-28 inline-flex items-center gap-1.5">{dot(cplOk)} {a.cpl != null ? `CPL ${fmtMoney(a.cpl)}` : "sin leads"}</span>
        </>
      ) : (
        <span className="text-muted-foreground/60">sin pauta activa en 30d</span>
      )}
    </div>
  );
}

function NicheCard({ n }: { n: NicheIntel }) {
  const [kit, setKit] = useState<string | null>(null);
  const gen = useMutation({
    mutationFn: () => nichesApi.salesKit(n.niche),
    onSuccess: (d) => setKit(d.onePager),
  });

  const ev = n.benchmark?.evidence ?? null;
  const idealCtr = ev?.idealCtr;
  const idealCpl = ev?.idealCpl;
  const fmtOrg = n.winningFormat?.evidence?.topFormat ?? null;
  const fmtAds = n.winningFormatAds?.evidence?.ranked?.[0] ?? null;
  const withAds = n.clients.filter((c) => c.ads30d && c.ads30d.impressions > 0);
  const ideas = [
    ...n.hooks.map((h) => ({ kind: "gancho" as const, text: h.text, meta: h.format })),
    ...n.trends.map((t) => ({ kind: "tendencia" as const, text: t.title, meta: t.tag })),
  ].slice(0, 4);

  return (
    <Card className="p-5 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-semibold text-base">{n.niche}</h2>
        <Badge className="text-[10px] px-1.5 py-0 bg-violet-500/10 text-violet-700 dark:text-violet-300">
          {n.clients.length} cliente{n.clients.length === 1 ? "" : "s"}
        </Badge>
        <button onClick={() => gen.mutate()} disabled={gen.isPending}
          className="text-[11px] px-2 py-0.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1 ml-auto">
          {gen.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Briefcase className="h-3 w-3" />}
          Kit de venta
        </button>
      </div>

      {kit && (
        <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 relative">
          <button onClick={() => setKit(null)} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-violet-500"><Briefcase className="h-3.5 w-3.5" />One-pager de venta — {n.niche}</div>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">{kit}</pre>
        </div>
      )}

      {/* ── Métricas 30d con meta alcanzable (mejor cuartil del nicho) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MetricCard label="Inversión 30d" value={fmtMoney(n.ads30d.spend)} />
        <MetricCard label="Leads 30d" value={String(n.ads30d.leads)} />
        <MetricCard label="CTR" value={fmtPct(n.ads30d.ctr)}
          ideal={idealCtr != null ? fmtPct(idealCtr) : null} higherIsBetter
          hint={idealCtr != null ? (n.ads30d.ctr >= idealCtr ? "good" : "bad") : null} />
        <MetricCard label="CPL" value={n.ads30d.cpl != null ? fmtMoney(n.ads30d.cpl) : "—"}
          ideal={idealCpl != null ? fmtMoney(idealCpl) : null}
          hint={n.ads30d.cpl != null && idealCpl != null ? (n.ads30d.cpl <= idealCpl ? "good" : "bad") : null} />
      </div>

      {/* ── Acciones a tomar (plan minado a diario) ── */}
      {n.actions.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium mb-2"><ListChecks className="h-3.5 w-3.5 text-violet-500" />Acciones a tomar</div>
          <div className="space-y-1.5">
            {n.actions.map((a, i) => (
              <div key={i} className="text-xs flex items-start gap-2">
                {a.kind === "idea" ? (
                  <Badge className="text-[9px] px-1.5 py-0 shrink-0 mt-0.5 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 inline-flex items-center gap-0.5"><Sparkles className="h-2.5 w-2.5" />idea</Badge>
                ) : (
                  <Badge className={`text-[9px] px-1.5 py-0 shrink-0 mt-0.5 ${
                    a.priority === 1 ? "bg-red-500/10 text-red-700 dark:text-red-300"
                      : a.priority === 2 ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300"}`}>
                    {a.priority === 1 ? "urgente" : a.priority === 2 ? "mejora" : "sumar"}
                  </Badge>
                )}
                <span className="text-muted-foreground leading-relaxed">
                  {a.action}
                  {a.clientSlug && <Link to={`/c/${a.clientSlug}`} className="ml-1 text-violet-500 hover:underline">ver cliente →</Link>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Qué funcionó mejor ── */}
      <div>
        <div className="flex items-center gap-1.5 text-xs font-medium mb-2"><Trophy className="h-3.5 w-3.5 text-amber-500" />Qué funcionó mejor</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {fmtOrg && <Badge className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Orgánico: {fmtOrg}</Badge>}
          {fmtAds && <Badge className="text-[10px] bg-sky-500/10 text-sky-700 dark:text-sky-300">Ads: {fmtAds.format} (CTR {fmtPct(fmtAds.ctr)})</Badge>}
          {!fmtOrg && !fmtAds && <span className="text-xs text-muted-foreground">Sin datos suficientes todavía — se mina a diario.</span>}
        </div>
        {n.topCampaigns.length > 0 && (
          <div className="space-y-1">
            {n.topCampaigns.map((c, i) => (
              <div key={i} className="text-xs flex items-center gap-2">
                <Megaphone className="h-3 w-3 text-sky-500 shrink-0" />
                <span className="truncate text-muted-foreground" title={c.name}>{c.name}</span>
                <span className="text-[10px] text-muted-foreground/70 ml-auto shrink-0">
                  {c.clientName} · CTR {fmtPct(c.ctr)}{c.cpl != null ? ` · CPL ${fmtMoney(c.cpl)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
        {n.topContent.length > 0 && (
          <div className="space-y-1 mt-1.5">
            {n.topContent.slice(0, 3).map((t, i) => (
              <div key={i} className="text-xs flex items-center gap-2">
                <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">{t.format ?? "post"}</Badge>
                <span className="truncate text-muted-foreground">{t.title ?? "(sin título)"}</span>
                <span className="text-[10px] text-muted-foreground/70 ml-auto shrink-0">{t.clientName} · {Math.round(t.score)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Ideas para replicar ── */}
      <div>
        <div className="flex items-center gap-1.5 text-xs font-medium mb-2"><Lightbulb className="h-3.5 w-3.5 text-yellow-500" />Ideas para replicar</div>
        <div className="space-y-1">
          {n.experiment && (
            <div className="text-xs flex items-start gap-2">
              <FlaskConical className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
              <span className="text-muted-foreground leading-relaxed">{n.experiment.pattern}</span>
            </div>
          )}
          {ideas.map((idea, i) => (
            <div key={i} className="text-xs flex items-start gap-2">
              <Lightbulb className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />
              <span className="text-muted-foreground leading-relaxed">{idea.text}</span>
              <Badge className="text-[9px] px-1 py-0 shrink-0 bg-zinc-500/10 text-zinc-500 ml-auto">{idea.kind}{idea.meta ? ` · ${idea.meta}` : ""}</Badge>
            </div>
          ))}
          {!n.experiment && ideas.length === 0 && (
            <span className="text-xs text-muted-foreground">Todavía sin ganchos ni tendencias para este nicho — los agentes los cargan solos.</span>
          )}
        </div>
      </div>

      {/* ── Clientes vs meta del nicho (semáforo) ── */}
      <div>
        <div className="text-xs font-medium mb-1.5">
          Clientes vs meta del nicho
          {idealCtr != null && <span className="text-muted-foreground font-normal"> — verde = ya alcanza la meta, rojo = hay margen</span>}
        </div>
        <div className="divide-y divide-border/50">
          {[...withAds, ...n.clients.filter((c) => !c.ads30d || c.ads30d.impressions === 0)].map((c) => (
            <ClientVsIdeal key={c.id} c={c} idealCtr={idealCtr ?? undefined} idealCpl={idealCpl ?? undefined} />
          ))}
        </div>
      </div>

      {/* ── Perfil de videos del nicho (referencias etiquetables) ── */}
      {n.videoReferences.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5">
            <Film className="h-3.5 w-3.5 text-violet-500" />Perfil de videos del nicho
            <span className="text-muted-foreground font-normal">— etiquetá tipo (Blanda/VSL/Comercial/Engagement) y concepto (Cinemático, UGC…): guía al agente al crear contenido</span>
          </div>
          <div className="divide-y divide-border/40">
            {n.videoReferences.map((r) => <VideoRefRow key={r.id} nicheKey={n.niche} r={r} />)}
          </div>
        </div>
      )}

      {/* ── Competidores (secundario) ── */}
      {n.competitors.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground inline-flex items-center gap-1.5"><Swords className="h-3 w-3" />Competidores del nicho ({n.competitors.length})</summary>
          <div className="flex flex-wrap gap-1 mt-2">
            {n.competitors.map((c, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground" title={`Competidor de ${c.clientName}`}>{c.name}</span>
            ))}
          </div>
        </details>
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
