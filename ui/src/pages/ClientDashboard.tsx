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
} from "lucide-react";
import { waBotApi } from "../api/waBot";

type Tab = "tasks" | "dashboard" | "ideas" | "memoria" | "competidores";

const TABS: Array<{ value: Tab; label: string; icon: typeof TrendingUp }> = [
  { value: "tasks", label: "Tareas", icon: ListTodo },
  { value: "dashboard", label: "Dashboard", icon: BarChart3 },
  { value: "ideas", label: "Ideas de posteos", icon: Lightbulb },
  { value: "memoria", label: "Memoria", icon: Layers },
  { value: "competidores", label: "Competidores", icon: Target },
];

/** Quick-access cards to a client's key external resources: ClickUp folder,
 * redes sheet (Cronopost), video-production list, and redes Apps Script. */
function ClientResourcesPanel({ client }: { client: Client }) {
  const teamId = (client.metadata?.clickupTeamId as string | undefined) || "9013352440";
  const scriptId = client.metadata?.redesScriptId as string | undefined;
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
      subtitle: "Lista de ClickUp",
      icon: Clapperboard,
      url: client.clickupListVideoId ? `https://app.clickup.com/${teamId}/v/li/${client.clickupListVideoId}` : null,
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
    case "dashboard":
      return <PaidMediaTab client={client} ads={ads} />;
    case "ideas":
      return <IdeasTab client={client} />;
    case "memoria":
      return <MemoriaTab client={client} />;
    case "competidores":
      return <CompetidoresTab client={client} />;
  }
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

  // ---- Sync mutation ----
  const firstAccount = ads.accounts[0];
  const syncMutation = useMutation({
    mutationFn: async () => {
      const resp = await clientsApi.syncAds(
        firstAccount.connectionId,
        firstAccount.mappingId,
        "all",
        since,
        until,
      );
      return resp;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.clients.campaigns(client.slug, since, until) });
      qc.invalidateQueries({ queryKey: queryKeys.clients.adsSummary(client.slug) });
    },
  });

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
              <Button
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                )}
                Sincronizar
              </Button>
              <a href={csvHref} target="_blank" rel="noreferrer noopener">
                <Button size="sm" variant="outline">
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Exportar CSV
                </Button>
              </a>
            </div>
          </div>
        </div>
        {syncMutation.isSuccess && (
          <div className="mt-3 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Sincronización completa: {syncMutation.data.totalRecords} registros actualizados
            (campaigns: {syncMutation.data.results.find((r) => r.job === "campaigns")?.recordsSynced ?? 0},
            insights: {syncMutation.data.results.find((r) => r.job === "insights")?.recordsSynced ?? 0})
          </div>
        )}
        {syncMutation.isError && (
          <div className="mt-3 text-xs text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Error al sincronizar: {(syncMutation.error as Error).message}
          </div>
        )}
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
              Haz clic en <b>Sincronizar</b> para traer las campañas de los ad accounts conectados.
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
