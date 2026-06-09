// LMTM-OS: Public dashboard UI
// A read-only view of the per-client dashboard, accessible without a login
// at /public/dashboards/:slug. The slug is a server-issued token that
// resolves to a public_dashboards row; if `enabled = true`, the page
// renders.
//
// Auto-refreshes every 60s so the client always sees fresh data without
// having to manually reload.

import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboard,
  Wallet,
  Megaphone,
  Globe2,
  FileText,
  TrendingUp,
  Target,
  Eye,
  MousePointerClick,
  DollarSign,
  Activity,
  AlertCircle,
  Image as ImageIcon,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  RefreshCcw,
  BarChart3,
} from "lucide-react";

const REFRESH_MS = 60_000;

interface PublicClient {
  id: string;
  slug: string;
  name: string;
  currency: string;
}
interface PublicHeader {
  label: string | null;
  enabled: boolean;
  createdAt: string;
  lastViewedAt: string | null;
}
interface TimeseriesPoint {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  conversions: number;
  reach: number;
  videoViews: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpl: number;
}
interface FunnelData {
  impressions: number;
  clicks: number;
  landingVisits: number;
  leads: number;
  conversions: number;
  spend: number;
  revenue: number;
  reach: number;
  rates: {
    ctr: number;
    clickToLanding: number;
    landingToLead: number;
    clickToLead: number;
    leadToSale: number;
    clickToSale: number;
  };
  cpls: {
    cpc: number;
    cpl: number;
    cpa: number;
    roas: number;
  };
}
interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpl: number;
}
interface CampaignsResponse {
  client: PublicClient;
  since: string;
  until: string;
  totals: { spend: number; impressions: number; clicks: number; leads: number; ctr: number; cpc: number; cpm: number };
  campaigns: Campaign[];
}
interface OrganicPost {
  id: string;
  pageId: string;
  message: string;
  postType: string;
  createdTime: string | null;
  permalinkUrl: string | null;
  fullPicture: string | null;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
  videoViews: number;
  impressions: number;
  engaged: number;
  engagementRate: number;
  score: number;
}

type Section = "resumen" | "presupuesto" | "campanas" | "organica" | "posts" | "leads";

const SECTIONS: Array<{ value: Section; label: string; icon: typeof LayoutDashboard }> = [
  { value: "resumen", label: "Resumen", icon: LayoutDashboard },
  { value: "presupuesto", label: "Presupuesto y saldo", icon: Wallet },
  { value: "campanas", label: "Campañas", icon: Megaphone },
  { value: "organica", label: "Página orgánica", icon: Globe2 },
  { value: "posts", label: "Posts y contenido", icon: FileText },
  { value: "leads", label: "Leads / Conversiones", icon: Target },
];

