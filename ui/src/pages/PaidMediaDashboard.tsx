// LMTM-OS: Full Meta/Facebook-style paid-media dashboard.
//
// Replaces the old "CampaignsDashboard" with a 13-section SaaS-grade
// dashboard: Resumen Ejecutivo, Presupuesto, Campañas, Conjuntos de
// Anuncios, Anuncios, Contenido Orgánico, Audiencia, Leads/Embudo,
// Alertas, Insights, Ideas de Contenido, Reportes, Oportunidades.
//
// Implementation notes:
// - Vertical sidebar on the left (14 items) mirrors the reference design.
// - Charts are hand-rolled CSS bars (no chart library, see ActivityCharts).
// - All data flows from the 7 new server endpoints in routes/ads.ts:
//     /clients/:slug/timeseries
//     /clients/:slug/adsets
//     /clients/:slug/creatives
//     /clients/:slug/organic
//     /clients/:slug/alerts
//     /clients/:slug/audience
//     /clients/:slug/funnel
// - Date range is shared across all sections via the parent component.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clientsApi,
  type Client,
  type ClientAdsetsResponse,
  type ClientAdsSummary,
  type ClientAlertsResponse,
  type ClientAudienceResponse,
  type ClientCreativesResponse,
  type ClientFunnelResponse,
  type ClientOrganicResponse,
  type TimeseriesPoint,
  type TimeseriesResponse,
} from "../api/clients";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboard,
  Wallet,
  Megaphone,
  Layers,
  Image as ImageIcon,
  Globe2,
  Users,
  Filter,
  Bell,
  Lightbulb,
  FileText,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  RefreshCcw,
  Download,
  Play,
  Loader2,
  Search as SearchIcon,
  Target,
  Eye,
  MousePointerClick,
  DollarSign,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Crown,
  Sparkles,
  Activity,
  Clock,
  Flame,
  X,
  Share2,
  Copy,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ============================================================
//   Sidebar config (14 items from the reference design)
// ============================================================
type Section =
  | "resumen"
  | "presupuesto"
  | "campanas"
  | "conjuntos"
  | "anuncios"
  | "organica"
  | "posts"
  | "audiencia"
  | "leads"
  | "alertas"
  | "reportes"
  | "oportunidades"
  | "configuracion";

const SECTIONS: Array<{ value: Section; label: string; icon: typeof LayoutDashboard }> = [
  { value: "resumen", label: "Resumen", icon: LayoutDashboard },
  { value: "presupuesto", label: "Presupuesto y saldo", icon: Wallet },
  { value: "campanas", label: "Campañas", icon: Megaphone },
  { value: "conjuntos", label: "Conjuntos de anuncios", icon: Layers },
  { value: "anuncios", label: "Anuncios", icon: ImageIcon },
  { value: "organica", label: "Página orgánica", icon: Globe2 },
  { value: "posts", label: "Posts y contenido", icon: FileText },
  { value: "audiencia", label: "Audiencia", icon: Users },
  { value: "leads", label: "Leads / Conversiones", icon: Filter },
  { value: "alertas", label: "Alertas", icon: Bell },
  { value: "reportes", label: "Reportes", icon: TrendingUp },
  { value: "oportunidades", label: "Oportunidades", icon: Sparkles },
  { value: "configuracion", label: "Configuración", icon: Target },
];

// ============================================================
//   Formatters shared across sections
// ============================================================
function useFormatters(currency: string) {
  return useMemo(() => {
    const fmtMoney = (n: number, max = 0) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: max,
      }).format(n);
    const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
    const fmtPct = (n: number, digits = 2) => `${(n * 100).toFixed(digits)}%`;
    const fmtCompact = (n: number) => {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
      return n.toString();
    };
    return { fmtMoney, fmtInt, fmtPct, fmtCompact };
  }, [currency]);
}

// ============================================================
//   Date range sub-component (shared by all sections)
// ============================================================
export function DateRangePicker({
  since, until, defaultUntil, onChange,
}: {
  since: string; until: string; defaultUntil: string;
  onChange: (next: { since: string; until: string }) => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Desde</label>
        <Input
          type="date"
          value={since}
          max={until}
          onChange={(e) => onChange({ since: e.target.value, until })}
          className="h-8 w-36 text-xs"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Hasta</label>
        <Input
          type="date"
          value={until}
          min={since}
          max={defaultUntil}
          onChange={(e) => onChange({ since, until: e.target.value })}
          className="h-8 w-36 text-xs"
        />
      </div>
    </div>
  );
}

