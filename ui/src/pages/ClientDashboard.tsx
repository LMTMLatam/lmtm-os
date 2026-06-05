import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import {
  clientsApi,
  type Client,
  type ClientAdsSummary,
  type ClientCampaignsResponse,
} from "../api/clients";
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
} from "lucide-react";

type Tab = "overview" | "paid-media" | "organic" | "crm" | "initiatives" | "team";

const TABS: Array<{ value: Tab; label: string; icon: typeof TrendingUp }> = [
  { value: "overview", label: "Overview", icon: BarChart3 },
  { value: "paid-media", label: "Paid Media", icon: TrendingUp },
  { value: "organic", label: "Organic / SEO", icon: SearchIcon },
  { value: "crm", label: "CRM & Funnel", icon: Target },
  { value: "initiatives", label: "Initiatives", icon: Briefcase },
  { value: "team", label: "Team & Access", icon: Users },
];

export function ClientDashboard() {
  const { slug, tab } = useParams<{ slug: string; tab?: string }>();
  const { setBreadcrumbs } = useBreadcrumbs();
  const activeTab: Tab = (TABS.find((t) => t.value === tab)?.value ?? "overview") as Tab;

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
    case "overview":
      return <OverviewTab client={client} ads={ads} />;
    case "paid-media":
      return <PaidMediaTab client={client} ads={ads} />;
    case "organic":
      return <OrganicTab client={client} />;
    case "crm":
      return <CrmTab client={client} />;
    case "initiatives":
      return <InitiativesTab client={client} />;
    case "team":
      return <TeamTab client={client} />;
  }
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
    return (
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-blue-500/10 p-2.5 shrink-0">
            <Facebook className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 space-y-2">
            <h3 className="text-sm font-medium">Connect Meta to see paid media for {client.name}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Link a Meta (Facebook + Instagram) ad account to pull campaigns, spend, impressions, clicks, CTR and leads.
              Click below to start the OAuth flow; on success you'll be asked to pick the ad account, page and LMTM client, and the dashboard will populate after the first sync.
            </p>
            <div className="flex items-center gap-2 pt-2">
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
                to={`/company/settings/integrations/ads`}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Manage all ad integrations
              </Link>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return <CampaignsDashboard client={client} ads={ads!} />;
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
