// LMTM-OS: hub de Paid Media (review 27/7) — el MISMO tablero por cliente que
// vive en Clients → Dashboard, pero accesible desde el sidebar con un selector
// arriba para saltar de cliente en cliente sin navegar hacia atrás.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "@/lib/router";
import { clientsApi, type Client, type ClientAdsSummary } from "@/api/clients";
import { queryKeys } from "@/lib/queryKeys";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PaidMediaDashboard } from "./PaidMediaDashboard";
import { Megaphone, Search } from "lucide-react";
import { api } from "@/api/client";

interface ClienteSemaforo {
  id: string; name: string; slug: string; industry: string | null;
  score: number; semaforo: "verde" | "amarillo" | "rojo" | "sin-pauta";
  sinPauta?: boolean; oportunidades: string[];
}

/**
 * Qué atender hoy, cuando todavía no elegiste cliente.
 *
 * Antes esta pantalla arrancaba vacía ("Elegí un cliente arriba"): con 58
 * clientes eso es una página en blanco cada vez que entrás, y por eso el panel
 * figuraba como que no mostraba nada relevante (18/8).
 *
 * Reusa /growth/semaforo-pauta, que ya calcula salud y oportunidades por cuenta
 * — no hace falta otro endpoint. Se muestran SOLO los rojos y amarillos: los
 * verdes no necesitan que nadie los mire.
 */
function QueAtenderHoy({ onElegir }: { onElegir: (slug: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["growth", "semaforo"],
    queryFn: () => api.get<{ clientes: ClienteSemaforo[] }>("/growth/semaforo-pauta"),
    staleTime: 10 * 60_000,
    retry: false,
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  const todos = data?.clientes ?? [];
  // "sin-pauta" NO es un problema de Paid Media: es un cliente que no tiene
  // pauta contratada. Mezclarlos con los rojos dejaba 44 de 58 cuentas en la
  // lista de "atender hoy", o sea la misma manguera de siempre (18/8).
  const atender = todos.filter((c) => c.semaforo === "rojo" || c.semaforo === "amarillo")
    .sort((a, b) => a.score - b.score);
  const sinPauta = todos.filter((c) => c.semaforo === "sin-pauta");

  if (todos.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Elegí un cliente arriba para ver su tablero de pauta.
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-sm font-semibold">Qué atender hoy</h2>
        <span className="text-xs text-muted-foreground">
          {atender.length} de {todos.length - sinPauta.length} cuentas con pauta necesitan una mirada
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Los peores primero. Tocá una para abrir su tablero.</p>

      {atender.length === 0 ? (
        <p className="text-sm py-6 text-center">Todas las cuentas en verde. Nada urgente hoy.</p>
      ) : (
        <div className="space-y-1.5">
          {atender.map((c) => (
            <button
              key={c.id}
              onClick={() => onElegir(c.slug)}
              className="w-full text-left rounded-md border border-border p-2.5 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${c.semaforo === "rojo" ? "bg-rose-500" : "bg-amber-500"}`} />
                <span className="text-sm font-medium truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground ml-auto shrink-0">{c.score}/100</span>
              </div>
              {c.oportunidades.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1 pl-4.5">{c.oportunidades.slice(0, 2).join(" · ")}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {sinPauta.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
          {sinPauta.length} clientes sin pauta activa — no puntúan acá porque no hay campañas que mirar.
        </p>
      )}
    </Card>
  );
}

export function PaidMediaHub() {
  const [params, setParams] = useSearchParams();
  const selectedSlug = params.get("cliente") ?? "";
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);

  const clientsQuery = useQuery({
    queryKey: queryKeys.clients.list("active"),
    queryFn: () => clientsApi.list("active"),
  });
  const clients: Client[] = useMemo(
    () => [...(clientsQuery.data?.clients ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [clientsQuery.data],
  );

  const selected = clients.find((c) => c.slug === selectedSlug) ?? null;
  const filtered = filter.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()) || c.slug.includes(filter.toLowerCase()))
    : clients;

  const adsQuery = useQuery({
    queryKey: queryKeys.clients.adsSummary(selected?.slug ?? ""),
    queryFn: () => clientsApi.adsSummary(selected!.slug),
    enabled: !!selected,
    retry: false,
  });

  const pick = (slug: string) => {
    setParams({ cliente: slug }, { replace: true });
    setOpen(false);
    setFilter("");
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      {/* Selector de cliente: buscador con listado (como el de Clients). */}
      <Card className="p-3 relative">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-semibold shrink-0">
            <Megaphone className="h-4 w-4" /> Paid Media
          </div>
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={open ? filter : (selected?.name ?? "")}
              placeholder="Buscar cliente por nombre…"
              className="h-9 pl-8 text-sm"
              onFocus={() => { setOpen(true); setFilter(""); }}
              onChange={(e) => { setOpen(true); setFilter(e.target.value); }}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {open && (
              <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-md border bg-popover shadow-lg">
                {filtered.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                ) : filtered.map((c) => (
                  <button
                    key={c.id}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-foreground/5 ${c.slug === selectedSlug ? "font-semibold" : ""}`}
                    onMouseDown={() => pick(c.slug)}
                  >
                    {c.name}
                    {c.industry && <span className="text-[10px] text-muted-foreground ml-2">{c.industry}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected && <span className="text-xs text-muted-foreground shrink-0">{clients.length} clientes activos</span>}
        </div>
      </Card>

      {!selected ? (
        <QueAtenderHoy onElegir={pick} />
      ) : adsQuery.data ? (
        <PaidMediaDashboard key={selected.id} client={selected} ads={adsQuery.data as ClientAdsSummary} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </div>
  );
}