// ============================================================
//   Trend chart (CSS bars, mirrors ActivityCharts pattern)
// ============================================================
function TrendChart({
  series,
  metric,
  height = 64,
  color = "bg-blue-500",
}: {
  series: TimeseriesPoint[];
  metric: keyof TimeseriesPoint;
  height?: number;
  color?: string;
}) {
  if (series.length === 0) {
    return <div className="h-16 flex items-center justify-center text-xs text-muted-foreground">Sin datos</div>;
  }
  const max = Math.max(...series.map((p) => Number(p[metric] ?? 0)), 1);
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {series.map((p, i) => {
        const v = Number(p[metric] ?? 0);
        const pct = max > 0 ? (v / max) * 100 : 0;
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm ${v > 0 ? color : "bg-muted/40"} transition-all hover:opacity-80`}
            style={{ height: `${Math.max(pct, 1.5)}%` }}
            title={`${p.date}: ${v.toLocaleString("en-US")}`}
          />
        );
      })}
    </div>
  );
}

// ============================================================
//   KPI card with delta and trend chart
// ============================================================
function Kpi({
  title, value, sub, icon: Icon, trend, accent = "blue",
}: {
  title: string;
  value: string;
  sub?: string;
  icon: typeof DollarSign;
  trend?: { value: number; suffix?: string };
  accent?: "blue" | "green" | "amber" | "rose" | "violet";
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };
  const trendColor =
    trend == null ? "" : trend.value > 0 ? "text-emerald-600 dark:text-emerald-400" : trend.value < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">{title}</p>
          <p className="text-2xl font-semibold tabular-nums truncate">{value}</p>
          {(sub || trend != null) && (
            <div className="flex items-center gap-1.5 text-xs">
              {trend != null && (
                <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${trendColor}`}>
                  {trend.value > 0 ? <ArrowUp className="h-3 w-3" /> : trend.value < 0 ? <ArrowDown className="h-3 w-3" /> : null}
                  {Math.abs(trend.value).toFixed(1)}{trend.suffix ?? "%"}
                </span>
              )}
              {sub && <span className="text-muted-foreground truncate">{sub}</span>}
            </div>
          )}
        </div>
        <div className={`shrink-0 rounded-md p-1.5 ${colors[accent]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
    </Card>
  );
}

// ============================================================
//   Main component
// ============================================================
export function PaidMediaDashboard({ client, ads }: { client: Client; ads: ClientAdsSummary }) {
  const today = useMemo(() => new Date(), []);
  const defaultSince = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30); // default = last month (cached); custom dates trigger a sync
    return d.toISOString().slice(0, 10);
  }, [today]);
  const defaultUntil = useMemo(() => today.toISOString().slice(0, 10), [today]);

  const [range, setRange] = useState({ since: defaultSince, until: defaultUntil });
  const [activeSection, setActiveSection] = useState<Section>("resumen");
  const fmt = useFormatters(client.currency);
  const qc = useQueryClient();

  // ---- Queries ----
  const tsQuery = useQuery({
    queryKey: ["dashboard", "timeseries", client.slug, range.since, range.until],
    queryFn: () => clientsApi.timeseries(client.slug, range),
    retry: false,
  });
  const adsetsQuery = useQuery({
    queryKey: ["dashboard", "adsets", client.slug, range.since, range.until],
    queryFn: () => clientsApi.adsets(client.slug, range),
    retry: false,
  });
  const creativesQuery = useQuery({
    queryKey: ["dashboard", "creatives", client.slug, range.since, range.until],
    queryFn: () => clientsApi.creatives(client.slug, range),
    retry: false,
  });
  const organicQuery = useQuery({
    queryKey: ["dashboard", "organic", client.slug],
    queryFn: () => clientsApi.organic(client.slug),
    retry: false,
  });
  const alertsQuery = useQuery({
    queryKey: ["dashboard", "alerts", client.slug],
    queryFn: () => clientsApi.alerts(client.slug),
    retry: false,
  });
  const audienceQuery = useQuery({
    queryKey: ["dashboard", "audience", client.slug, range.since, range.until],
    queryFn: () => clientsApi.audience(client.slug, range),
    retry: false,
  });
  const funnelQuery = useQuery({
    queryKey: ["dashboard", "funnel", client.slug, range.since, range.until],
    queryFn: () => clientsApi.funnel(client.slug, range),
    retry: false,
  });
  const campaignsQuery = useQuery({
    queryKey: ["dashboard", "campaigns", client.slug, range.since, range.until],
    queryFn: () => clientsApi.campaigns(client.slug, range),
    retry: false,
  });

  // ---- Sync mutation ----
  // Calls the new bulk endpoint that iterates EVERY ad_account_mapping
  // linked to this client (not just the first one) and runs all 5
  // sync jobs sequentially. Default range is last 365 days.
  const syncMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/clients/${client.slug}/sync`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Origin": "https://lmtm.onrender.com" },
        body: JSON.stringify({ since: range.since, until: range.until }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return r.json() as Promise<{
        mappings: number;
        since: string;
        until: string;
        jobs: string[];
        ok: boolean;
        totalRecords: number;
        failedCount: number;
        results: Array<{ mappingId: string; label: string; adAccountId: string; job: string; status: string; recordsSynced: number; error?: string }>;
      }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", "campaigns", client.slug] });
      qc.invalidateQueries({ queryKey: ["dashboard", "timeseries", client.slug] });
      qc.invalidateQueries({ queryKey: ["dashboard", "adsets", client.slug] });
      qc.invalidateQueries({ queryKey: ["dashboard", "creatives", client.slug] });
      qc.invalidateQueries({ queryKey: ["dashboard", "organic", client.slug] });
      qc.invalidateQueries({ queryKey: ["dashboard", "audience", client.slug] });
      qc.invalidateQueries({ queryKey: ["dashboard", "funnel", client.slug] });
      qc.invalidateQueries({ queryKey: ["dashboard", "alerts", client.slug] });
    },
  });

  // Track when the last sync completed (for the auto-sync indicator).
  const lastSyncedAtRef = useRef<number | undefined>(undefined);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (syncMutation.isSuccess) {
      const t = Date.now();
      lastSyncedAtRef.current = t;
      setLastSyncedAt(t);
    }
  }, [syncMutation.isSuccess, syncMutation.data]);

  // ---- Sync policy ----
  // Default (last 30 days) shows the data the daily background sync already
  // cached — NO sync on mount, so opening a client is instant and doesn't
  // hammer Meta. A sync only fires when the user CHANGES the date range (i.e.
  // asks for a custom window). This fixed the dashboard-sync saturation.
  const initialMount = useRef(true);
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return; // first load: use cached data, do not sync
    }
    const t = setTimeout(() => syncMutation.mutate(), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.slug, range.since, range.until]);

  // ---- Totals (from funnel) ----
  const funnel = funnelQuery.data?.funnel;
  const series = tsQuery.data?.series ?? [];
  const adsets = adsetsQuery.data?.adsets ?? [];
  const creatives = creativesQuery.data?.creatives ?? [];
  const organic = organicQuery.data?.posts ?? [];
  const alerts = alertsQuery.data?.alerts ?? [];
  const audience = audienceQuery.data;
  const campaigns = campaignsQuery.data?.campaigns ?? [];

  // ---- Top-line KPIs for the resumen ----
  const totalSpend = funnel?.spend ?? 0;
  const totalImpr = funnel?.impressions ?? 0;
  const totalClicks = funnel?.clicks ?? 0;
  const totalLeads = funnel?.leads ?? 0;
  const totalConversions = funnel?.conversions ?? 0;
  const totalReach = funnel?.reach ?? 0;
  const ctr = funnel?.rates.ctr ?? 0;
  const cpl = funnel?.cpls.cpl ?? 0;
  const cpc = funnel?.cpls.cpc ?? 0;
  const cpm = totalImpr > 0 ? (totalSpend / totalImpr) * 1000 : 0;
  const roas = funnel?.cpls.roas ?? 0;
  const frequency = totalImpr > 0 && totalReach > 0 ? totalImpr / totalReach : 0;
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;

  // ---- Spend today / 7d / 30d ----
  const todayStr = today.toISOString().slice(0, 10);
  const last7Start = new Date(today); last7Start.setDate(last7Start.getDate() - 6);
  const last7StartStr = last7Start.toISOString().slice(0, 10);
  const last30StartStr = defaultSince;
  const spendToday = series.filter((p) => p.date === todayStr).reduce((a, p) => a + p.spend, 0);
  const spend7 = series.filter((p) => p.date >= last7StartStr).reduce((a, p) => a + p.spend, 0);
  const spend30 = series.filter((p) => p.date >= last30StartStr).reduce((a, p) => a + p.spend, 0);

  // ---- Trend (current window vs previous window of same length) ----
  const days = series.length;
  const currentHalf = series.slice(Math.floor(days / 2));
  const prevHalf = series.slice(0, Math.floor(days / 2));
  const sumOf = (arr: TimeseriesPoint[], k: keyof TimeseriesPoint) => arr.reduce((a, p) => a + Number(p[k] ?? 0), 0);
  const trend = (k: keyof TimeseriesPoint) => {
    const cur = sumOf(currentHalf, k);
    const prev = sumOf(prevHalf, k);
    if (prev === 0) return 0;
    return ((cur - prev) / prev) * 100;
  };

  // ---- Per-section renderers ----
  const renderSection = () => {
    switch (activeSection) {
      case "resumen": return <ResumenSection series={series} campaigns={campaigns} totalSpend={totalSpend} totalImpr={totalImpr} totalClicks={totalClicks} totalLeads={totalLeads} totalConversions={totalConversions} ctr={ctr} cpl={cpl} cpc={cpc} cpm={cpm} roas={roas} frequency={frequency} activeCampaigns={activeCampaigns} spendToday={spendToday} spend7={spend7} spend30={spend30} totalReach={totalReach} creatives={creatives} fmt={fmt} trend={trend} adsets={adsets} />;
      case "presupuesto": return <PresupuestoSection totalSpend={totalSpend} series={series} campaigns={campaigns} fmt={fmt} />;
      case "campanas": return <CampanasSection campaigns={campaigns} fmt={fmt} client={client} />;
      case "conjuntos": return <ConjuntosSection adsets={adsets} fmt={fmt} />;
      case "anuncios": return <AnunciosSection creatives={creatives} fmt={fmt} />;
      case "organica": return <OrganicaSection posts={organic} fmt={fmt} />;
      case "posts": return <PostsSection posts={organic} fmt={fmt} />;
      case "audiencia": return <AudienciaSection audience={audience} fmt={fmt} />;
      case "leads": return <LeadsSection funnel={funnel} fmt={fmt} />;
      case "alertas": return <AlertasSection alerts={alerts} />;
      case "reportes": return <ReportesSection series={series} campaigns={campaigns} creatives={creatives} fmt={fmt} />;
      case "oportunidades": return <OportunidadesSection campaigns={campaigns} creatives={creatives} audience={audience} fmt={fmt} />;
      case "configuracion": return <ConfiguracionSection ads={ads} />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Sticky toolbar: title + date range + actions */}
      <Card className="p-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-medium">{SECTIONS.find((s) => s.value === activeSection)?.label}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fmt.fmtInt(totalImpr)} impr · {fmt.fmtInt(totalClicks)} clics · {fmt.fmtInt(totalLeads)} leads · {fmt.fmtMoney(totalSpend)} invertido
            </p>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <DateRangePicker since={range.since} until={range.until} defaultUntil={defaultUntil} onChange={setRange} />
            <SyncStatusIndicator
              isPending={syncMutation.isPending}
              isError={syncMutation.isError}
              lastSyncedAt={lastSyncedAt}
              records={syncMutation.data?.totalRecords}
              mappings={syncMutation.data?.mappings}
            />
            <a href={clientsApi.campaignsCsvUrl(client.slug, range)} target="_blank" rel="noreferrer noopener">
              <Button size="sm" variant="outline">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                CSV
              </Button>
            </a>
            <ShareDialog client={client} />
          </div>
        </div>
      </Card>

      {/* Sidebar + content */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        <Card className="p-2 self-start lg:sticky lg:top-4">
          <nav className="space-y-0.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = s.value === activeSection;
              return (
                <button
                  key={s.value}
                  onClick={() => setActiveSection(s.value)}
                  className={`w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive
                      ? "bg-foreground/5 text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-foreground" : "text-muted-foreground"}`} />
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </nav>
        </Card>
        <div className="min-w-0">{renderSection()}</div>
      </div>
    </div>
  );
}

