// LMTM: Pauta en la app propia (07/10). Lo que hacía el hub viejo, sin
// duplicar el tablero: las cuentas que necesitan una mirada (semáforo de
// pauta: salud y oportunidades por cuenta, los peores primero) y cada una abre
// la sección Pauta de la ficha del cliente, que es el mismo tablero de siempre.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Lightbulb, Loader2, Search } from "lucide-react";
import { Link } from "@/lib/router";
import { api } from "../api/client";
import { Encabezado } from "./Shell";
import { TituloFranja } from "./HoyApp";
import { Panel } from "../lmtm/componentes";
import { Proporcion } from "../lmtm/graficos";
import { PautaGoogle } from "./PautaGoogle";

interface ClienteSemaforo {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  score: number | null;
  semaforo: "verde" | "amarillo" | "rojo" | "sin-pauta" | "sin-datos";
  oportunidades: string[];
}

const COLOR: Record<ClienteSemaforo["semaforo"], string> = {
  rojo: "var(--l-critico)",
  amarillo: "var(--l-atencion)",
  verde: "var(--l-bien)",
  "sin-pauta": "var(--l-neutro)",
  "sin-datos": "var(--l-neutro)",
};
const PALABRA: Record<ClienteSemaforo["semaforo"], string> = { rojo: "mal", amarillo: "a mirar", verde: "bien", "sin-pauta": "sin pauta", "sin-datos": "sin dato" };

export function PautaApp() {
  const [buscar, setBuscar] = useState("");
  const q = useQuery({
    queryKey: ["lmtm", "pauta", "semaforo"],
    queryFn: () => api.get<{ clientes: ClienteSemaforo[] }>("/growth/semaforo-pauta"),
    staleTime: 10 * 60_000,
  });
  const texto = buscar.trim().toLowerCase();
  const todos = (q.data?.clientes ?? []).filter((c) => !texto || c.name.toLowerCase().includes(texto));
  const atender = todos.filter((c) => c.semaforo === "rojo" || c.semaforo === "amarillo").sort((a, b) => (a.score ?? 999) - (b.score ?? 999));
  const bien = todos.filter((c) => c.semaforo === "verde").sort((a, b) => a.name.localeCompare(b.name));
  const sinPauta = todos.filter((c) => c.semaforo === "sin-pauta");
  const sinDatos = todos.filter((c) => c.semaforo === "sin-datos");
  // 20/11: una oportunidad que tienen casi todos (la de la fecha del mes) no dice nada por cliente: va una vez arriba.
  const conteo = new Map<string, number>();
  for (const c of todos) for (const o of new Set(c.oportunidades)) conteo.set(o, (conteo.get(o) ?? 0) + 1);
  const deTodos = [...conteo].filter(([, n]) => todos.length >= 4 && n / todos.length >= 0.5).map(([o]) => o);

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
      <div className="space-y-6 px-4 pb-10 md:px-8">
        {q.isLoading && (
          <p className="flex items-center gap-2 text-[14px] text-l-tinta-3">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculando el semáforo de cada cuenta…
          </p>
        )}
        {q.error && <p className="text-[14px] text-l-critico-texto">No se pudo cargar: {q.error instanceof Error ? q.error.message : "error"}</p>}
        {q.data && (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Panel titulo="Cómo están las cuentas" bajada="Puntaje de salud de cada cuenta con pauta (0 a 100)">
                <Proporcion
                  tramos={[
                    { etiqueta: "bien", valor: bien.length, tono: "bien", marca: "✓" },
                    { etiqueta: "para mirar", valor: atender.length, tono: "critico", marca: "!" },
                    { etiqueta: "sin dato", valor: sinDatos.length, tono: "neutro", marca: "·" },
                  ]}
                />
                {sinPauta.length > 0 && <p className="mt-4 text-[12px] text-l-tinta-3">{sinPauta.length} sin pauta activa no puntúan.</p>}
              </Panel>
              {deTodos.length > 0 && (
                <Panel titulo="Para casi todas" bajada={`Aparece en más de la mitad de las cuentas`}>
                  <ul className="space-y-2">
                    {deTodos.map((o) => (
                      <li key={o} className="flex gap-2 text-[14px] text-l-tinta-2">
                        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-l-marca" aria-hidden /> {o}
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <section>
                <TituloFranja>Para mirar · {atender.length}</TituloFranja>
                {atender.length === 0 ? <p className="text-[14px] text-l-tinta-2">Todas las cuentas con pauta están bien.</p> : <Lista clientes={atender} ocultar={deTodos} />}
              </section>
              {bien.length > 0 && (
                <section>
                  <TituloFranja>Bien · {bien.length}</TituloFranja>
                  <Lista clientes={bien} ocultar={deTodos} />
                </section>
              )}
            </div>
            {sinDatos.length > 0 && (
              <p className="text-[13px] text-l-tinta-3">
                Sin puntaje calculado ({sinDatos.length}): {sinDatos.map((c) => c.name).join(", ")}. No se sabe cómo están: no se pintan ni de verde ni de rojo.
              </p>
            )}
            {sinPauta.length > 0 && (
              <p className="text-[13px] text-l-tinta-3">
                Sin pauta activa ({sinPauta.length}): {sinPauta.map((c) => c.name).join(", ")}. No puntúan acá porque no hay campañas que mirar.
              </p>
            )}
          </>
        )}
        <PautaGoogle buscar={buscar} />
      </div>
    </>
  );
}

/** Cada cuenta con su puntaje en barra (0 a 100) y lo que tiene para mejorar que no es de todas. */
function Lista({ clientes, ocultar }: { clientes: ClienteSemaforo[]; ocultar: string[] }) {
  return (
    <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
      {clientes.map((c) => {
        const propias = c.oportunidades.filter((o) => !ocultar.includes(o));
        return (
        <li key={c.id} className="border-b border-l-linea last:border-b-0">
          <Link to={`/clientes/${c.slug}/dashboard`} className="flex items-center gap-3 px-4 py-3 text-inherit hover:bg-l-papel/60">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{c.name}</span>
              {propias.length > 0 && <span className="block truncate text-[12px] text-l-tinta-3">{propias.slice(0, 2).join(" · ")}</span>}
            </span>
            {c.score != null && (
              <span className="relative hidden h-2 w-28 shrink-0 rounded-full bg-l-linea sm:block" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${c.score}%`, background: COLOR[c.semaforo] }} />
              </span>
            )}
            <span className="w-24 shrink-0 text-right text-[12px] tabular-nums text-l-tinta-2">
              {c.score != null ? <span className="text-[15px] font-semibold text-l-tinta">{c.score}</span> : null} {PALABRA[c.semaforo]}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-l-tinta-3" aria-hidden />
          </Link>
        </li>
        );
      })}
    </ul>
  );
}
