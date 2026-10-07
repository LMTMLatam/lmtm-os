// LMTM: Pauta en la app propia (07/10). Lo que hacía el hub viejo, sin
// duplicar el tablero: las cuentas que necesitan una mirada (semáforo de
// pauta: salud y oportunidades por cuenta, los peores primero) y cada una abre
// la sección Pauta de la ficha del cliente, que es el mismo tablero de siempre.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { Link } from "@/lib/router";
import { api } from "../api/client";
import { Encabezado } from "./Shell";
import { TituloFranja } from "./HoyApp";

interface ClienteSemaforo {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  score: number;
  semaforo: "verde" | "amarillo" | "rojo" | "sin-pauta";
  oportunidades: string[];
}

const COLOR: Record<ClienteSemaforo["semaforo"], string> = {
  rojo: "var(--l-critico)",
  amarillo: "var(--l-atencion)",
  verde: "var(--l-bien)",
  "sin-pauta": "var(--l-neutro)",
};
const PALABRA: Record<ClienteSemaforo["semaforo"], string> = { rojo: "mal", amarillo: "a mirar", verde: "bien", "sin-pauta": "sin pauta" };

export function PautaApp() {
  const [buscar, setBuscar] = useState("");
  const q = useQuery({
    queryKey: ["lmtm", "pauta", "semaforo"],
    queryFn: () => api.get<{ clientes: ClienteSemaforo[] }>("/growth/semaforo-pauta"),
    staleTime: 10 * 60_000,
  });
  const texto = buscar.trim().toLowerCase();
  const todos = (q.data?.clientes ?? []).filter((c) => !texto || c.name.toLowerCase().includes(texto));
  const atender = todos.filter((c) => c.semaforo === "rojo" || c.semaforo === "amarillo").sort((a, b) => a.score - b.score);
  const bien = todos.filter((c) => c.semaforo === "verde").sort((a, b) => a.name.localeCompare(b.name));
  const sinPauta = todos.filter((c) => c.semaforo === "sin-pauta");

  return (
    <>
      <Encabezado
        titulo="Pauta"
        bajada="Las cuentas que necesitan una mirada, las peores primero. Cada una abre su tablero en la ficha del cliente."
        derecha={
          <label className="relative block w-[220px] max-w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-l-tinta-3" aria-hidden />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar cliente"
              className="h-9 w-full rounded-full border border-l-linea-2 bg-l-sup pl-8 pr-3 text-[13px] text-l-tinta outline-none focus:border-l-marca"
            />
          </label>
        }
      />
      <div className="max-w-[960px] space-y-8 px-4 pb-10 md:px-8">
        {q.isLoading && (
          <p className="flex items-center gap-2 text-[14px] text-l-tinta-3">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculando el semáforo de cada cuenta…
          </p>
        )}
        {q.error && <p className="text-[14px] text-l-critico-texto">No se pudo cargar: {q.error instanceof Error ? q.error.message : "error"}</p>}
        {q.data && (
          <>
            <section>
              <TituloFranja>Para mirar · {atender.length}</TituloFranja>
              {atender.length === 0 ? (
                <p className="text-[14px] text-l-tinta-2">Todas las cuentas con pauta están bien.</p>
              ) : (
                <Lista clientes={atender} />
              )}
            </section>
            {bien.length > 0 && (
              <section>
                <TituloFranja>Bien · {bien.length}</TituloFranja>
                <Lista clientes={bien} />
              </section>
            )}
            {sinPauta.length > 0 && (
              <p className="text-[13px] text-l-tinta-3">
                Sin pauta activa ({sinPauta.length}): {sinPauta.map((c) => c.name).join(", ")}. No puntúan acá porque no hay campañas que mirar.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Lista({ clientes }: { clientes: ClienteSemaforo[] }) {
  return (
    <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
      {clientes.map((c) => (
        <li key={c.id} className="border-b border-l-linea last:border-b-0">
          <Link to={`/clientes/${c.slug}/dashboard`} className="flex items-center gap-3 px-4 py-3 text-inherit hover:bg-l-papel/60">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR[c.semaforo] }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{c.name}</span>
              {c.oportunidades.length > 0 && <span className="block truncate text-[12px] text-l-tinta-3">{c.oportunidades.slice(0, 2).join(" · ")}</span>}
            </span>
            <span className="shrink-0 text-right text-[12px] tabular-nums text-l-tinta-3">
              {c.score}/100 · {PALABRA[c.semaforo]}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-l-tinta-3" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