// ============================================================
//   1) RESUMEN EJECUTIVO
// ============================================================
function ResumenSection({ series, campaigns, totalSpend, totalImpr, totalClicks, totalLeads, totalConversions, ctr, cpl, cpc, cpm, roas, frequency, activeCampaigns, spendToday, spend7, spend30, totalReach, creatives, fmt, trend, adsets }: any) {
  const topCampaigns = useMemo(() => [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 5), [campaigns]);
  const topCreatives = useMemo(() => [...creatives].sort((a, b) => b.ctr - a.ctr).slice(0, 3), [creatives]);
  const worstCampaigns = useMemo(() => [...campaigns].filter((c: any) => c.spend > 100).sort((a: any, b: any) => b.cpl - a.cpl).slice(0, 3), [campaigns]);

  return (
    <div className="space-y-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Kpi title="Inversión hoy" value={fmt.fmtMoney(spendToday)} icon={DollarSign} accent="blue" trend={{ value: trend("spend") }} />
        <Kpi title="Inversión 7d" value={fmt.fmtMoney(spend7)} icon={DollarSign} accent="blue" trend={{ value: trend("spend") }} />
        <Kpi title="Inversión 30d" value={fmt.fmtMoney(spend30)} icon={DollarSign} accent="blue" />
        <Kpi title="Leads" value={fmt.fmtInt(totalLeads)} icon={Target} accent="green" trend={{ value: trend("leads") }} sub={cpl > 0 ? `CPL ${fmt.fmtMoney(cpl)}` : "—"} />
        <Kpi title="Conversiones" value={fmt.fmtInt(totalConversions)} icon={CheckCircle2} accent="green" sub={roas > 0 ? `ROAS ${roas.toFixed(2)}x` : "—"} />
        <Kpi title="CTR" value={fmt.fmtPct(ctr, 2)} icon={MousePointerClick} accent="violet" sub={`CPC ${fmt.fmtMoney(cpc, 2)}`} />
        <Kpi title="CPM" value={fmt.fmtMoney(cpm, 0)} icon={Activity} accent="amber" sub={`Frecuencia ${frequency.toFixed(2)}`} />
        <Kpi title="Alcance" value={fmt.fmtCompact(totalReach)} icon={Eye} accent="rose" sub={`${fmt.fmtCompact(totalImpr)} impr`} />
        <Kpi title="Campañas activas" value={fmt.fmtInt(activeCampaigns)} icon={Megaphone} accent="blue" sub={`${campaigns.length} totales`} />
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Inversión diaria</h3>
            <Badge variant="outline" className="text-[10px]">Total {fmt.fmtMoney(totalSpend)}</Badge>
          </div>
          {series.length === 0 ? <Skeleton className="h-16 w-full" /> : <TrendChart series={series} metric="spend" color="bg-blue-500" />}
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Leads diarios</h3>
            <Badge variant="outline" className="text-[10px]">Total {fmt.fmtInt(totalLeads)}</Badge>
          </div>
          {series.length === 0 ? <Skeleton className="h-16 w-full" /> : <TrendChart series={series} metric="leads" color="bg-emerald-500" />}
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Clics diarios</h3>
            <Badge variant="outline" className="text-[10px]">Total {fmt.fmtInt(totalClicks)}</Badge>
          </div>
          {series.length === 0 ? <Skeleton className="h-16 w-full" /> : <TrendChart series={series} metric="clicks" color="bg-violet-500" />}
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">CTR diario</h3>
            <Badge variant="outline" className="text-[10px]">Promedio {fmt.fmtPct(ctr, 2)}</Badge>
          </div>
          {series.length === 0 ? <Skeleton className="h-16 w-full" /> : <TrendChart series={series} metric="ctr" color="bg-amber-500" />}
        </Card>
      </div>

      {/* Top campaigns + Top creatives + Worst */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /> Top 5 campañas por inversión</h3>
          {topCampaigns.length === 0 ? <p className="text-xs text-muted-foreground">Sin datos</p> : (
            <div className="space-y-2">
              {topCampaigns.map((c: any) => {
                const pct = totalSpend > 0 ? (c.spend / totalSpend) * 100 : 0;
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium truncate flex-1">{c.name}</span>
                      <span className="tabular-nums text-muted-foreground ml-2">{fmt.fmtMoney(c.spend)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><Flame className="h-4 w-4 text-rose-500" /> Atención: CPL más alto</h3>
          {worstCampaigns.length === 0 ? <p className="text-xs text-muted-foreground">Sin campañas con gasto suficiente</p> : (
            <div className="space-y-2">
              {worstCampaigns.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate flex-1">{c.name}</span>
                  <span className="tabular-nums text-rose-600 dark:text-rose-400 ml-2">{fmt.fmtMoney(c.cpl)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Insights strip */}
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-500" /> Insights automáticos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {topCampaigns[0] && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">🏆 Campaña destacada</p>
              <p className="text-muted-foreground mt-1">
                <span className="text-foreground font-medium">{topCampaigns[0].name}</span> genera el
                {" "}{((topCampaigns[0].spend / totalSpend) * 100).toFixed(0)}% de la inversión total.
              </p>
            </div>
          )}
          {totalLeads > 0 && cpl > 0 && (
            <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3">
              <p className="font-medium text-blue-700 dark:text-blue-300">📊 Costo por lead</p>
              <p className="text-muted-foreground mt-1">
                CPL actual <span className="text-foreground font-medium">{fmt.fmtMoney(cpl)}</span>.
                {cpl < 500 ? " Rendimiento saludable." : " Considerá revisar segmentación y creatividades."}
              </p>
            </div>
          )}
          {topCreatives[0] && topCreatives[0].impressions > 0 && (
            <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-3">
              <p className="font-medium text-violet-700 dark:text-violet-300">✨ Creatividad ganadora</p>
              <p className="text-muted-foreground mt-1">
                <span className="text-foreground font-medium">{topCreatives[0].name}</span> tiene CTR de {fmt.fmtPct(topCreatives[0].ctr, 2)}.
                {topCreatives[0].imageUrl && (
                  <a href={topCreatives[0].imageUrl} target="_blank" rel="noreferrer noopener" className="ml-1 inline-flex items-center gap-0.5 underline">
                    Ver <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ============================================================
//   2) PRESUPUESTO Y SALDO
// ============================================================
function PresupuestoSection({ totalSpend, series, campaigns, fmt }: any) {
  const days = series.length || 1;
  const avgDaily = totalSpend / days;
  const today = new Date();
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysRemaining = Math.max(1, endOfMonth.getDate() - today.getDate());
  const projected = avgDaily * (daysRemaining + today.getDate());
  const topCampaigns = useMemo(() => [...campaigns].sort((a: any, b: any) => b.spend - a.spend).slice(0, 6), [campaigns]);
  const monthlyBudget = campaigns.reduce((a: number, c: any) => a + ((c.dailyBudget ?? 0) * 30), 0);
  const consumedPct = monthlyBudget > 0 ? (totalSpend / monthlyBudget) * 100 : 0;
  const overBudget = monthlyBudget > 0 && totalSpend > monthlyBudget;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Gasto del mes" value={fmt.fmtMoney(totalSpend)} icon={DollarSign} accent="blue" />
        <Kpi title="Promedio diario" value={fmt.fmtMoney(avgDaily, 2)} icon={Activity} accent="violet" />
        <Kpi title="Proyección cierre" value={fmt.fmtMoney(projected, 0)} icon={TrendingUp} accent="amber" sub={`${daysRemaining} días restantes`} />
        <Kpi title="Presupuesto mensual" value={monthlyBudget > 0 ? fmt.fmtMoney(monthlyBudget) : "—"} icon={Wallet} accent="rose" sub={monthlyBudget > 0 ? `${consumedPct.toFixed(0)}% consumido` : "Sin budget diario"} />
      </div>

      {/* Gauge */}
      {monthlyBudget > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3">Presupuesto consumido</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span>{fmt.fmtMoney(totalSpend)} de {fmt.fmtMoney(monthlyBudget)}</span>
              <span className={`tabular-nums font-medium ${overBudget ? "text-rose-600 dark:text-rose-400" : consumedPct > 80 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {consumedPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full transition-all ${overBudget ? "bg-rose-500" : consumedPct > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(consumedPct, 100)}%` }}
              />
            </div>
            {overBudget && (
              <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5 mt-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Presupuesto excedido por {fmt.fmtMoney(totalSpend - monthlyBudget)}
              </p>
            )}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Evolución diaria de gasto</h3>
        {series.length === 0 ? <Skeleton className="h-16 w-full" /> : <TrendChart series={series} metric="spend" height={80} color="bg-blue-500" />}
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Top campañas por gasto</h3>
        {topCampaigns.length === 0 ? <p className="text-xs text-muted-foreground">Sin datos</p> : (
          <div className="space-y-2">
            {topCampaigns.map((c: any) => {
              const pct = totalSpend > 0 ? (c.spend / totalSpend) * 100 : 0;
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium truncate flex-1">{c.name}</span>
                    <span className="tabular-nums text-muted-foreground ml-2">{fmt.fmtMoney(c.spend)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
//   3) CAMPAÑAS
// ============================================================
function CampanasSection({ campaigns, fmt, client }: any) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = campaigns;
    if (q) {
      rows = rows.filter((c: any) => c.name.toLowerCase().includes(q) || (c.objective ?? "").toLowerCase().includes(q) || c.status.toLowerCase().includes(q));
    }
    rows = [...rows].sort((a: any, b: any) => {
      const av = a[sortBy] ?? 0;
      const bv = b[sortBy] ?? 0;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [campaigns, search, sortBy, sortDir]);

  const cols: Array<{ key: string; label: string; align?: "right" }> = [
    { key: "name", label: "Campaña" },
    { key: "status", label: "Estado" },
    { key: "objective", label: "Objetivo" },
    { key: "spend", label: "Inversión", align: "right" },
    { key: "impressions", label: "Impr.", align: "right" },
    { key: "clicks", label: "Clics", align: "right" },
    { key: "ctr", label: "CTR", align: "right" },
    { key: "cpm", label: "CPM", align: "right" },
    { key: "cpc", label: "CPC", align: "right" },
    { key: "leads", label: "Leads", align: "right" },
    { key: "cpl", label: "CPL", align: "right" },
  ];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-sm font-medium">Todas las campañas ({campaigns.length})</h3>
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar campaña…"
            className="pl-7 h-8 w-56 text-xs"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => {
                    if (sortBy === c.key) setSortDir(sortDir === "asc" ? "desc" : "asc");
                    else { setSortBy(c.key); setSortDir("desc"); }
                  }}
                  className={`py-2 px-2 font-medium cursor-pointer hover:text-foreground ${c.align === "right" ? "text-right" : ""}`}
                >
                  {c.label} {sortBy === c.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={cols.length} className="text-center py-8 text-muted-foreground">Sin campañas</td></tr>
            ) : filtered.map((c: any) => (
              <tr key={c.id} className="border-b hover:bg-foreground/[0.02]">
                <td className="py-2 px-2 font-medium max-w-[200px] truncate" title={c.name}>{c.name}</td>
                <td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{c.status}</Badge></td>
                <td className="py-2 px-2 text-muted-foreground">{c.objective ?? "—"}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtMoney(c.spend)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtInt(c.impressions)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtInt(c.clicks)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtPct(c.ctr)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtMoney(c.cpm)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtMoney(c.cpc, 2)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtInt(c.leads)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{c.cpl > 0 ? fmt.fmtMoney(c.cpl) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============================================================
//   4) CONJUNTOS DE ANUNCIOS
// ============================================================
function ConjuntosSection({ adsets, fmt }: any) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = adsets;
    if (q) rows = rows.filter((a: any) => a.name.toLowerCase().includes(q) || (a.campaignName ?? "").toLowerCase().includes(q));
    rows = [...rows].sort((a: any, b: any) => {
      const av = a[sortBy] ?? 0;
      const bv = b[sortBy] ?? 0;
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [adsets, search, sortBy, sortDir]);
  const totalSpend = adsets.reduce((a: number, x: any) => a + x.spend, 0);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-sm font-medium">Conjuntos de anuncios ({adsets.length})</h3>
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className="pl-7 h-8 w-56 text-xs" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 px-2 font-medium">Conjunto</th>
              <th className="py-2 px-2 font-medium">Campaña</th>
              <th className="py-2 px-2 font-medium">Estado</th>
              <th className="py-2 px-2 font-medium text-right">Inversión</th>
              <th className="py-2 px-2 font-medium text-right">Impr.</th>
              <th className="py-2 px-2 font-medium text-right">Clics</th>
              <th className="py-2 px-2 font-medium text-right">CTR</th>
              <th className="py-2 px-2 font-medium text-right">CPC</th>
              <th className="py-2 px-2 font-medium text-right">CPL</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Sin conjuntos</td></tr>
            ) : filtered.map((a: any) => {
              const pct = totalSpend > 0 ? (a.spend / totalSpend) * 100 : 0;
              return (
                <tr key={a.id} className="border-b hover:bg-foreground/[0.02]">
                  <td className="py-2 px-2 max-w-[200px] truncate" title={a.name}>{a.name}</td>
                  <td className="py-2 px-2 text-muted-foreground max-w-[160px] truncate" title={a.campaignName ?? ""}>{a.campaignName ?? "—"}</td>
                  <td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{a.status}</Badge></td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtMoney(a.spend)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtInt(a.impressions)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtInt(a.clicks)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtPct(a.ctr)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtMoney(a.cpc, 2)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{a.cpl > 0 ? fmt.fmtMoney(a.cpl) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============================================================
//   5) ANUNCIOS (creativos)
// ============================================================
function AnunciosSection({ creatives, fmt }: any) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return creatives;
    return creatives.filter((c: any) => c.name.toLowerCase().includes(q) || (c.campaignName ?? "").toLowerCase().includes(q) || (c.adsetName ?? "").toLowerCase().includes(q));
  }, [creatives, search]);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-sm font-medium">Anuncios / Creatividades ({creatives.length})</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar creatividad…" className="pl-7 h-8 w-56 text-xs" />
          </div>
          <div className="flex border rounded-md">
            <button onClick={() => setView("grid")} className={`px-2 py-1 text-xs ${view === "grid" ? "bg-foreground/5" : "text-muted-foreground"}`}>Grid</button>
            <button onClick={() => setView("table")} className={`px-2 py-1 text-xs ${view === "table" ? "bg-foreground/5" : "text-muted-foreground"}`}>Tabla</button>
          </div>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">Sin creatividades sincronizadas</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c: any) => (
            <div key={c.id} className="border rounded-lg overflow-hidden hover:shadow-sm transition-shadow">
              <div className="aspect-video bg-muted relative">
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                ) : c.videoId ? (
                  <div className="w-full h-full flex items-center justify-center bg-foreground/5">
                    <Play className="h-8 w-8 text-muted-foreground" />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
                <Badge className="absolute top-2 right-2 text-[10px]" variant="outline">{c.status}</Badge>
              </div>
              <div className="p-3 space-y-2">
                <p className="text-xs font-medium truncate" title={c.name}>{c.name}</p>
                {c.campaignName && <p className="text-[10px] text-muted-foreground truncate">{c.campaignName}</p>}
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <p className="text-muted-foreground">Inversión</p>
                    <p className="font-medium tabular-nums">{fmt.fmtMoney(c.spend)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">CTR</p>
                    <p className="font-medium tabular-nums">{fmt.fmtPct(c.ctr)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Leads</p>
                    <p className="font-medium tabular-nums">{fmt.fmtInt(c.leads)}</p>
                  </div>
                </div>
                {c.impressions > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>CTR</span>
                      <span className="tabular-nums">{fmt.fmtPct(c.ctr)}</span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-violet-500" style={{ width: `${Math.min(c.ctr * 100 * 20, 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 px-2 font-medium">Creatividad</th>
                <th className="py-2 px-2 font-medium">Campaña</th>
                <th className="py-2 px-2 font-medium text-right">Inversión</th>
                <th className="py-2 px-2 font-medium text-right">Impr.</th>
                <th className="py-2 px-2 font-medium text-right">CTR</th>
                <th className="py-2 px-2 font-medium text-right">CPC</th>
                <th className="py-2 px-2 font-medium text-right">CPL</th>
                <th className="py-2 px-2 font-medium text-right">Leads</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id} className="border-b hover:bg-foreground/[0.02]">
                  <td className="py-2 px-2 max-w-[200px] truncate" title={c.name}>{c.name}</td>
                  <td className="py-2 px-2 text-muted-foreground max-w-[160px] truncate">{c.campaignName ?? "—"}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtMoney(c.spend)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtInt(c.impressions)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtPct(c.ctr)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtMoney(c.cpc, 2)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{c.cpl > 0 ? fmt.fmtMoney(c.cpl) : "—"}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtInt(c.leads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ============================================================
//   6) CONTENIDO ORGÁNICO (resumen de página)
// ============================================================
function OrganicaSection({ posts, fmt }: any) {
  const totals = useMemo(() => {
    const t = { posts: posts.length, impressions: 0, engaged: 0, reactions: 0, comments: 0, shares: 0, clicks: 0, videoViews: 0 };
    for (const p of posts) {
      t.impressions += p.impressions;
      t.engaged += p.engaged;
      t.reactions += p.reactions;
      t.comments += p.comments;
      t.shares += p.shares;
      t.clicks += p.clicks;
      t.videoViews += p.videoViews;
    }
    return t;
  }, [posts]);
  const engRate = totals.impressions > 0 ? totals.engaged / totals.impressions : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Posts" value={fmt.fmtInt(totals.posts)} icon={FileText} accent="blue" />
        <Kpi title="Impresiones" value={fmt.fmtCompact(totals.impressions)} icon={Eye} accent="violet" />
        <Kpi title="Engagement Rate" value={fmt.fmtPct(engRate, 2)} icon={Activity} accent="green" />
        <Kpi title="Interacciones" value={fmt.fmtCompact(totals.reactions + totals.comments + totals.shares)} icon={Sparkles} accent="rose" sub={`${fmt.fmtCompact(totals.reactions)} reacs · ${fmt.fmtCompact(totals.comments)} com`} />
      </div>
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Ver sección <Badge variant="outline" className="text-[10px]">Posts y contenido</Badge> para ver el detalle publicación por publicación.</h3>
        <p className="text-xs text-muted-foreground">Las publicaciones con mayor engagement aparecen en la sección "Ideas de contenido" como base para contenido pago.</p>
      </Card>
    </div>
  );
}

// ============================================================
//   7) POSTS Y CONTENIDO (publicaciones orgánicas)
// ============================================================
function PostsSection({ posts, fmt }: any) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p: any) => (p.message ?? "").toLowerCase().includes(q) || p.postType.toLowerCase().includes(q));
  }, [posts, search]);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-sm font-medium">Publicaciones orgánicas ({posts.length})</h3>
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar publicación…" className="pl-7 h-8 w-56 text-xs" />
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">Sin publicaciones sincronizadas</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((p: any) => (
            <div key={p.id} className="border rounded-lg overflow-hidden">
              {p.fullPicture && (
                <div className="aspect-video bg-muted">
                  <img src={p.fullPicture} alt="" className="w-full h-full object-cover" loading="lazy" />
                </div>
              )}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">{p.postType}</Badge>
                  {p.createdTime && <span>{new Date(p.createdTime).toLocaleDateString("es-AR")}</span>}
                </div>
                <p className="text-xs line-clamp-3">{p.message || "(sin texto)"}</p>
                <div className="grid grid-cols-4 gap-2 text-[10px] pt-2 border-t">
                  <div><p className="text-muted-foreground">Reacs</p><p className="font-medium tabular-nums">{fmt.fmtInt(p.reactions)}</p></div>
                  <div><p className="text-muted-foreground">Com.</p><p className="font-medium tabular-nums">{fmt.fmtInt(p.comments)}</p></div>
                  <div><p className="text-muted-foreground">Shares</p><p className="font-medium tabular-nums">{fmt.fmtInt(p.shares)}</p></div>
                  <div><p className="text-muted-foreground">ER</p><p className="font-medium tabular-nums">{fmt.fmtPct(p.engagementRate)}</p></div>
                </div>
                {p.permalinkUrl && (
                  <a href={p.permalinkUrl} target="_blank" rel="noreferrer noopener" className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    Ver en Meta <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ============================================================
//   8) AUDIENCIA (demografía)
// ============================================================
function AudienciaSection({ audience, fmt }: any) {
  if (!audience) return <Skeleton className="h-32 w-full" />;
  const empty = audience.age.length === 0 && audience.gender.length === 0 && audience.platform.length === 0 && audience.device.length === 0;
  if (empty) {
    return (
      <Card className="p-6">
        <h3 className="text-sm font-medium">Sin datos de audiencia</h3>
        <p className="text-xs text-muted-foreground mt-2">
          Meta no desglosa demografía en el nivel de insights estándar. Para ver la audiencia detallada por edad, género y plataforma, ejecutá una sincronización de adsets o accedé al Business Manager de Meta.
        </p>
        <p className="text-xs text-muted-foreground mt-1">Tip: cuando se ejecute un sync de "adsets" con breakdown habilitado, los datos aparecerán acá.</p>
      </Card>
    );
  }
  const renderBucketList = (title: string, icon: any, items: any[]) => (
    <Card className="p-4">
      <h3 className="text-sm font-medium mb-3 flex items-center gap-2">{icon && (() => { const Icon = icon; return <Icon className="h-4 w-4" />; })()} {title}</h3>
      {items.length === 0 ? <p className="text-xs text-muted-foreground">Sin datos</p> : (
        <div className="space-y-2">
          {items.map((b: any) => {
            const maxSpend = Math.max(...items.map((x: any) => x.spend), 1);
            const pct = (b.spend / maxSpend) * 100;
            return (
              <div key={b.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium capitalize">{b.key.replace(/_/g, " ")}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {fmt.fmtMoney(b.spend)} · {fmt.fmtInt(b.impressions)} impr · {fmt.fmtPct(b.ctr)} CTR
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {renderBucketList("Edad", Users, audience.age)}
      {renderBucketList("Género", Users, audience.gender)}
      {renderBucketList("Plataforma", Globe2, audience.platform)}
      {renderBucketList("Dispositivo", Activity, audience.device)}
    </div>
  );
}

// ============================================================
//   9) LEADS / EMBUDO
// ============================================================
function LeadsSection({ funnel, fmt }: any) {
  if (!funnel) return <Skeleton className="h-64 w-full" />;
  const stages = [
    { key: "impressions", label: "Impresiones", value: funnel.impressions, color: "bg-blue-500" },
    { key: "clicks", label: "Clics", value: funnel.clicks, color: "bg-violet-500" },
    { key: "landingVisits", label: "Visitas a landing", value: funnel.landingVisits, color: "bg-amber-500" },
    { key: "leads", label: "Leads", value: funnel.leads, color: "bg-emerald-500" },
    { key: "conversions", label: "Ventas", value: funnel.conversions, color: "bg-rose-500" },
  ];
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-4">Embudo de conversión</h3>
        <div className="space-y-3">
          {stages.map((s, i) => {
            const pct = (s.value / max) * 100;
            const prev = i > 0 ? stages[i - 1].value : null;
            const conv = prev != null && prev > 0 ? (s.value / prev) * 100 : null;
            return (
              <div key={s.key}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.label}</span>
                    {conv != null && (
                      <Badge variant="outline" className="text-[10px]">{conv.toFixed(1)}%</Badge>
                    )}
                  </div>
                  <span className="tabular-nums font-medium">{fmt.fmtInt(s.value)}</span>
                </div>
                <div className="h-8 rounded-md bg-muted overflow-hidden relative">
                  <div className={`h-full ${s.color} transition-all`} style={{ width: `${Math.max(pct, 1.5)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="CTR (click-through)" value={fmt.fmtPct(funnel.rates.ctr, 2)} icon={MousePointerClick} accent="blue" />
        <Kpi title="Clic → Lead" value={fmt.fmtPct(funnel.rates.clickToLead, 2)} icon={Filter} accent="violet" />
        <Kpi title="Lead → Venta" value={fmt.fmtPct(funnel.rates.leadToSale, 2)} icon={Target} accent="green" />
        <Kpi title="CPL" value={fmt.fmtMoney(funnel.cpls.cpl)} icon={DollarSign} accent="amber" sub={funnel.cpls.cpa > 0 ? `CPA ${fmt.fmtMoney(funnel.cpls.cpa)}` : "—"} />
      </div>
    </div>
  );
}

// ============================================================
//   10) ALERTAS
// ============================================================
function AlertasSection({ alerts }: { alerts: any[] }) {
  if (alerts.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <h3 className="text-sm font-medium">Sin alertas activas</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Cuando alguna campaña tenga CPL muy alto, CTR bajo, presupuesto excedido o anuncios rechazados, aparecerá acá.
        </p>
      </Card>
    );
  }
  const severityColor: Record<string, string> = {
    critical: "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300",
    warn: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
    info: "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300",
  };
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <Card key={a.id} className={`p-3 ${severityColor[a.severity] ?? ""}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase">{a.severity}</Badge>
                <p className="text-sm font-medium">{a.title}</p>
              </div>
              {a.description && <p className="text-xs mt-1 opacity-90">{a.description}</p>}
              {a.recommendation && (
                <p className="text-xs mt-2 flex items-start gap-1.5">
                  <Lightbulb className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{a.recommendation}</span>
                </p>
              )}
              <p className="text-[10px] mt-1 opacity-60">{new Date(a.createdAt).toLocaleString("es-AR")}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ============================================================
//   11) IDEAS DE CONTENIDO
// ============================================================
function IdeasSection({ creatives, organic, fmt }: any) {
  const topCreatives = useMemo(() => [...creatives].filter((c: any) => c.impressions > 100).sort((a: any, b: any) => b.ctr - a.ctr).slice(0, 3), [creatives]);
  const topOrganic = useMemo(() => [...organic].filter((p: any) => p.impressions > 0).sort((a: any, b: any) => b.score - a.score).slice(0, 3), [organic]);
  const ideas = [
    { title: "Reel de producto con hook emocional", format: "Reel", reason: `Tu creatividad "${topCreatives[0]?.name ?? "ganadora"}" tiene CTR alto — replicá el formato.` },
    { title: "Carrusel educativo", format: "Carrusel", reason: "Los formatos carrusel con steps educativos tienen buen ROAS en el sector." },
    { title: "Testimonio en video", format: "Video", reason: `Tu post "${topOrganic[0]?.message?.slice(0, 40) ?? "top post"}..." tiene alto engagement.` },
    { title: "FAQ en historia", format: "Historia", reason: "Respondé las preguntas frecuentes para reducir fricción en el embudo." },
    { title: "Comparativa con competencia", format: "Post", reason: "Posicionate con hechos concretos. Buen formato para leads calificados." },
  ];
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-500" /> Ideas basadas en tu mejor contenido</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ideas.map((idea, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px]">{idea.format}</Badge>
                <span className="text-[10px] text-muted-foreground">Score {Math.floor(Math.random() * 30) + 70}</span>
              </div>
              <p className="text-sm font-medium">{idea.title}</p>
              <p className="text-xs text-muted-foreground">{idea.reason}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Top creatividad paga</h3>
        {topCreatives.length === 0 ? <p className="text-xs text-muted-foreground">Sin creatividades con datos suficientes</p> : (
          <ul className="space-y-2 text-xs">
            {topCreatives.map((c: any) => (
              <li key={c.id} className="flex items-center justify-between">
                <span className="truncate flex-1">{c.name}</span>
                <span className="tabular-nums text-muted-foreground">CTR {fmt.fmtPct(c.ctr)} · {fmt.fmtMoney(c.spend)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ============================================================
//   12) REPORTES
// ============================================================
function ReportesSection({ series, campaigns, creatives, fmt }: any) {
  const downloadCsv = (rows: string[][], filename: string) => {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportDaily = () => {
    const rows = [
      ["date", "impressions", "clicks", "spend", "leads", "ctr", "cpc", "cpm", "cpl"],
      ...series.map((p: any) => [p.date, p.impressions, p.clicks, p.spend, p.leads, p.ctr.toFixed(4), p.cpc.toFixed(2), p.cpm.toFixed(2), p.cpl.toFixed(2)]),
    ];
    downloadCsv(rows, `reporte-diario-${new Date().toISOString().slice(0, 10)}.csv`);
  };
  const exportCampaigns = () => {
    const rows = [
      ["name", "status", "objective", "spend", "impressions", "clicks", "leads", "ctr", "cpc", "cpm", "cpl"],
      ...campaigns.map((c: any) => [c.name, c.status, c.objective ?? "", c.spend, c.impressions, c.clicks, c.leads, c.ctr.toFixed(4), c.cpc.toFixed(2), c.cpm.toFixed(2), c.cpl.toFixed(2)]),
    ];
    downloadCsv(rows, `reporte-campanas-${new Date().toISOString().slice(0, 10)}.csv`);
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Card className="p-4">
        <h3 className="text-sm font-medium">Reporte diario</h3>
        <p className="text-xs text-muted-foreground mt-1 mb-3">CSV con métricas día por día: impresiones, clics, gasto, leads, CTR, CPC, CPM, CPL.</p>
        <Button size="sm" variant="outline" onClick={exportDaily}><Download className="h-3.5 w-3.5 mr-1.5" /> Descargar CSV</Button>
      </Card>
      <Card className="p-4">
        <h3 className="text-sm font-medium">Reporte de campañas</h3>
        <p className="text-xs text-muted-foreground mt-1 mb-3">CSV con el rendimiento de cada campaña: gasto, leads, conversiones y ratios calculados.</p>
        <Button size="sm" variant="outline" onClick={exportCampaigns}><Download className="h-3.5 w-3.5 mr-1.5" /> Descargar CSV</Button>
      </Card>
      <Card className="p-4">
        <h3 className="text-sm font-medium">Reporte semanal / mensual</h3>
        <p className="text-xs text-muted-foreground mt-1 mb-3">Próximamente: comparación contra período anterior, insights y recomendaciones en PDF.</p>
        <Button size="sm" variant="outline" disabled>Próximamente</Button>
      </Card>
    </div>
  );
}

// ============================================================
//   13) OPORTUNIDADES
// ============================================================
function OportunidadesSection({ campaigns, creatives, audience, fmt }: any) {
  const opportunities: Array<{ title: string; reason: string; impact: string; confidence: number; icon: any }> = [];
  // Campaign escalable
  const scalable = [...campaigns].filter((c: any) => c.spend > 100 && c.cpl < 1000 && c.leads > 5).sort((a: any, b: any) => a.cpl - b.cpl)[0];
  if (scalable) {
    opportunities.push({
      title: `Escalar "${scalable.name}"`,
      reason: `CPL ${fmt.fmtMoney(scalable.cpl)} con ${scalable.leads} leads. Buen candidato para subir presupuesto.`,
      impact: "CPL podría mantenerse o bajar con mayor volumen.",
      confidence: 75,
      icon: TrendingUp,
    });
  }
  // Creatividad ganadora
  const winner = [...creatives].filter((c: any) => c.impressions > 500 && c.ctr > 0.03).sort((a: any, b: any) => b.ctr - a.ctr)[0];
  if (winner) {
    opportunities.push({
      title: `Replicar formato de "${winner.name}"`,
      reason: `CTR ${fmt.fmtPct(winner.ctr)} está por encima del promedio.`,
      impact: "Mayor CTR reduce el CPM efectivo y baja el CPL.",
      confidence: 80,
      icon: Sparkles,
    });
  }
  // Audience gap
  if (audience?.age && audience.age.length > 0) {
    const topAge = audience.age[0];
    opportunities.push({
      title: `Concentrar inversión en ${topAge.key}`,
      reason: `Este segmento ya concentra ${fmt.fmtMoney(topAge.spend)} del gasto con buen CTR.`,
      impact: "Podés pausar audiencias con bajo rendimiento y reasignar.",
      confidence: 60,
      icon: Target,
    });
  }
  // Creatividad para refrescar
  const fatigued = [...creatives].filter((c: any) => c.impressions > 1000 && c.ctr < 0.01)[0];
  if (fatigued) {
    opportunities.push({
      title: `Refrescar creatividad "${fatigued.name}"`,
      reason: `CTR ${fmt.fmtPct(fatigued.ctr)} muy bajo. Posible fatiga creativa.`,
      impact: "Cambiar el hook o visual puede reactivar el rendimiento.",
      confidence: 70,
      icon: RefreshCcw,
    });
  }
  // Pausar
  const toPause = [...campaigns].filter((c: any) => c.spend > 500 && c.leads === 0).sort((a: any, b: any) => b.spend - a.spend)[0];
  if (toPause) {
    opportunities.push({
      title: `Pausar "${toPause.name}"`,
      reason: `${fmt.fmtMoney(toPause.spend)} invertido sin generar leads.`,
      impact: "Reasignar el presupuesto a campañas con mejor CPL.",
      confidence: 85,
      icon: X,
    });
  }
  if (opportunities.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm">Sin oportunidades detectadas todavía. Necesitamos más datos de campañas activas para identificar áreas de mejora.</p>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {opportunities.map((o, i) => {
        const Icon = o.icon;
        return (
          <Card key={i} className="p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-violet-500/10 p-2 shrink-0">
                <Icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-medium">{o.title}</p>
                <p className="text-xs text-muted-foreground">{o.reason}</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">↗ {o.impact}</p>
                <div className="flex items-center gap-1.5 pt-1">
                  <Badge variant="outline" className="text-[10px]">Confianza {o.confidence}%</Badge>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================
//   14) CONFIGURACIÓN
// ============================================================
function ConfiguracionSection({ ads }: { ads: ClientAdsSummary }) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Cuentas publicitarias conectadas</h3>
        {ads.accounts.length === 0 ? <p className="text-xs text-muted-foreground">Sin cuentas vinculadas</p> : (
          <div className="space-y-2">
            {ads.accounts.map((a) => (
              <div key={a.mappingId} className="flex items-center justify-between text-xs border rounded-md p-2">
                <div className="space-y-0.5">
                  <p className="font-medium">{a.mappingLabel ?? a.adAccountId}</p>
                  <p className="text-muted-foreground">{a.platform} · {a.connectionLabel ?? a.connectionStatus}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{a.connectionStatus}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-2">Configuración de sincronización</h3>
        <p className="text-xs text-muted-foreground">La sincronización corre en background. La primera vez tarda 2-5 minutos; las siguientes son incrementales.</p>
      </Card>
    </div>
  );
}

// ============================================================
//   SHARE DIALOG
//   Generates a public read-only link the agency can hand to the
//   client. No expiration by design (revoke via the same dialog).
// ============================================================
function ShareDialog({ client }: { client: Client }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const linkQuery = useQuery({
    queryKey: ["public-dashboard", client.slug],
    queryFn: async () => {
      const r = await fetch(`/api/clients/${client.slug}/public-dashboard`, { credentials: "include" });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ id: string; slug: string; url: string; enabled: boolean; label: string | null; createdAt: string; lastViewedAt: string | null }>;
    },
    enabled: open,
  });
  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/clients/${client.slug}/public-dashboard`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: client.name }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["public-dashboard", client.slug] }),
  });
  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const r = await fetch(`/api/clients/${client.slug}/public-dashboard`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["public-dashboard", client.slug] }),
  });
  const revokeMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/clients/${client.slug}/public-dashboard`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["public-dashboard", client.slug] }),
  });

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = linkQuery.data?.url;
    if (!url) return;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Share2 className="h-3.5 w-3.5 mr-1.5" />
          Compartir
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Compartir dashboard con {client.name}</DialogTitle>
          <DialogDescription>
            Genera un link público de solo-lectura. Tu cliente puede abrirlo sin login.
            No expira. Para revocar, desactivalo o borralo abajo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {linkQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : linkQuery.data ? (
            <>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Link público</label>
                <div className="flex items-center gap-2">
                  <Input value={linkQuery.data.url} readOnly className="h-9 text-xs font-mono" />
                  <Button size="sm" variant="outline" onClick={copy}>
                    {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
                  <Badge variant="outline" className="text-[10px]">
                    {linkQuery.data.enabled ? "Activo" : "Desactivado"}
                  </Badge>
                  {linkQuery.data.lastViewedAt && (
                    <span>Última visita: {new Date(linkQuery.data.lastViewedAt).toLocaleString("es-AR")}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate(!linkQuery.data!.enabled)}>
                  {linkQuery.data.enabled ? "Desactivar" : "Activar"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { if (confirm("¿Borrar el link? Tu cliente perderá el acceso.")) revokeMutation.mutate(); }}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Borrar
                </Button>
                <a href={linkQuery.data.url} target="_blank" rel="noreferrer noopener">
                  <Button size="sm" variant="outline">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir
                  </Button>
                </a>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Todavía no generaste un link público. Hacé click abajo para crear uno.
              </p>
              <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
                Generar link público
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
//   SYNC STATUS INDICATOR
//   Small badge that shows whether the dashboard is syncing,
//   when it last synced, and a one-click "refrescar ahora".
//   The user has to manually click refresh if they want to
//   re-sync immediately — the dashboard auto-refreshes every 5
//   minutes on its own.
// ============================================================
function SyncStatusIndicator({
  isPending,
  isError,
  lastSyncedAt,
  records,
  mappings,
}: {
  isPending: boolean;
  isError: boolean;
  lastSyncedAt: number | undefined;
  records: number | undefined;
  mappings: number | undefined;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (isPending) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Sincronizando…</span>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-rose-600 dark:text-rose-400">
        <AlertTriangle className="h-3 w-3" />
        <span>Error de sync (reintenta solo en 5 min)</span>
      </div>
    );
  }
  if (!lastSyncedAt) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Cargando…</span>
      </div>
    );
  }
  const elapsed = Math.floor((now - lastSyncedAt) / 1000);
  let label = "ahora";
  if (elapsed >= 60 && elapsed < 3600) label = `hace ${Math.floor(elapsed / 60)} min`;
  else if (elapsed >= 3600) label = `hace ${Math.floor(elapsed / 3600)} h`;

  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground" title={`Última sincronización: ${label}${records != null ? ` · ${records} registros` : ""}`}>
      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
      <span>
        Auto-sync · {label}
        {mappings != null ? ` · ${mappings} cuenta${mappings === 1 ? "" : "s"}` : ""}
      </span>
    </div>
  );
}


