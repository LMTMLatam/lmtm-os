import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import {
  clientsApi,
  type Client,
  type ClientAdsSummary,
  type ClientCampaignsResponse,
  type ContentIdea,
  type CalendarItem,
  type Hook,
  type Trend,
} from "../api/clients";
import { PaidMediaDashboard } from "./PaidMediaDashboard";
import { queryKeys } from "../lib/queryKeys";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2,
  ExternalLink,
  Globe,
  Mail,
  Phone,
  TrendingUp,
  Target,
  DollarSign,
  Activity,
  Search as SearchIcon,
  Users,
  BarChart3,
  AlertCircle,
  Calendar,
  Briefcase,
  Facebook,
  CheckCircle2,
  RefreshCcw,
  Link2,
  Eye,
  MousePointerClick,
  Megaphone,
  Download,
  Play,
  Loader2,
  ArrowDown,
  Layers,
  MessageSquare,
  ListTodo,
  Clock,
  Lightbulb,
  RefreshCw,
  FolderKanban,
  FileSpreadsheet,
  Clapperboard,
  Code2,
  ChevronLeft,
  ChevronRight,
  Anchor,
  Pin,
  Copy,
  Trash2,
  Plus,
} from "lucide-react";
import { waBotApi } from "../api/waBot";

type Tab = "tasks" | "calendario" | "dashboard" | "ideas" | "ganchos" | "tendencias" | "memoria" | "competidores";

const TABS: Array<{ value: Tab; label: string; icon: typeof TrendingUp }> = [
  { value: "tasks", label: "Tareas", icon: ListTodo },
  { value: "calendario", label: "Calendario", icon: Calendar },
  { value: "dashboard", label: "Dashboard", icon: BarChart3 },
  { value: "ideas", label: "Ideas de posteos", icon: Lightbulb },
  { value: "ganchos", label: "Ganchos", icon: Anchor },
  { value: "tendencias", label: "Tendencias", icon: TrendingUp },
  { value: "memoria", label: "Memoria", icon: Layers },
  { value: "competidores", label: "Competidores", icon: Target },
];

/** Quick-access cards to a client's key external resources: ClickUp folder,
 * redes sheet (Cronopost), video-production list, and redes Apps Script. */
function ClientResourcesPanel({ client }: { client: Client }) {
  const teamId = (client.metadata?.clickupTeamId as string | undefined) || "9013352440";
  const scriptId = client.metadata?.redesScriptId as string | undefined;
  const produccionSheetId = client.metadata?.produccionSheetId as string | undefined;
  const cards: Array<{ title: string; subtitle: string; icon: typeof FolderKanban; url: string | null; color: string }> = [
    {
      title: "Carpeta ClickUp",
      subtitle: "Tareas y listas",
      icon: FolderKanban,
      url: client.clickupFolderId ? `https://app.clickup.com/${teamId}/v/f/${client.clickupFolderId}` : null,
      color: "text-violet-600 dark:text-violet-400",
    },
    {
      title: "Sheet de redes",
      subtitle: "Cronopost / calendario",
      icon: FileSpreadsheet,
      url: client.sheetsSpreadsheetId ? `https://docs.google.com/spreadsheets/d/${client.sheetsSpreadsheetId}/edit` : null,
      color: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Producción de video",
      subtitle: "Sheet de producción",
      icon: Clapperboard,
      url: produccionSheetId ? `https://docs.google.com/spreadsheets/d/${produccionSheetId}/edit` : null,
      color: "text-amber-600 dark:text-amber-400",
    },
    {
      title: "Script de redes",
      subtitle: "Apps Script",
      icon: Code2,
      url: scriptId ? `https://script.google.com/d/${scriptId}/edit` : null,
      color: "text-sky-600 dark:text-sky-400",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        const inner = (
          <Card className={`flex items-center gap-3 p-3 transition-colors ${c.url ? "hover:bg-accent/50 cursor-pointer" : "opacity-50"}`}>
            <div className={`shrink-0 ${c.color}`}><Icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight flex items-center gap-1">
                {c.title}
                {c.url ? <ExternalLink className="h-3 w-3 text-muted-foreground" /> : null}
              </p>
              <p className="text-xs text-muted-foreground truncate">{c.url ? c.subtitle : "No configurado"}</p>
            </div>
          </Card>
        );
        return c.url ? (
          <a key={c.title} href={c.url} target="_blank" rel="noreferrer noopener">{inner}</a>
        ) : (
          <div key={c.title}>{inner}</div>
        );
      })}
    </div>
  );
}