// ============================================================
//   Fetch helpers
// ============================================================
async function apiPublic<T>(slug: string, path: string, params?: { since?: string; until?: string }): Promise<T> {
  const sp = new URLSearchParams();
  if (params?.since) sp.set("since", params.since);
  if (params?.until) sp.set("until", params.until);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  const r = await fetch(`/api/public/dashboards/${slug}${path}${qs}`, { credentials: "omit" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

function useFormatters(currency: string) {
  return useMemo(() => {
    const fmtMoney = (n: number, max = 0) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: max }).format(n);
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

function TrendChart({ series, metric, height = 56, color = "bg-blue-500" }: { series: TimeseriesPoint[]; metric: keyof TimeseriesPoint; height?: number; color?: string }) {
  if (series.length === 0) return <div className="h-14 flex items-center justify-center text-xs text-muted-foreground">Sin datos</div>;
  const max = Math.max(...series.map((p) => Number(p[metric] ?? 0)), 1);
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {series.map((p, i) => {
        const v = Number(p[metric] ?? 0);
        const pct = max > 0 ? (v / max) * 100 : 0;
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm ${v > 0 ? color : "bg-muted/40"}`}
            style={{ height: `${Math.max(pct, 1.5)}%` }}
            title={`${p.date}: ${v.toLocaleString("en-US")}`}
          />
        );
      })}
    </div>
  );
}

function Kpi({ title, value, sub, icon: Icon, accent = "blue" }: { title: string; value: string; sub?: string; icon: typeof DollarSign; accent?: "blue" | "green" | "amber" | "rose" | "violet" }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">{title}</p>
          <p className="text-xl font-semibold tabular-nums truncate">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
        </div>
        <div className={`shrink-0 rounded-md p-1.5 ${colors[accent]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
    </Card>
  );
}

// ============================================================
//   Main public page
// ============================================================
export function PublicDashboard() {
  const { slug } = useParams<{ slug: string }>();

  const headerQuery = useQuery({
    queryKey: ["public", "dashboards", slug],
    queryFn: () => apiPublic<{ client: PublicClient; dashboard: PublicHeader }>(slug!, ""),
    enabled: !!slug,
    refetchInterval: REFRESH_MS,
    retry: false,
  });

  if (headerQuery.isLoading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-3 max-w-md">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
          <p className="text-xs text-muted-foreground">Cargando dashboard…</p>
        </div>
      </div>
    );
  }

  if (headerQuery.isError) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <Card className="p-6 max-w-md w-full">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-sm">Dashboard no disponible</h3>
              <p className="text-xs text-muted-foreground mt-1">{(headerQuery.error as Error).message}</p>
              <p className="text-xs text-muted-foreground mt-2">El link puede haber sido revocado. Pedile uno nuevo a tu agencia.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const { client, dashboard } = headerQuery.data!;
  return <PublicDashboardInner slug={slug!} client={client} dashboard={dashboard} />;
}

function PublicDashboardInner({ slug, client, dashboard }: { slug: string; client: PublicClient; dashboard: PublicHeader }) {
  const today = useMemo(() => new Date(), []);
  const defaultSince = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, [today]);
  const defaultUntil = useMemo(() => today.toISOString().slice(0, 10), [today]);

  const [range, setRange] = useState({ since: defaultSince, until: defaultUntil });
  const [activeSection, setActiveSection] = useState<Section>("resumen");
  const [now, setNow] = useState(Date.now());
  const fmt = useFormatters(client.currency);

  // Auto-refresh timestamp display
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const tsQuery = useQuery({
    queryKey: ["public", "timeseries", slug, range.since, range.until],
    queryFn: () => apiPublic<{ client: PublicClient; since: string; until: string; series: TimeseriesPoint[] }>(slug, "/timeseries", range),
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  const funnelQuery = useQuery({
    queryKey: ["public", "funnel", slug, range.since, range.until],
    queryFn: () => apiPublic<{ funnel: FunnelData }>(slug, "/funnel", range),
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  const campaignsQuery = useQuery({
    queryKey: ["public", "campaigns", slug, range.since, range.until],
    queryFn: () => apiPublic<CampaignsResponse>(slug, "/campaigns", range),
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  const organicQuery = useQuery({
    queryKey: ["public", "organic", slug],
    queryFn: () => apiPublic<{ posts: OrganicPost[] }>(slug, "/organic"),
    refetchInterval: REFRESH_MS,
    retry: false,
  });

  const funnel = funnelQuery.data?.funnel;
  const series = tsQuery.data?.series ?? [];
  const campaigns = campaignsQuery.data?.campaigns ?? [];
  const organic = organicQuery.data?.posts ?? [];

  const totalSpend = funnel?.spend ?? 0;
  const totalImpr = funnel?.impressions ?? 0;
  const totalClicks = funnel?.clicks ?? 0;
  const totalLeads = funnel?.leads ?? 0;
  const ctr = funnel?.rates.ctr ?? 0;
  const cpl = funnel?.cpls.cpl ?? 0;
  const cpc = funnel?.cpls.cpc ?? 0;
  const cpm = totalImpr > 0 ? (totalSpend / totalImpr) * 1000 : 0;
  const roas = funnel?.cpls.roas ?? 0;
  const frequency = totalImpr > 0 && (funnel?.reach ?? 0) > 0 ? totalImpr / (funnel!.reach) : 0;
  const activeCampaigns = campaigns.filter((c) => c.status?.toLowerCase() === "active").length;

  const lastSync = useMemo(() => {
    const elapsed = Math.floor((now - (tsQuery.dataUpdatedAt ?? now)) / 1000);
    if (elapsed < 5) return "ahora";
    if (elapsed < 60) return `hace ${elapsed}s`;
    if (elapsed < 3600) return `hace ${Math.floor(elapsed / 60)} min`;
    return `hace ${Math.floor(elapsed / 3600)} h`;
  }, [now, tsQuery.dataUpdatedAt]);

  const renderSection = () => {
    switch (activeSection) {
      case "resumen": return <ResumenPublic series={series} campaigns={campaigns} totalSpend={totalSpend} totalImpr={totalImpr} totalClicks={totalClicks} totalLeads={totalLeads} ctr={ctr} cpl={cpl} cpc={cpc} cpm={cpm} roas={roas} frequency={frequency} activeCampaigns={activeCampaigns} organic={organic} fmt={fmt} funnel={funnel} />;
      case "presupuesto": return <PresupuestoPublic totalSpend={totalSpend} series={series} campaigns={campaigns} fmt={fmt} />;
      case "campanas": return <CampanasPublic campaigns={campaigns} fmt={fmt} />;
      case "organica": return <OrganicaPublic posts={organic} fmt={fmt} />;
      case "posts": return <PostsPublic posts={organic} fmt={fmt} />;
      case "leads": return <LeadsPublic funnel={funnel} fmt={fmt} />;
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <BarChart3 className="h-5 w-5 text-foreground shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base font-semibold truncate">{client.name}</h1>
              <p className="text-[10px] text-muted-foreground">Dashboard público · {dashboard.label ?? client.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <RefreshCcw className="h-3 w-3" />
            <span>Actualizado {lastSync}</span>
            <span className="hidden sm:inline">· auto-refresh 60s</span>
          </div>
        </div>
        {/* Date range + section nav */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-2 flex-wrap">
          <DateRangePicker since={range.since} until={range.until} defaultUntil={defaultUntil} onChange={setRange} />
          <nav className="flex flex-wrap gap-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = s.value === activeSection;
              return (
                <button
                  key={s.value}
                  onClick={() => setActiveSection(s.value)}
                  className={`text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors ${
                    isActive ? "bg-foreground/5 text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {renderSection()}
      </main>

      <footer className="border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-[10px] text-muted-foreground text-center">
          Powered by LMTM-OS · {dashboard.label ?? client.name}
        </div>
      </footer>
    </div>
  );
}

// ============================================================
//   Date range picker (same UX as the admin dashboard)
// ============================================================
function DateRangePicker({ since, until, defaultUntil, onChange }: { since: string; until: string; defaultUntil: string; onChange: (n: { since: string; until: string }) => void }) {
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-0.5">
        <label className="text-[9px] uppercase tracking-wide text-muted-foreground">Desde</label>
        <input
          type="date"
          value={since}
          max={until}
          onChange={(e) => onChange({ since: e.target.value, until })}
          className="h-7 px-2 text-xs border rounded-md bg-background"
        />
      </div>
      <div className="space-y-0.5">
        <label className="text-[9px] uppercase tracking-wide text-muted-foreground">Hasta</label>
        <input
          type="date"
          value={until}
          min={since}
          max={defaultUntil}
          onChange={(e) => onChange({ since, until: e.target.value })}
          className="h-7 px-2 text-xs border rounded-md bg-background"
        />
      </div>
    </div>
  );
}

// ============================================================
//   Sections
// ============================================================
function ResumenPublic({ series, campaigns, totalSpend, totalImpr, totalClicks, totalLeads, ctr, cpl, cpc, cpm, roas, frequency, activeCampaigns, organic, fmt, funnel }: any) {
  const topCampaigns = [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 5);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Kpi title="Inversión" value={fmt.fmtMoney(totalSpend)} icon={DollarSign} accent="blue" sub="Período seleccionado" />
        <Kpi title="Leads" value={fmt.fmtInt(totalLeads)} icon={Target} accent="green" sub={cpl > 0 ? `CPL ${fmt.fmtMoney(cpl)}` : "—"} />
        <Kpi title="Conversiones" value={fmt.fmtInt(funnel?.conversions ?? 0)} icon={TrendingUp} accent="green" sub={roas > 0 ? `ROAS ${roas.toFixed(2)}x` : "—"} />
        <Kpi title="CTR" value={fmt.fmtPct(ctr, 2)} icon={MousePointerClick} accent="violet" sub={`CPC ${fmt.fmtMoney(cpc, 2)}`} />
        <Kpi title="Impresiones" value={fmt.fmtInt(totalImpr)} icon={Eye} accent="rose" sub={`${fmt.fmtCompact(funnel?.reach ?? 0)} alcance`} />
        <Kpi title="CPM" value={fmt.fmtMoney(cpm, 0)} icon={Activity} accent="amber" sub={`Frecuencia ${frequency.toFixed(2)}`} />
        <Kpi title="Clics" value={fmt.fmtInt(totalClicks)} icon={MousePointerClick} accent="violet" />
        <Kpi title="Campañas activas" value={fmt.fmtInt(activeCampaigns)} icon={Megaphone} accent="blue" sub={`${campaigns.length} totales`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Inversión diaria</h3>
            <Badge variant="outline" className="text-[10px]">Total {fmt.fmtMoney(totalSpend)}</Badge>
          </div>
          {series.length === 0 ? <Skeleton className="h-14 w-full" /> : <TrendChart series={series} metric="spend" color="bg-blue-500" />}
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Leads diarios</h3>
            <Badge variant="outline" className="text-[10px]">Total {fmt.fmtInt(totalLeads)}</Badge>
          </div>
          {series.length === 0 ? <Skeleton className="h-14 w-full" /> : <TrendChart series={series} metric="leads" color="bg-emerald-500" />}
        </Card>
      </div>
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-500" /> Top 5 campañas por inversión</h3>
        {topCampaigns.length === 0 ? <p className="text-xs text-muted-foreground">Sin datos en el período</p> : (
          <div className="space-y-2">
            {topCampaigns.map((c: Campaign) => {
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

function PresupuestoPublic({ totalSpend, series, campaigns, fmt }: any) {
  const monthlyBudget = campaigns.reduce((a: number, c: any) => a + ((c.dailyBudget ?? 0) * 30), 0);
  const consumedPct = monthlyBudget > 0 ? (totalSpend / monthlyBudget) * 100 : 0;
  const overBudget = monthlyBudget > 0 && totalSpend > monthlyBudget;
  const days = series.length || 1;
  const avgDaily = totalSpend / days;
  const today = new Date();
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysRemaining = Math.max(1, endOfMonth.getDate() - today.getDate());
  const projected = avgDaily * (daysRemaining + today.getDate());
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Gasto del período" value={fmt.fmtMoney(totalSpend)} icon={DollarSign} accent="blue" />
        <Kpi title="Promedio diario" value={fmt.fmtMoney(avgDaily, 2)} icon={Activity} accent="violet" />
        <Kpi title="Proyección cierre" value={fmt.fmtMoney(projected, 0)} icon={TrendingUp} accent="amber" sub={`${daysRemaining} días restantes`} />
        <Kpi title="Presupuesto mensual" value={monthlyBudget > 0 ? fmt.fmtMoney(monthlyBudget) : "—"} icon={Wallet} accent="rose" sub={monthlyBudget > 0 ? `${consumedPct.toFixed(0)}% consumido` : "—"} />
      </div>
      {monthlyBudget > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3">Presupuesto consumido</h3>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div className={`h-full ${overBudget ? "bg-rose-500" : consumedPct > 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(consumedPct, 100)}%` }} />
          </div>
        </Card>
      )}
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Evolución diaria</h3>
        {series.length === 0 ? <Skeleton className="h-16 w-full" /> : <TrendChart series={series} metric="spend" height={80} color="bg-blue-500" />}
      </Card>
    </div>
  );
}

function CampanasPublic({ campaigns, fmt }: { campaigns: Campaign[]; fmt: any }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium mb-3">Campañas ({campaigns.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 px-2 font-medium">Campaña</th>
              <th className="py-2 px-2 font-medium">Estado</th>
              <th className="py-2 px-2 font-medium text-right">Inversión</th>
              <th className="py-2 px-2 font-medium text-right">Clics</th>
              <th className="py-2 px-2 font-medium text-right">CTR</th>
              <th className="py-2 px-2 font-medium text-right">CPL</th>
              <th className="py-2 px-2 font-medium text-right">Leads</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Sin campañas</td></tr>
            ) : campaigns.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="py-2 px-2 font-medium max-w-[200px] truncate" title={c.name}>{c.name}</td>
                <td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{c.status}</Badge></td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtMoney(c.spend)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtInt(c.clicks)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtPct(c.ctr)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{c.cpl > 0 ? fmt.fmtMoney(c.cpl) : "—"}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt.fmtInt(c.leads)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function OrganicaPublic({ posts, fmt }: { posts: OrganicPost[]; fmt: any }) {
  const t = posts.reduce((a, p) => ({ impressions: a.impressions + p.impressions, engaged: a.engaged + p.engaged, reactions: a.reactions + p.reactions, comments: a.comments + p.comments, shares: a.shares + p.shares }), { impressions: 0, engaged: 0, reactions: 0, comments: 0, shares: 0 });
  const er = t.impressions > 0 ? t.engaged / t.impressions : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Publicaciones" value={fmt.fmtInt(posts.length)} icon={FileText} accent="blue" />
        <Kpi title="Impresiones" value={fmt.fmtCompact(t.impressions)} icon={Eye} accent="violet" />
        <Kpi title="Engagement Rate" value={fmt.fmtPct(er, 2)} icon={Activity} accent="green" />
        <Kpi title="Interacciones" value={fmt.fmtCompact(t.reactions + t.comments + t.shares)} icon={Sparkles} accent="rose" />
      </div>
    </div>
  );
}

function PostsPublic({ posts, fmt }: { posts: OrganicPost[]; fmt: any }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium mb-3">Publicaciones ({posts.length})</h3>
      {posts.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">Sin publicaciones</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {posts.slice(0, 12).map((p) => (
            <div key={p.id} className="border rounded-lg overflow-hidden">
              {p.fullPicture && (
                <div className="aspect-video bg-muted">
                  <img src={p.fullPicture} alt="" className="w-full h-full object-cover" loading="lazy" />
                </div>
              )}
              <div className="p-3 space-y-1">
                <p className="text-xs line-clamp-3">{p.message || "(sin texto)"}</p>
                <div className="grid grid-cols-4 gap-2 text-[10px] pt-2 border-t">
                  <div><p className="text-muted-foreground">Reacs</p><p className="font-medium">{fmt.fmtInt(p.reactions)}</p></div>
                  <div><p className="text-muted-foreground">Com.</p><p className="font-medium">{fmt.fmtInt(p.comments)}</p></div>
                  <div><p className="text-muted-foreground">Shares</p><p className="font-medium">{fmt.fmtInt(p.shares)}</p></div>
                  <div><p className="text-muted-foreground">ER</p><p className="font-medium">{fmt.fmtPct(p.engagementRate)}</p></div>
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

function LeadsPublic({ funnel, fmt }: { funnel?: FunnelData; fmt: any }) {
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
                    {conv != null && <Badge variant="outline" className="text-[10px]">{conv.toFixed(1)}%</Badge>}
                  </div>
                  <span className="tabular-nums font-medium">{fmt.fmtInt(s.value)}</span>
                </div>
                <div className="h-8 rounded-md bg-muted overflow-hidden">
                  <div className={`h-full ${s.color}`} style={{ width: `${Math.max(pct, 1.5)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="CTR" value={fmt.fmtPct(funnel.rates.ctr, 2)} icon={MousePointerClick} accent="blue" />
        <Kpi title="Clic → Lead" value={fmt.fmtPct(funnel.rates.clickToLead, 2)} icon={Target} accent="violet" />
        <Kpi title="Lead → Venta" value={fmt.fmtPct(funnel.rates.leadToSale, 2)} icon={Target} accent="green" />
        <Kpi title="CPL" value={fmt.fmtMoney(funnel.cpls.cpl)} icon={DollarSign} accent="amber" sub={funnel.cpls.cpa > 0 ? `CPA ${fmt.fmtMoney(funnel.cpls.cpa)}` : "—"} />
      </div>
    </div>
  );
}
