// LMTM-OS: agency-wide Growth panel.
//
// Aggregates real data only — no invented metrics. Ad spend/leads trend and
// issue throughput come straight from ads_insights / issues. The "ideas"
// section surfaces the weekly growth-roundtable debates (see
// services/growth-roundtable.ts) and their follow-up proposals, which are
// real child issues (issues.parentId), not text-matched guesses.

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { growthApi, type GrowthSpendPoint, type GrowthThroughputPoint } from "../api/growth";
import { AgentEfficiencyCard } from "../components/AgentEfficiencyCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { statusBadge, statusBadgeDefault } from "@/lib/status-colors";
import { TrendingUp, Building2, DollarSign, Filter, CheckCircle2, Lightbulb } from "lucide-react";

// Spend is a cross-client sum, only meaningful in a single currency; the server
// sends the shared currency (or null if clients bill in mixed currencies).
function fmtMoney(n: number, currency: string | null): string {
  if (!currency) return `${new Intl.NumberFormat("es-AR").format(Math.round(n))} (multi-moneda)`;
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}
function fmtInt(n: number): string {
  return new Intl.NumberFormat("es-AR").format(Math.round(n));
}

function Kpi({ label, value, icon: Icon }: { label: string; value: string; icon: typeof DollarSign }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
    </Card>
  );
}

function BarRow({ points, metric, color, currency }: { points: GrowthSpendPoint[]; metric: "spend" | "leads"; color: string; currency: string | null }) {
  if (points.length === 0) return <div className="h-14 flex items-center justify-center text-xs text-muted-foreground">Sin datos</div>;
  const max = Math.max(...points.map((p) => p[metric]), 1);
  return (
    <div className="flex items-end gap-[2px]" style={{ height: 56 }}>
      {points.map((p, i) => {
        const v = p[metric];
        const pct = max > 0 ? (v / max) * 100 : 0;
        return (
          <div key={i} className={`flex-1 rounded-sm ${v > 0 ? color : "bg-muted/40"}`} style={{ height: `${Math.max(pct, 2)}%` }}
            title={`${p.date}: ${metric === "spend" ? fmtMoney(v, currency) : fmtInt(v)}`} />
        );
      })}
    </div>
  );
}

function ThroughputChart({ points }: { points: GrowthThroughputPoint[] }) {
  if (points.length === 0) return <div className="h-16 flex items-center justify-center text-xs text-muted-foreground">Sin datos</div>;
  const max = Math.max(...points.flatMap((p) => [p.created, p.done]), 1);
  return (
    <div className="flex items-end gap-2" style={{ height: 72 }}>
      {points.map((p, i) => (
        <div key={i} className="flex-1 flex items-end gap-[2px]" title={`Semana ${p.week}: creados ${p.created}, cerrados ${p.done}`}>
          <div className="flex-1 rounded-sm bg-sky-500/70" style={{ height: `${Math.max((p.created / max) * 100, 2)}%` }} />
          <div className="flex-1 rounded-sm bg-emerald-500/70" style={{ height: `${Math.max((p.done / max) * 100, 2)}%` }} />
        </div>
      ))}
    </div>
  );
}

const statusColor = (status: string): string => statusBadge[status] ?? statusBadgeDefault;

export function Growth() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: "Growth" }]); }, [setBreadcrumbs]);

  // Data changes at most daily (ads sync) / hourly (issues); a 10-min staleTime
  // avoids re-running the 6-query aggregate on every window refocus.
  const { data, isLoading } = useQuery({ queryKey: ["growth", "overview"], queryFn: () => growthApi.overview(), staleTime: 10 * 60_000 });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-emerald-500" /> Growth
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Salud y crecimiento de la agencia: pauta agregada, pulso operativo, y las ideas que salen de la mesa redonda semanal.
        </p>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Clientes activos" value={fmtInt(data.kpis.activeClients)} icon={Building2} />
            <Kpi label="Pauta 30d (agregado)" value={fmtMoney(data.kpis.spend30d, data.kpis.spendCurrency)} icon={DollarSign} />
            <Kpi label="Leads 30d (agregado)" value={fmtInt(data.kpis.leads30d)} icon={Filter} />
            <Kpi label="Issues cerrados (últ. semana)" value={fmtInt(data.kpis.issuesDoneThisWeek)} icon={CheckCircle2} />
          </div>

          <Card className="p-5">
            <h2 className="font-medium mb-3">Pauta agregada — últimos 30 días</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Spend</p>
                <BarRow points={data.spendTrend} metric="spend" color="bg-blue-500" currency={data.kpis.spendCurrency} />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Leads</p>
                <BarRow points={data.spendTrend} metric="leads" color="bg-emerald-500" currency={data.kpis.spendCurrency} />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">Pulso operativo — issues por semana (últimas 8)</h2>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sky-500/70" />creados</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500/70" />cerrados</span>
              </div>
            </div>
            <ThroughputChart points={data.issuesThroughput} />
          </Card>

          <AgentEfficiencyCard />

          <div>
            <h2 className="font-medium flex items-center gap-2 mb-3"><Lightbulb className="h-4 w-4 text-amber-500" />Ideas de la mesa redonda semanal</h2>
            {data.roundtables.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no corrió ninguna mesa redonda.</p>
            ) : (
              <div className="space-y-3">
                {data.roundtables.map((rt) => (
                  <Card key={rt.id} className="p-4">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Badge className={`text-[10px] px-1.5 py-0 ${statusColor(rt.status)}`}>{rt.status}</Badge>
                      <Link to={`/issues/${rt.id}`} className="text-sm font-medium hover:underline">{rt.category}</Link>
                      <span className="text-[10px] text-muted-foreground ml-auto">{new Date(rt.createdAt).toLocaleDateString("es-AR")}</span>
                    </div>
                    {rt.proposals.length === 0 ? (
                      <p className="text-xs text-muted-foreground pl-1">Sin propuestas de seguimiento (todavía).</p>
                    ) : (
                      <div className="space-y-1 pl-1">
                        {rt.proposals.map((p) => (
                          <Link key={p.id} to={`/issues/${p.id}`} className="flex items-center gap-2 text-sm hover:bg-muted/50 rounded px-1.5 py-1 -mx-1.5">
                            <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${statusColor(p.status)}`}>{p.status}</Badge>
                            {p.identifier && <span className="text-[10px] text-muted-foreground shrink-0">{p.identifier}</span>}
                            <span className="truncate">{p.title}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