export function ClientDashboard() {
  const { slug, tab } = useParams<{ slug: string; tab?: string }>();
  const { setBreadcrumbs } = useBreadcrumbs();
  const activeTab: Tab = (TABS.find((t) => t.value === tab)?.value ?? "tasks") as Tab;

  const clientQuery = useQuery({
    queryKey: queryKeys.clients.detail(slug ?? ""),
    queryFn: () => clientsApi.get(slug!),
    enabled: !!slug,
    retry: false,
  });

  const client: Client | undefined = clientQuery.data;
  const adsQuery = useQuery({
    queryKey: queryKeys.clients.adsSummary(slug ?? ""),
    queryFn: () => clientsApi.adsSummary(slug!),
    enabled: !!slug,
    retry: false,
  });
  const ads: ClientAdsSummary | undefined = adsQuery.data;

  useEffect(() => {
    if (client) {
      setBreadcrumbs([
        { label: "Clients", href: "/clients" },
        { label: client.name },
      ]);
    } else {
      setBreadcrumbs([
        { label: "Clients", href: "/clients" },
        { label: slug ?? "—" },
      ]);
    }
  }, [client, slug, setBreadcrumbs]);

  if (clientQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (clientQuery.isError) {
    return (
      <div className="space-y-4">
        <BreadcrumbHeader slug={slug} />
        <Card className="p-6 border-destructive/20 bg-destructive/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-sm">Client not found</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {(clientQuery.error as Error).message}
              </p>
              <Link to="/clients" className="text-xs text-foreground underline mt-2 inline-block">
                ← Back to clients list
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="space-y-6">
      <BreadcrumbHeader slug={slug} name={client.name} />

      {/* Hero header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
            <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              {client.status}
            </Badge>
            <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300">
              {client.tier}
            </Badge>
          </div>
          {client.legalName && client.legalName !== client.name && (
            <p className="text-sm text-muted-foreground">{client.legalName}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-1">
            {client.industry && (
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                {client.industry}
              </div>
            )}
            {client.websiteUrl && (
              <a
                href={client.websiteUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <Globe className="h-3.5 w-3.5" />
                {client.websiteUrl.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
            {client.primaryContactEmail && (
              <a
                href={`mailto:${client.primaryContactEmail}`}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                {client.primaryContactEmail}
              </a>
            )}
            {client.primaryContactPhone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {client.primaryContactPhone}
              </div>
            )}
          </div>
        </div>

        {/* Right-side stats summary */}
        <div className="flex items-center gap-6 text-sm">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Monthly retainer</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatRetainer(client.monthlyRetainerCents, client.currency)}
            </p>
          </div>
          {client.onboardedAt && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Onboarded</p>
              <p className="text-sm tabular-nums">
                {new Date(client.onboardedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Quick-access resource cards */}
      <ClientResourcesPanel client={client} />

      {/* Tabs */}
      <div className="border-b flex items-center gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.value === activeTab;
          return (
            <Link
              key={t.value}
              to={`/c/${client.slug}/${t.value}`}
              className={`px-3 py-2 text-sm inline-flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Tab content */}
      <TabContent tab={activeTab} client={client} ads={ads} />
    </div>
  );
}

function TabContent({ tab, client, ads }: { tab: Tab; client: Client; ads?: ClientAdsSummary }) {
  switch (tab) {
    case "tasks":
      return <TasksTab client={client} />;
    case "calendario":
      return <CalendarTab client={client} />;
    case "dashboard":
      return <PaidMediaTab client={client} ads={ads} />;
    case "ideas":
      return <IdeasTab client={client} />;
    case "ganchos":
      return <GanchosTab client={client} />;
    case "tendencias":
      return <TendenciasTab client={client} />;
    case "memoria":
      return <MemoriaTab client={client} />;
    case "competidores":
      return <CompetidoresTab client={client} />;
  }
}

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

function CalendarTab({ client }: { client: Client }) {
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
                            className={`block rounded border px-1 py-0.5 hover:brightness-110 transition ${p.published ? "border-emerald-500/40 bg-emerald-500/5" : p.sentToMake ? "border-sky-500/40 bg-sky-500/5" : "border-border bg-muted/40"}`}>
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
            <span className="px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/5">publicado</span>
            <span className="px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/5">mandado a make</span>
          </div>

          <p className="text-[11px] text-muted-foreground">
            La fecha sale de <strong>Fecha de inicio</strong> y las redes del campo <strong>Plataformas</strong> en ClickUp. Los posteos sin fecha de inicio no aparecen en el calendario.
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

const SOURCE_BADGE: Record<string, string> = {
  organico: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  competidor: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  tendencia: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  manual: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
};

function GanchosTab({ client }: { client: Client }) {
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

const TAG_STYLE: Record<string, string> = {
  "potencial-de-gancho": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  explicativo: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  ignorar: "bg-zinc-500/10 text-zinc-500",
};

function TendenciasTab({ client }: { client: Client }) {
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
function IdeasTab({ client }: { client: Client }) {
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
function MemoriaTab({ client }: { client: Client }) {
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

      {intel?.score && (
        <div className="flex gap-2">
          <Card className="p-3 flex-1"><p className="text-xs text-muted-foreground">Salud de cuenta</p><p className="text-lg font-semibold tabular-nums">{intel.score.healthScore}/100</p></Card>
          <Card className="p-3 flex-1"><p className="text-xs text-muted-foreground">Score operativo</p><p className="text-lg font-semibold tabular-nums">{intel.score.opsScore}/100</p></Card>
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
function CompetidoresTab({ client }: { client: Client }) {
  const qc = useQueryClient();
  const compQuery = useQuery({
    queryKey: ["client", client.slug, "competitors"],
    queryFn: () => clientsApi.listCompetitors(client.slug),
  });
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const add = useMutation({
    mutationFn: () => clientsApi.addCompetitor(client.id, { name: name.trim(), fbPageUrl: url.trim() || null }),
    onSuccess: () => { setName(""); setUrl(""); qc.invalidateQueries({ queryKey: ["client", client.slug, "competitors"] }); },
  });
  const del = useMutation({
    mutationFn: (cid: string) => clientsApi.deleteCompetitor(client.id, cid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", client.slug, "competitors"] }),
  });

  const comps = compQuery.data?.competitors ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Competidores de {client.name}. Se usan para generar ideas diferenciadas en la pestaña <span className="font-medium">Ideas de posteos</span>.</p>

      <Card className="p-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Nombre</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Competidor" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Página / URL (opcional)</label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="facebook.com/… o web" />
        </div>
        <Button size="sm" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>Agregar</Button>
      </Card>

      {compQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando competidores…</p>
      ) : comps.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Sin competidores cargados. Agregá al menos uno para que las ideas se diferencien de la competencia.</Card>
      ) : (
        <div className="space-y-2">
          {comps.map((c) => (
            <Card key={c.id} className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.name}</p>
                {c.fbPageUrl && <a href={c.fbPageUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 inline-flex items-center gap-1"><Facebook className="h-3 w-3" /> {c.fbPageUrl}</a>}
                {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                {c.sampleAds?.length > 0 && <p className="text-[11px] text-muted-foreground mt-1">{c.sampleAds.length} anuncio(s) observado(s)</p>}
              </div>
              <Button size="sm" variant="ghost" disabled={del.isPending} onClick={() => del.mutate(c.id)}>Quitar</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TasksTab({ client }: { client: Client }) {
  const qc = useQueryClient();
  const tasksQuery = useQuery({
    queryKey: ["client", client.slug, "tasks"],
    queryFn: () => clientsApi.tasks(client.slug),
    refetchInterval: 30000,
  });
  const act = useMutation({
    mutationFn: (args: { issueId: string; action: "approve" | "dismiss" }) => clientsApi.taskAction(args.issueId, args.action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", client.slug, "tasks"] }),
  });
  const sugAct = useMutation({
    mutationFn: (args: { oppId: string; action: "accept" | "dismiss" }) =>
      clientsApi.suggestionAction(client.id, args.oppId, args.action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", client.slug, "tasks"] }),
  });
  const runOpps = useMutation({
    mutationFn: () => clientsApi.runOpportunities(client.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", client.slug, "tasks"] }),
  });

  const data = tasksQuery.data;
  if (tasksQuery.isLoading) return <p className="text-sm text-muted-foreground">Cargando tareas…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">No se pudieron cargar las tareas.</p>;

  const proposals = data.tasks.filter((t) => t.needsApproval);
  const active = data.tasks.filter((t) => !t.needsApproval && !["done", "cancelled"].includes(t.status));
  const done = data.tasks.filter((t) => ["done", "cancelled"].includes(t.status));
  const suggestions = data.suggestions ?? [];

  const postCls =
    data.posting.status === "ok" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : data.posting.status === "warn" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300";
  const PostIcon = data.posting.status === "ok" ? CheckCircle2 : AlertCircle;
  const prioCls = (p: string) =>
    p === "urgent" || p === "high" ? "text-rose-600 dark:text-rose-400" : p === "low" ? "text-muted-foreground" : "text-foreground";

  return (
    <div className="space-y-4">
      {/* Posting status */}
      <Card className={`p-3 flex items-center gap-2 text-sm ${postCls}`}>
        <PostIcon className="h-4 w-4 shrink-0" />
        <span className="font-medium">Posteo:</span>
        <span>{data.posting.detail}</span>
      </Card>

      {/* Proposals awaiting approval */}
      {proposals.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-amber-500" /> Para aprobar ({proposals.length})
          </h3>
          <div className="space-y-2">
            {proposals.map((t) => (
              <Card key={t.id} className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.identifier} · externa · {new Date(t.createdAt).toLocaleDateString("es-AR")}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ issueId: t.id, action: "approve" })}>Aprobar</Button>
                  <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ issueId: t.id, action: "dismiss" })}>Descartar</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Active tasks */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
          <ListTodo className="h-4 w-4" /> Tareas activas ({active.length})
        </h3>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin tareas activas para este cliente.</p>
        ) : (
          <div className="space-y-1.5">
            {active.map((t) => (
              <Card key={t.id} className="p-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.identifier} · {t.status}</p>
                </div>
                <span className={`text-xs shrink-0 ${prioCls(t.priority)}`}>{t.priority}</span>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Scheduled content */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
          <Calendar className="h-4 w-4" /> Contenido programado (ClickUp)
        </h3>
        {data.scheduled.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin contenido programado en la ventana (o lista de Redes no mapeada).</p>
        ) : (
          <div className="space-y-1">
            {data.scheduled.slice(0, 30).map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm py-1 border-b border-border/40 last:border-0">
                <span className="truncate flex items-center gap-1.5">
                  {s.published ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  {s.name}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {s.plannedDate ? new Date(s.plannedDate).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : "—"} · {s.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {done.length > 0 && (
        <p className="text-xs text-muted-foreground">{done.length} tarea(s) cerrada(s).</p>
      )}
    </div>
  );
}

function OverviewTab({ client, ads }: { client: Client; ads?: ClientAdsSummary }) {
  const hasAccounts = (ads?.accounts?.length ?? 0) > 0;
  const totals = ads?.insights?.totals;
  const hasSpend = totals && totals.spend > 0;
  const fmtSpend = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: client.currency, maximumFractionDigits: 0 }).format(n);
  const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

  return (
    <div className="space-y-3">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <KpiCard
        title="Spend (30d)"
        value={hasSpend ? fmtSpend(totals!.spend) : "—"}
        sub={hasAccounts ? `${Object.keys(ads!.insights.byPlatform).join(" + ") || "Meta + Google"}` : "No ad accounts linked"}
        icon={DollarSign}
        status={hasSpend ? "ok" : hasAccounts ? "empty" : "warn"}
      />
      <KpiCard
        title="Impressions (30d)"
        value={hasSpend ? fmtInt(totals!.impressions) : "—"}
        sub={hasSpend ? `${fmtInt(totals!.clicks)} clicks · ${fmtPct(totals!.ctr)} CTR` : "Connect Meta to see real numbers"}
        icon={Eye}
        status={hasSpend ? "ok" : "empty"}
      />
      <KpiCard
        title="Leads (30d)"
        value={hasSpend ? fmtInt(totals!.leads) : "—"}
        sub={hasSpend ? `CPC ${fmtSpend(totals!.cpc)}` : "Awaiting first sync"}
        icon={Target}
        status={hasSpend ? "ok" : "empty"}
      />
      <KpiCard
        title="Pipeline value"
        value="—"
        sub="ClickUp + CRM"
        icon={Briefcase}
        status="empty"
      />
      <KpiCard
        title="Active initiatives"
        value="0"
        sub="Across 14 agents"
        icon={Briefcase}
        status="empty"
      />
      <KpiCard
        title="Last activity"
        value="—"
        sub="From any agent"
        icon={Calendar}
        status="empty"
      />

      <Card className="p-4 md:col-span-2 lg:col-span-3">
        <h3 className="text-sm font-medium">Recent activity</h3>
        <p className="text-xs text-muted-foreground mt-2">
          Activity feed will appear here once the agent wakeup loop runs.
        </p>
        <EmptyState
          title="No activity yet"
          body="The 14 agents (Luna, Pablo, Milo, ...) are idle. Their next heartbeat will start populating this feed."
        />
      </Card>
    </div>
    <ClientWhatsAppSection clientId={client.id} />
    </div>
  );
}

// WhatsApp groups mapped to this client + their conversation summaries.
function ClientWhatsAppSection({ clientId }: { clientId: string }) {
  const { data } = useQuery({
    queryKey: ["wa-bot", "client-groups", clientId],
    queryFn: () => waBotApi.clientGroups(clientId),
    enabled: !!clientId,
    refetchInterval: 60000,
  });
  const groups = data?.groups ?? [];

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <MessageSquare className="h-4 w-4" /> WhatsApp
      </h3>
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground mt-2">
          No hay grupos de WhatsApp asignados a este cliente. Asigná uno desde la sección WhatsApp (elegí el cliente en el grupo).
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {groups.map((g) => (
            <div key={g.groupJid}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                <Users className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{g.groupName ?? g.groupJid}</span>
                {!g.enabled && <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0">pausado</Badge>}
              </div>
              {g.summaries.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin resúmenes todavía.</p>
              ) : (
                <div className="space-y-2">
                  {g.summaries.slice(0, 5).map((s) => (
                    <div key={s.id} className="rounded-md border border-border bg-muted/30 p-3">
                      <p className="text-[11px] text-muted-foreground mb-1">{s.messageCount} mensajes · {new Date(s.createdAt).toLocaleString()}</p>
                      <p className="text-xs whitespace-pre-wrap leading-relaxed line-clamp-6">{s.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PaidMediaTab({ client, ads }: { client: Client; ads?: ClientAdsSummary }) {
  const hasAccounts = (ads?.accounts?.length ?? 0) > 0;
  const fmtSpend = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: client.currency,
      maximumFractionDigits: 0,
    }).format(n);
  const fmtSpend2 = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: client.currency,
      maximumFractionDigits: 2,
    }).format(n);
  const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

  if (!hasAccounts) {
    const metaConnected = ads?.oauthReady?.meta === true;
    return (
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-blue-500/10 p-2.5 shrink-0">
            <Facebook className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 space-y-2">
            {metaConnected ? (
              <>
                <h3 className="text-sm font-medium">Asigná páginas y adsets a {client.name}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Meta ya está conectado a nivel agencia. Para ver campañas de {client.name} en este dashboard,
                  abrí el selector y asigná las páginas / cuentas publicitarias / conjuntos de anuncios que correspondan a este cliente.
                </p>
                <div className="flex items-center gap-2 pt-2 flex-wrap">
                  <Button size="sm" asChild>
                    <Link to="/connect-ads">
                      <Layers className="h-3.5 w-3.5 mr-1.5" />
                      Abrir selector de páginas y adsets
                    </Link>
                  </Button>
                  {ads?.oauthStartUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { window.location.href = ads.oauthStartUrl!; }}
                    >
                      <Facebook className="h-3.5 w-3.5 mr-1.5" />
                      Reconectar Meta
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-medium">Connect Meta to see paid media for {client.name}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Link a Meta (Facebook + Instagram) ad account to pull campaigns, spend, impressions, clicks, CTR and leads.
                  Click below to start the OAuth flow; on success you'll be asked to pick the ad account, page and LMTM client, and the dashboard will populate after the first sync.
                </p>
                <div className="flex items-center gap-2 pt-2 flex-wrap">
                  {ads?.oauthStartUrl ? (
                    <Button
                      size="sm"
                      onClick={() => { window.location.href = ads.oauthStartUrl!; }}
                    >
                      <Facebook className="h-3.5 w-3.5 mr-1.5" />
                      Connect Meta
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      <Facebook className="h-3.5 w-3.5 mr-1.5" />
                      Meta not configured (admin must set META_APP_ID + META_APP_SECRET)
                    </Button>
                  )}
                  <Link
                    to="/connect-ads"
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Ir al selector de páginas
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return <PaidMediaDashboard client={client} ads={ads!} />;
}

function CampaignsDashboard({ client, ads }: { client: Client; ads: ClientAdsSummary }) {
  const qc = useQueryClient();

  // ---- Date range (default: últimos 365 días) ----
  const today = useMemo(() => new Date(), []);
  const defaultSince = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 365);
    return d.toISOString().slice(0, 10);
  }, [today]);
  const defaultUntil = useMemo(() => today.toISOString().slice(0, 10), [today]);

  const [since, setSince] = useState<string>(defaultSince);
  const [until, setUntil] = useState<string>(defaultUntil);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<keyof SortableCampaignField>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const campaignsQuery = useQuery({
    queryKey: queryKeys.clients.campaigns(client.slug, since, until),
    queryFn: () => clientsApi.campaigns(client.slug, { since, until }),
    enabled: !!client.slug,
    retry: false,
  });

  const data = campaignsQuery.data;
  const totals = data?.totals;

  const fmtSpend = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: client.currency, maximumFractionDigits: 0 }).format(n);
  const fmtSpend2 = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: client.currency, maximumFractionDigits: 2 }).format(n);
  const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
  const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;

  // (El sync manual se eliminó: el autosync del server sincroniza Meta cada
  // hora solo; la UI solo lee.)

  // ---- Search + sort ----
  const filteredCampaigns = useMemo(() => {
    if (!data?.campaigns) return [];
    const q = search.trim().toLowerCase();
    let rows = data.campaigns;
    if (q) {
      rows = rows.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.objective?.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q),
      );
    }
    rows = [...rows].sort((a, b) => {
      const av = a[sortBy] ?? 0;
      const bv = b[sortBy] ?? 0;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return rows;
  }, [data?.campaigns, search, sortBy, sortDir]);

  const handleSort = (col: keyof SortableCampaignField) => {
    if (col === sortBy) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  const csvHref = clientsApi.campaignsCsvUrl(client.slug, { since, until });

  return (
    <div className="space-y-4">
      {/* Header row: date range + actions */}
      <Card className="p-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-medium">Campañas</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ads.accounts.length} ad account{ads.accounts.length === 1 ? "" : "s"} linked · {Object.keys(ads.insights.byPlatform).join(" + ") || "Meta"}
            </p>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <DateInput label="Desde" value={since} onChange={setSince} max={until} />
            <DateInput label="Hasta" value={until} onChange={setUntil} min={since} max={defaultUntil} />
            <div className="flex items-center gap-2">
              <a href={csvHref} target="_blank" rel="noreferrer noopener">
                <Button size="sm" variant="outline">
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Exportar CSV
                </Button>
              </a>
            </div>
          </div>
        </div>
      </Card>

      {/* Linked accounts (compact) */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Linked ad accounts</h4>
          {ads?.oauthStartUrl && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { window.location.href = ads.oauthStartUrl!; }}
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Conectar otra
            </Button>
          )}
        </div>
        <div className="space-y-1.5">
          {ads.accounts.map((a) => (
            <div key={a.mappingId} className="flex items-center justify-between text-xs py-1">
              <div className="flex items-center gap-2">
                <div className={`rounded-md p-1 ${a.platform === "meta" ? "bg-blue-500/10" : "bg-slate-500/10"}`}>
                  {a.platform === "meta" ? (
                    <Facebook className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Megaphone className="h-3 w-3 text-slate-500" />
                  )}
                </div>
                <span className="font-medium">{a.mappingLabel || a.connectionLabel || a.adAccountId}</span>
                <span className="text-muted-foreground text-[10px]">· {a.platform} · {a.adAccountId}</span>
              </div>
              <Badge
                className={
                  a.connectionStatus === "active"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                }
              >
                {a.connectionStatus}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* KPI cards */}
      {campaignsQuery.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : totals ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            title="Total Inversión"
            value={fmtSpend(totals.spend)}
            sub={`${filteredCampaigns.length} campañas en el período`}
            icon={DollarSign}
            status="ok"
          />
          <KpiCard
            title="Total Impresiones"
            value={fmtInt(totals.impressions)}
            sub={`${fmtInt(totals.clicks)} clicks · ${fmtPct(totals.ctr)} CTR`}
            icon={Eye}
            status="ok"
          />
          <KpiCard
            title="Total Clics"
            value={fmtInt(totals.clicks)}
            sub={`CPC ${fmtSpend2(totals.cpc)} · CPM ${fmtSpend2(totals.cpm)}`}
            icon={MousePointerClick}
            status="ok"
          />
          <KpiCard
            title="Total Leads"
            value={fmtInt(totals.leads)}
            sub={totals.leads > 0 ? `CPL ${fmtSpend2(totals.spend / totals.leads)}` : "Sin leads en el período"}
            icon={Target}
            status="ok"
          />
        </div>
      ) : null}

      {/* Search + table */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar campaña…"
              className="pl-8 h-9"
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {filteredCampaigns.length} de {data?.campaigns.length ?? 0} campañas
          </span>
        </div>

        {campaignsQuery.isError ? (
          <div className="text-xs text-destructive py-4 text-center">
            Error al cargar campañas: {(campaignsQuery.error as Error).message}
          </div>
        ) : campaignsQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (data?.campaigns.length ?? 0) === 0 ? (
          <div className="py-8 text-center">
            <Megaphone className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium mt-2">No hay campañas sincronizadas</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              La sincronización con Meta corre sola cada hora. Si la cuenta se mapeó recién, en unos minutos aparecen las campañas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground uppercase tracking-wide text-[10px]">
                  <SortHeader label="Campaña" onClick={() => handleSort("name")} active={sortBy === "name"} dir={sortDir} />
                  <SortHeader label="Estado" onClick={() => handleSort("status")} active={sortBy === "status"} dir={sortDir} />
                  <th className="text-left font-medium px-3 py-2">Objetivo</th>
                  <SortHeader label="Inversión" onClick={() => handleSort("spend")} active={sortBy === "spend"} dir={sortDir} align="right" />
                  <SortHeader label="Impr." onClick={() => handleSort("impressions")} active={sortBy === "impressions"} dir={sortDir} align="right" />
                  <SortHeader label="Clics" onClick={() => handleSort("clicks")} active={sortBy === "clicks"} dir={sortDir} align="right" />
                  <SortHeader label="CTR" onClick={() => handleSort("ctr")} active={sortBy === "ctr"} dir={sortDir} align="right" />
                  <SortHeader label="CPM" onClick={() => handleSort("cpm")} active={sortBy === "cpm"} dir={sortDir} align="right" />
                  <SortHeader label="Leads" onClick={() => handleSort("leads")} active={sortBy === "leads"} dir={sortDir} align="right" />
                  <SortHeader label="CPL" onClick={() => handleSort("cpl")} active={sortBy === "cpl"} dir={sortDir} align="right" />
                  <th className="text-right font-medium px-3 py-2">Presupuesto</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium max-w-[240px] truncate" title={c.name}>
                      {c.name}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        className={
                          c.status === "active"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : c.status === "paused"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : "bg-slate-500/10 text-slate-700 dark:text-slate-300"
                        }
                      >
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{c.objective ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtSpend2(c.spend)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(c.impressions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(c.clicks)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPct(c.ctr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtSpend2(c.cpm)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(c.leads)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.cpl > 0 ? fmtSpend2(c.cpl) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {c.dailyBudget ? `${fmtSpend2(c.dailyBudget)}/d` : c.lifetimeBudget ? `${fmtSpend2(c.lifetimeBudget)} tot` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

type SortableCampaignField = {
  name: string;
  status: string;
  objective: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpl: number;
};

function SortHeader({
  label,
  onClick,
  active,
  dir,
  align = "left",
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  align?: "left" | "right";
}) {
  return (
    <th
      className={`font-medium px-3 py-2 cursor-pointer select-none hover:text-foreground transition-colors ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowDown
          className={`h-3 w-3 transition-opacity ${active ? "opacity-100" : "opacity-0"} ${
            dir === "asc" ? "rotate-180" : ""
          }`}
        />
      </span>
    </th>
  );
}

function DateInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</label>
      <Input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-[150px] text-xs"
      />
    </div>
  );
}

function OrganicTab({ client }: { client: Client }) {
  return (
    <div className="space-y-3">
      <EmptyState
        title="SEO & organic"
        body={`Serrgio (SEO agent) will run weekly crawls of ${client.websiteUrl ?? client.name}'s site and report traffic, keyword positions, and technical issues here.`}
      />
    </div>
  );
}

function CrmTab({ client }: { client: Client }) {
  return (
    <div className="space-y-3">
      <EmptyState
        title="CRM & funnel"
        body={`Ana (CRM Analyst) and Esteban (CRM Engineer) track MQL→SQL→CPL→Customer conversion. Their next heartbeat will pull data from ClickUp (Plan de Marketing list) and any connected ad accounts.`}
      />
    </div>
  );
}

function InitiativesTab({ client }: { client: Client }) {
  return (
    <div className="space-y-3">
      <EmptyState
        title="Initiatives"
        body={`Every agent can create initiatives (cross-functional projects with goals, budget, and milestones). They'll be listed here in chronological order once any agent kicks one off for ${client.name}.`}
      />
    </div>
  );
}

function TeamTab({ client }: { client: Client }) {
  return (
    <div className="space-y-3">
      <EmptyState
        title="Team & access"
        body={`The 14 LMTM agents available for ${client.name}, plus the human team members assigned. Owner: ${client.ownerAgentId ?? "not yet assigned"}.`}
      />
    </div>
  );
}

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  status,
}: {
  title: string;
  value: string;
  sub: string;
  icon: typeof TrendingUp;
  status: "ok" | "warn" | "empty";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs text-muted-foreground">{title}</p>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
      <p className="text-2xl font-semibold tabular-nums mt-2">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </Card>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-8 text-center">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">{body}</p>
    </Card>
  );
}

function BreadcrumbHeader({ slug, name }: { slug?: string; name?: string }) {
  return (
    <div className="text-xs text-muted-foreground">
      <Link to="/clients" className="hover:text-foreground">
        Clients
      </Link>
      <span className="mx-1.5">/</span>
      <span>{name ?? slug}</span>
    </div>
  );
}

function formatRetainer(cents: number, currency: string) {
  if (!cents) return "—";
  const value = cents / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}
