// Agent-efficiency card for the Growth panel: how much of the agent fleet's
// runs go to REAL client work vs self-maintenance (recovery, productivity
// reviews, liveness). Lets us see whether the maxTurns fix reduced the
// recovery cascade and where effort is being spent.

import { useQuery } from "@tanstack/react-query";
import { growthApi } from "../api/growth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Gauge } from "lucide-react";

export function AgentEfficiencyCard() {
  const { data, isLoading } = useQuery({ queryKey: ["growth", "agent-efficiency"], queryFn: () => growthApi.agentEfficiency(), staleTime: 10 * 60_000 });

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Gauge className="h-4 w-4 text-violet-500" />
        <h2 className="font-medium">Eficiencia de agentes {data && <span className="text-xs text-muted-foreground font-normal">(últimos {data.days}d)</span>}</h2>
      </div>
      {isLoading && <Skeleton className="h-24 w-full" />}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div><p className="text-xs text-muted-foreground">Trabajo real</p><p className="text-xl font-semibold text-emerald-500">{data.totals.realRuns}</p></div>
            <div><p className="text-xs text-muted-foreground">Auto-mantenimiento</p><p className="text-xl font-semibold text-amber-500">{data.totals.maintenanceRuns} <span className="text-sm">({data.totals.maintenancePct}%)</span></p></div>
            <div><p className="text-xs text-muted-foreground">Runs fallidos</p><p className="text-xl font-semibold text-rose-500">{data.totals.failedRuns} <span className="text-sm">({data.totals.failedPct}%)</span></p></div>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden bg-muted flex mb-3">
            <div className="bg-emerald-500" style={{ width: `${100 - data.totals.maintenancePct}%` }} />
            <div className="bg-amber-500" style={{ width: `${data.totals.maintenancePct}%` }} />
          </div>
          <div className="space-y-1">
            {data.byAgent.slice(0, 8).map((a) => {
              const tot = a.real + a.maintenance;
              return (
                <div key={a.agent} className="flex items-center gap-2 text-xs">
                  <span className="w-32 truncate text-muted-foreground shrink-0">{a.agent}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted flex">
                    <div className="bg-emerald-500/70" style={{ width: `${tot ? (a.real / tot) * 100 : 0}%` }} />
                    <div className="bg-amber-500/70" style={{ width: `${tot ? (a.maintenance / tot) * 100 : 0}%` }} />
                  </div>
                  <span className="tabular-nums text-muted-foreground shrink-0 w-16 text-right">{a.real}/{tot}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
