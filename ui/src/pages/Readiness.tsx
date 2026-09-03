// LMTM-OS: onboarding-readiness / coverage matrix.
//
// Makes the system's own gaps visible: which active clients are "dark" (no Meta
// mapping → empty dashboard) and what each is missing (rubro, location, script,
// sheets). Gaps used to be discovered by accident (LoMasFundas, SRP, the 45
// unmapped clients) — this surfaces them all, ranked worst-first, each linking
// to where it's fixed.

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { readinessApi, type ReadinessClient } from "../api/readiness";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCheck, Check, X, AlertTriangle } from "lucide-react";

const CHECK_LABELS: Record<string, string> = {
  metaAdAccount: "Cuenta Meta",
  googleAdAccount: "Cuenta Google",
  metaPage: "Página Meta",
  rubro: "Rubro",
  location: "Ubicación",
  sheetRedes: "Sheet redes",
  scriptRedes: "Script",
  sheetProduccion: "Sheet prod.",
  brain: "Brain",
};
// Where each gap gets fixed (relative to the company prefix root).
const FIX_LINK: Record<string, string> = {
  metaAdAccount: "/company/settings/integrations/ads",
  googleAdAccount: "/company/settings/integrations/ads",
  metaPage: "/company/settings/integrations/ads",
};

function Cell({ ok }: { ok: boolean }) {
  return ok
    ? <Check className="h-3.5 w-3.5 text-emerald-500" />
    : <X className="h-3.5 w-3.5 text-rose-500/70" />;
}

function Row({ c }: { c: ReadinessClient }) {
  return (
    <tr className="border-t border-border hover:bg-muted/30">
      <td className="py-1.5 pr-3">
        <div className="flex items-center gap-2">
          {c.dark && <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />}
          <Link to={`/c/${c.slug}`} className="text-sm hover:underline truncate max-w-[180px]">{c.name}</Link>
        </div>
      </td>
      <td className="py-1.5 pr-3 text-xs text-muted-foreground">{c.industry ?? "—"}</td>
      {Object.keys(CHECK_LABELS).map((k) => (
        <td key={k} className="py-1.5 text-center">
          {FIX_LINK[k] && !(c.checks as Record<string, boolean>)[k]
            ? <Link to={FIX_LINK[k]} title="Ir a mapear"><Cell ok={false} /></Link>
            : <Cell ok={(c.checks as Record<string, boolean>)[k]} />}
        </td>
      ))}
      <td className="py-1.5 pl-3 text-right">
        <span className={`text-xs font-medium tabular-nums ${c.readyPct >= 75 ? "text-emerald-500" : c.readyPct >= 50 ? "text-amber-500" : "text-rose-500"}`}>{c.readyPct}%</span>
      </td>
    </tr>
  );
}

/**
 * La matriz convertida en trabajo.
 *
 * La tabla de 58 filas por 9 casilleros dice el estado pero no dice qué hacer:
 * hay que leerla columna por columna y sacar la cuenta uno mismo. Acá se
 * agrupan los huecos por TIPO, ordenados por cuántos clientes afecta cada uno,
 * porque arreglar una cosa para 32 clientes rinde más que nueve cosas de uno.
 *
 * Solo se listan los huecos que alguien puede ir a arreglar hoy.
 */
function QueHacer({ clientes }: { clientes: ReadinessClient[] }) {
  const huecos = Object.keys(CHECK_LABELS)
    .map((k) => ({
      clave: k,
      etiqueta: CHECK_LABELS[k],
      link: FIX_LINK[k] ?? null,
      faltan: clientes.filter((c) => !(c.checks as Record<string, boolean>)[k]),
    }))
    .filter((h) => h.faltan.length > 0)
    .sort((a, b) => b.faltan.length - a.faltan.length);

  if (huecos.length === 0) {
    return (
      <Card className="p-4 border-l-4 border-l-emerald-500">
        <p className="text-sm">Sin huecos: todos los clientes activos están completos.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold mb-1">Qué hacer ({huecos.length})</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Ordenado por cuántos clientes destraba cada arreglo. El detalle completo está en la tabla de abajo.
      </p>
      <div className="space-y-2.5">
        {huecos.map((h) => (
          <div key={h.clave} className="border-l-2 border-l-amber-500/50 pl-3">
            <p className="text-sm">
              <span className="font-medium">{h.etiqueta}</span>
              <span className="text-muted-foreground"> — falta en {h.faltan.length} cliente{h.faltan.length > 1 ? "s" : ""}</span>
              {h.link && <Link to={h.link} className="text-xs underline ml-2">ir a cargarlo</Link>}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {h.faltan.slice(0, 8).map((c) => c.name).join(", ")}
              {h.faltan.length > 8 ? ` y ${h.faltan.length - 8} más` : ""}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Readiness() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: "Readiness" }]); }, [setBreadcrumbs]);

  const { data, isLoading } = useQuery({ queryKey: ["readiness"], queryFn: () => readinessApi.get(), staleTime: 5 * 60_000 });
  const t = data?.totals;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-sky-500" /> Readiness
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Estado de onboarding por cliente. Los "a oscuras" (sin Meta) tienen dashboard vacío — ahí no hay datos para trabajar.
        </p>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {t && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4"><div className="text-xs text-muted-foreground mb-1">Clientes activos</div><div className="text-2xl font-semibold">{t.clients}</div></Card>
          <Card className="p-4 border-rose-500/30"><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-rose-500" />A oscuras (sin Meta)</div><div className="text-2xl font-semibold text-rose-500">{t.dark}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground mb-1">Con rubro</div><div className="text-2xl font-semibold">{t.rubro}/{t.clients}</div></Card>
          <Card className="p-4"><div className="text-xs text-muted-foreground mb-1">Con ubicación</div><div className="text-2xl font-semibold">{t.location}/{t.clients}</div></Card>
        </div>
      )}

      {data && <QueHacer clientes={data.clients} />}

      {data && (
        <details className="[&[open]>summary]:mb-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground select-none">
            Matriz completa por cliente
          </summary>
        <Card className="p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left font-medium pb-1">Cliente</th>
                <th className="text-left font-medium pb-1">Rubro</th>
                {Object.values(CHECK_LABELS).map((l) => <th key={l} className="font-medium pb-1 px-1 text-center whitespace-nowrap">{l}</th>)}
                <th className="text-right font-medium pb-1">Listo</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c) => <Row key={c.id} c={c} />)}
            </tbody>
          </table>
        </Card>
        </details>
      )}
    </div>
  );
}
