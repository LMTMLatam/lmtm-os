import { useEffect, useState } from "react";
import { useParams, Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { clientsApi, type Client } from "../api/clients";
import { queryKeys } from "../lib/queryKeys";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
      <TabContent tab={activeTab} client={client} />
    </div>
  );
}

function TabContent({ tab, client }: { tab: Tab; client: Client }) {
  switch (tab) {
    case "overview":
      return <OverviewTab client={client} />;
    case "paid-media":
      return <PaidMediaTab client={client} />;
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

function OverviewTab({ client }: { client: Client }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <KpiCard
        title="Spend (30d)"
        value="—"
        sub="Meta + Google"
        icon={DollarSign}
        status="empty"
      />
      <KpiCard
        title="Pipeline value"
        value="—"
        sub="ClickUp + CRM"
        icon={Target}
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
        title="Health score"
        value="—"
        sub="Composite"
        icon={Activity}
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

function PaidMediaTab({ client }: { client: Client }) {
  return (
    <div className="space-y-3">
      <EmptyState
        title="Paid media dashboard"
        body={`Once Meta and Google ad accounts are linked to "${client.name}", the campaigns, spend, and ROAS tiles will populate here. Click "Connect" in the Ad Integrations page to start an OAuth flow.`}
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
