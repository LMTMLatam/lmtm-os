// Ficha del cliente, sección partida de pages/ClientDashboard.tsx (rediseño 20/11).
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { clientsApi, type Client, type CalendarItem } from "../../api/clients";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Facebook, Loader2, RefreshCw, ChevronLeft, ChevronRight, Plus } from "lucide-react";

// ── Calendario de contenido ─────────────────────────────────────────────────
// The client's "Redes Sociales" ClickUp list as a monthly calendar. Publish
// date = start_date; target networks = the "Plataformas" custom field. Read
// live from ClickUp on every load, so it's always in sync.

const NETWORK_META: Record<string, { code: string; label: string; cls: string }> = {
  instagram: { code: "IG", label: "Instagram", cls: "bg-pink-500/15 text-pink-600 dark:text-pink-300 border-pink-500/30" },
  facebook: { code: "FB", label: "Facebook", cls: "bg-blue-600/15 text-blue-700 dark:text-blue-300 border-blue-600/30" },
  tiktok: { code: "TT", label: "TikTok", cls: "bg-zinc-700/15 text-zinc-800 dark:text-zinc-200 border-zinc-500/40" },
  youtube: { code: "YT", label: "YouTube", cls: "bg-red-600/15 text-red-600 dark:text-red-300 border-red-600/30" },
  linkedin: { code: "IN", label: "LinkedIn", cls: "bg-sky-700/15 text-sky-700 dark:text-sky-300 border-sky-700/30" },
  whatsapp: { code: "WA", label: "WhatsApp", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30" },
  google: { code: "GG", label: "Google", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30" },
  pinterest: { code: "PIN", label: "Pinterest", cls: "bg-rose-600/15 text-rose-600 dark:text-rose-300 border-rose-600/30" },
  snapchat: { code: "SC", label: "Snapchat", cls: "bg-yellow-400/20 text-yellow-600 dark:text-yellow-300 border-yellow-400/40" },
  reddit: { code: "RD", label: "Reddit", cls: "bg-orange-600/15 text-orange-600 dark:text-orange-300 border-orange-600/30" },
};
function netMeta(n: string) {
  return NETWORK_META[n.trim().toLowerCase()] ?? { code: n.slice(0, 3).toUpperCase(), label: n, cls: "bg-muted text-muted-foreground border-border" };
}
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Community Manager composer: creates the post task in ClickUp with the
// calendar conventions (start_date + Plataformas + format); copy auto-generated
// from gancho/ángulo when left empty. Make publishes it like any other task.
function ComposePost({ client, onCreated }: { client: Client; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [platforms, setPlatforms] = useState<string[]>(["Instagram", "Facebook"]);
  const [format, setFormat] = useState("Reel");
  const [gancho, setGancho] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => clientsApi.composePost(client.slug, { name: name.trim(), date, platforms, format, gancho: gancho.trim() || undefined }),
    onSuccess: (r) => {
      setMsg(r.warnings?.length ? `Creado ✓ pero: ${r.warnings[0]}` : "Posteo creado en ClickUp ✓");
      if (r.url) window.open(r.url, "_blank");
      setName(""); setGancho(""); onCreated();
      setTimeout(() => setMsg(null), r.warnings?.length ? 12000 : 4000);
    },
    onError: (e) => setMsg((e as Error).message),
  });
  const togglePlat = (p: string) =>
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  if (!open) {
    return (
      <span className="inline-flex items-center gap-2">
        <button onClick={() => setOpen(true)} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1">
          <Plus className="h-3 w-3" /> Nuevo posteo
        </button>
        {msg && <span className="text-[10px] text-muted-foreground">{msg}</span>}
      </span>
    );
  }
  return (
    <Card className="p-3 w-full space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder="Nombre del posteo…" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm flex-1 min-w-[200px]" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="h-8 rounded-md border border-border bg-transparent px-2 text-sm" />
        <select value={format} onChange={(e) => setFormat(e.target.value)}
          className="h-8 rounded-md border border-border bg-transparent px-2 text-sm">
          {["Reel", "Carrusel", "Post", "Story", "Photo Post", "Clip corto"].map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {["Instagram", "Facebook", "Tiktok", "YouTube", "LinkedIn", "WhatsApp"].map((p) => (
          <button key={p} onClick={() => togglePlat(p)}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition ${platforms.includes(p) ? "border-violet-500/60 bg-violet-500/10 text-violet-600 dark:text-violet-300" : "border-border text-muted-foreground hover:bg-muted"}`}>
            {p}
          </button>
        ))}
      </div>
      <Input placeholder="Gancho (opcional — la IA genera el copy a partir de esto)" value={gancho} onChange={(e) => setGancho(e.target.value)} className="h-8 text-sm" />
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8" disabled={!name.trim() || platforms.length === 0 || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Crear en ClickUp
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)}>Cancelar</Button>
        {msg && <span className="text-[10px] text-muted-foreground">{msg}</span>}
        <span className="text-[10px] text-muted-foreground ml-auto">Se crea con fecha + plataformas; Make lo publica como siempre.</span>
      </div>
    </Card>
  );
}

export function CalendarTab({ client }: { client: Client }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  // Auto-sync: fresh read on tab enter + window focus, and re-read every 60s
  // while open. No manual sync button — ClickUp is the source of truth.
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["content-calendar", client.slug, month],
    queryFn: () => clientsApi.contentCalendar(client.slug, month),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const items = data?.items ?? [];

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const k = dayKey(it.date);
      const arr = m.get(k);
      if (arr) arr.push(it); else m.set(k, [it]);
    }
    return m;
  }, [items]);

  const [y, mo] = month.split("-").map(Number);
  const first = new Date(y, mo - 1, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(y, mo, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, mo - 1, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) => {
    const nd = new Date(y, mo - 1 + delta, 1);
    setMonth(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}`);
  };
  const monthLabel = first.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const todayKey = dayKey(new Date().toISOString());
  const withNet = items.filter((i) => i.networks.length > 0).length;

  return (
    <div className="space-y-4">
      {/* Header: month nav + counts */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-md border border-border hover:bg-muted" title="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium capitalize min-w-[9rem] text-center">{monthLabel}</span>
          <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-md border border-border hover:bg-muted" title="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <button onClick={() => setMonth(new Date().toISOString().slice(0, 7))} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted">Hoy</button>
        <ComposePost client={client} onCreated={() => refetch()} />
        <span className="text-xs text-muted-foreground ml-auto inline-flex items-center gap-1.5">
          {isFetching && <span title="Sincronizando con ClickUp…"><RefreshCw className="h-3 w-3 animate-spin" /></span>}
          {items.length} post{items.length === 1 ? "" : "s"} con fecha · {withNet} con red
        </span>
      </div>

      {isLoading && <Skeleton className="h-96 w-full" />}
      {isError && <Card className="p-4 border-destructive/20 bg-destructive/5 text-sm text-destructive">No se pudo leer ClickUp: {(error as Error).message}</Card>}

      {data && !data.hasRedesList && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="mt-3">Este cliente no tiene la lista <strong>Redes Sociales</strong> mapeada en ClickUp todavía.</p>
        </Card>
      )}

      {data?.hasRedesList && (
        <>
          <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden border border-border bg-border">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="bg-muted/50 text-[10px] font-medium text-muted-foreground text-center py-1.5 uppercase tracking-wide">{w}</div>
            ))}
            {cells.map((date, i) => {
              const key = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : `empty-${i}`;
              const posts = date ? (byDay.get(key) ?? []) : [];
              const isToday = date && key === todayKey;
              return (
                <div key={key} className={`bg-card min-h-[92px] p-1.5 ${date ? "" : "bg-muted/20"}`}>
                  {date && (
                    <>
                      <div className={`text-[11px] mb-1 ${isToday ? "font-bold text-violet-500" : "text-muted-foreground"}`}>{date.getDate()}</div>
                      <div className="space-y-1">
                        {posts.slice(0, 4).map((p) => (
                          <a key={p.id} href={p.url ?? undefined} target="_blank" rel="noreferrer noopener"
                            title={`${p.name}${p.format ? ` · ${p.format}` : ""}${p.networks.length ? ` · ${p.networks.join(", ")}` : ""} · ${p.status}`}
                            className={`block rounded border px-1 py-0.5 hover:brightness-110 transition ${p.published ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-muted/40"}`}>
                            <div className="flex items-center gap-0.5 flex-wrap">
                              {p.networks.length > 0 ? p.networks.map((n) => {
                                const meta = netMeta(n);
                                return <span key={n} className={`text-[8px] font-bold leading-none px-1 py-0.5 rounded border ${meta.cls}`} title={meta.label}>{meta.code}</span>;
                              }) : <span className="text-[8px] text-muted-foreground/60 px-0.5">— sin red</span>}
                            </div>
                            <div className="text-[9px] text-foreground/80 truncate mt-0.5">{p.name}</div>
                          </a>
                        ))}
                        {posts.length > 4 && <div className="text-[9px] text-muted-foreground pl-0.5">+{posts.length - 4} más</div>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
            <span>Redes:</span>
            {["instagram", "facebook", "tiktok", "youtube", "linkedin", "whatsapp"].map((n) => {
              const m = netMeta(n);
              return <span key={n} className={`font-bold px-1 py-0.5 rounded border ${m.cls}`}>{m.code} {m.label}</span>;
            })}
            <span className="ml-2">·</span>
            <span className="px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/5">publicado (etiqueta &quot;mandado a make&quot;)</span>
          </div>

          <p className="text-[11px] text-muted-foreground">
            La fecha sale de <strong>Fecha de inicio</strong> (cuándo se dispara a Make) y las redes del campo <strong>Plataformas</strong> en ClickUp. Un post cuenta como <strong>publicado</strong> cuando tiene la etiqueta <strong>&quot;mandado a make&quot;</strong> (o &quot;enviado a make&quot;). Los posteos sin fecha de inicio no aparecen en el calendario.
          </p>
        </>
      )}
    </div>
  );
}

// ── Baúl de Ganchos ─────────────────────────────────────────────────────────
// Reusable hook vault: the client's hooks + global hooks of its niche. Fed by
// the agents (top own posts, competitor reels, trends) and manual saves.
// "Usar" copies the hook and bumps its counter so proven hooks rank first.

