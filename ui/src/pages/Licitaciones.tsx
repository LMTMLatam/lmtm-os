import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { api } from "../api/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Gavel, RefreshCw } from "lucide-react";

// Panel Licitaciones (pedido 22/7): oportunidades de Mercado Público
// (ChileCompra) que la agencia puede ofertar. El sync diario trae candidatas
// filtradas por keywords de marketing; el agente curador marca útiles con el
// por qué; acá el equipo las ve y también puede curar a mano.
interface Licitacion {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  organismo: string | null;
  region: string | null;
  moneda: string | null;
  montoEstimado: string | null;
  fechaCierre: string | null;
  url: string | null;
  estado: string;
  relevancia: string | null;
}

function diasAlCierre(fecha: string | null): { txt: string; urgente: boolean } {
  if (!fecha) return { txt: "sin fecha", urgente: false };
  const d = Math.ceil((new Date(fecha).getTime() - Date.now()) / 86_400_000);
  if (d < 0) return { txt: "cerrada", urgente: false };
  if (d === 0) return { txt: "cierra HOY", urgente: true };
  return { txt: `cierra en ${d} día${d === 1 ? "" : "s"}`, urgente: d <= 5 };
}

function LicitacionCard({ l, onMarcar }: { l: Licitacion; onMarcar: (codigo: string, estado: "util" | "descartada") => void }) {
  const [abierta, setAbierta] = useState(false);
  const cierre = diasAlCierre(l.fechaCierre);
  return (
    <Card className={`p-3 text-xs space-y-1.5 ${l.estado === "util" ? "border-emerald-500/30 bg-emerald-500/5" : ""}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {l.url ? <a href={l.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{l.nombre}</a> : <span className="font-medium">{l.nombre}</span>}
            <span className={`shrink-0 ${cierre.urgente ? "text-rose-500 font-semibold" : "text-muted-foreground"}`}>{cierre.txt}</span>
          </div>
          <div className="text-muted-foreground truncate">{l.organismo}{l.region ? ` · ${l.region}` : ""}{l.montoEstimado ? ` · ${l.moneda ?? ""} ${Number(l.montoEstimado).toLocaleString("es-CL")}` : ""} · {l.codigo}</div>
          {l.relevancia && <div className={l.estado === "util" ? "text-emerald-600" : "text-muted-foreground"}>{l.relevancia}</div>}
        </div>
        <div className="flex gap-1 shrink-0">
          {l.descripcion && <button onClick={() => setAbierta(!abierta)} className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted">{abierta ? "−" : "+"}</button>}
          {l.estado !== "util" && <button onClick={() => onMarcar(l.codigo, "util")} className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10">Útil</button>}
          {l.estado !== "descartada" && <button onClick={() => onMarcar(l.codigo, "descartada")} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted">Descartar</button>}
        </div>
      </div>
      {abierta && l.descripcion && <p className="text-muted-foreground whitespace-pre-wrap">{l.descripcion}</p>}
    </Card>
  );
}

export function Licitaciones() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: "Licitaciones" }]); }, [setBreadcrumbs]);
  const qc = useQueryClient();
  const [verArchivo, setVerArchivo] = useState(false);

  const q = useQuery({
    queryKey: ["licitaciones", verArchivo],
    queryFn: () => api.get<{ licitaciones: Licitacion[] }>(`/licitaciones?estado=${verArchivo ? "descartada,vencida" : "util,candidata"}`),
    staleTime: 5 * 60_000,
  });
  const marcar = useMutation({
    mutationFn: ({ codigo, estado }: { codigo: string; estado: "util" | "descartada" }) => {
      const relevancia = estado === "util" ? window.prompt("¿Por qué nos sirve? (queda en el panel)") ?? undefined : undefined;
      return api.patch(`/licitaciones/${encodeURIComponent(codigo)}`, { estado, relevancia });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["licitaciones"] }),
  });
  const sync = useMutation({
    mutationFn: () => api.post<{ activas: number; matcheadas: number; nuevas: number }>("/licitaciones/sync", {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["licitaciones"] }),
  });

  const rows = q.data?.licitaciones ?? [];
  const utiles = rows.filter((l) => l.estado === "util");
  const candidatas = rows.filter((l) => l.estado === "candidata");
  const onMarcar = (codigo: string, estado: "util" | "descartada") => marcar.mutate({ codigo, estado });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Gavel className="h-6 w-6 text-emerald-500" /> Licitaciones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Oportunidades de Mercado Público (ChileCompra) que podemos ofertar. Se sincroniza a diario y el agente curador marca las útiles con el porqué.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setVerArchivo(!verArchivo)} className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-muted">{verArchivo ? "Ver activas" : "Ver archivo"}</button>
          <button onClick={() => sync.mutate()} disabled={sync.isPending} className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-muted flex items-center gap-1 disabled:opacity-40">
            <RefreshCw className={`h-3 w-3 ${sync.isPending ? "animate-spin" : ""}`} /> {sync.isPending ? "Sincronizando…" : "Sincronizar ahora"}
          </button>
        </div>
      </div>

      {sync.data && <p className="text-[11px] text-muted-foreground">Sync: {sync.data.activas} activas en Mercado Público · {sync.data.matcheadas} matchean marketing · {sync.data.nuevas} nuevas guardadas.</p>}
      {q.isLoading && <Skeleton className="h-40 w-full" />}
      {q.isError && <p className="text-xs text-rose-500">No se pudieron cargar: {(q.error as Error).message}</p>}

      {!verArchivo && !q.isLoading && (
        <>
          <section className="space-y-2">
            <h2 className="font-medium text-sm">✅ Nos sirven ({utiles.length})</h2>
            {utiles.length === 0 && <p className="text-xs text-muted-foreground">Todavía ninguna marcada útil — el curador corre a diario, o marcá a mano desde "por revisar".</p>}
            {utiles.map((l) => <LicitacionCard key={l.codigo} l={l} onMarcar={onMarcar} />)}
          </section>
          <section className="space-y-2">
            <h2 className="font-medium text-sm">🔎 Por revisar ({candidatas.length})</h2>
            {candidatas.length === 0 && <p className="text-xs text-muted-foreground">Sin candidatas pendientes.</p>}
            {candidatas.map((l) => <LicitacionCard key={l.codigo} l={l} onMarcar={onMarcar} />)}
          </section>
        </>
      )}
      {verArchivo && !q.isLoading && (
        <section className="space-y-2">
          <h2 className="font-medium text-sm">Archivo — descartadas y vencidas ({rows.length})</h2>
          {rows.map((l) => <LicitacionCard key={l.codigo} l={l} onMarcar={onMarcar} />)}
        </section>
      )}
    </div>
  );
}
