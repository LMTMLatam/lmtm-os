import { useEffect, useState } from "react";
import { useParams, Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { clientsApi, type Client, type ClientAdsSummary } from "../api/clients";
import { queryKeys } from "../lib/queryKeys";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
  const hasData = (ads?.insights?.totals?.spend ?? 0) > 0 || hasAccounts;
  const fmtSpend = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: client.currency, maximumFractionDigits: 0 }).format(n);
  const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

  return (
    <div className="space-y-4">
      {!hasAccounts ? (
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-md bg-blue-500/10 p-2.5 shrink-0">
              <Facebook className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 space-y-2">
              <h3 className="text-sm font-medium">Connect Meta to see paid media for {client.name}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Link a Meta (Facebook + Instagram) ad account to pull campaigns, spend, impressions, clicks, CTR and leads.
                Click below to start the OAuth flow; on success you'll be redirected back here and the dashboard will populate.
              </p>
              <div className="flex items-center gap-2 pt-2">
                {ads?.oauthStartUrl ? (
                  <Button
                    size="sm"
                    onClick={() => window.open(ads.oauthStartUrl!, "_blank", "noopener,noreferrer")}
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
      ) : (
        <>
          <Card className="p-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-medium">Linked ad accounts</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ads!.accounts.length} account{ads!.accounts.length === 1 ? "" : "s"} connected to {client.name}
                </p>
              </div>
              {ads?.oauthStartUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(ads.oauthStartUrl!, "_blank", "noopener,noreferrer")}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Connect another
                </Button>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {ads!.accounts.map((a) => (
                <div
                  key={a.mappingId}
                  className="flex items-center justify-between text-xs border-b last:border-0 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className={`rounded-md p-1 ${a.platform === "meta" ? "bg-blue-500/10" : "bg-slate-500/10"}`}>
                      {a.platform === "meta" ? (
                        <Facebook className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Megaphone className="h-3 w-3 text-slate-500" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {a.mappingLabel || a.connectionLabel || `Ad account ${a.adAccountId}`}
                      </p>
                      <p className="text-muted-foreground text-[10px]">
                        {a.platform} · {a.adAccountId}
                        {a.pageId ? ` · page ${a.pageId}` : ""}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={
                      a.connectionStatus === "active"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    }
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {a.connectionStatus}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          {!hasData ? (
            <Card className="p-6 text-center">
              <RefreshCcw className="h-5 w-5 mx-auto text-muted-foreground" />
              <h3 className="text-sm font-medium mt-2">No insights yet</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto leading-relaxed">
                The connection is live but the scheduled Meta sync hasn't pulled insights yet. The 30-day
                spend / impressions / clicks rollup will appear here after the first successful sync run.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                title="Spend (30d)"
                value={fmtSpend(ads!.insights.totals.spend)}
                sub={`${Object.keys(ads!.insights.byPlatform).join(" + ")}`}
                icon={DollarSign}
                status="ok"
              />
              <KpiCard
                title="Impressions"
                value={fmtInt(ads!.insights.totals.impressions)}
                sub={fmtInt(ads!.insights.totals.clicks) + " clicks"}
                icon={Eye}
                status="ok"
              />
              <KpiCard
                title="CTR"
                value={fmtPct(ads!.insights.totals.ctr)}
                sub={fmtSpend(ads!.insights.totals.cpc) + " CPC"}
                icon={MousePointerClick}
                status="ok"
              />
              <KpiCard
                title="Leads"
                value={fmtInt(ads!.insights.totals.leads)}
                sub={`${ads!.insights.totals.days} days of data`}
                icon={Target}
                status="ok"
              />
            </div>
          )}

          {hasData && Object.keys(ads!.insights.byPlatform).length > 1 && (
            <Card className="p-4">
              <h3 className="text-sm font-medium">By platform</h3>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.values(ads!.insights.byPlatform).map((p) => (
                  <div key={p.platform} className="rounded-md border p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium capitalize">{p.platform}</p>
                      <span className="text-muted-foreground">{p.days}d</span>
                    </div>
                    <p className="text-lg font-semibold tabular-nums">{fmtSpend(p.spend)}</p>
                    <p className="text-muted-foreground">
                      {fmtInt(p.impressions)} imp · {fmtInt(p.clicks)} clicks · {fmtPct(p.ctr)} CTR · {fmtInt(p.leads)} leads
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {(ads?.campaigns?.total ?? 0) > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-medium">Campaigns</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {ads!.campaigns.total} campaign{ads!.campaigns.total === 1 ? "" : "s"} synced
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(ads!.campaigns.byStatus).map(([k, n]) => (
                  <Badge key={k} variant="secondary" className="text-[10px]">
                    {k}: {n}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
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
