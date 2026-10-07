// LMTM: Agentes (fase C1). Qué hizo cada rol, con el registro de pasos de cada
// corrida (cada herramienta: qué pidió y qué volvió) y lo verificado separado de
// lo supuesto. Y "pedirle algo" a un rol.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, OctagonAlert, Send, Wrench } from "lucide-react";
import { Link, useParams } from "@/lib/router";
import { carteraApi } from "../api/informes";
import { haceCuanto } from "../lmtm/formato";
import { agentesApi, nombreRol, ROLES, type EstadoTrabajo, type PasoAgente, type Trabajo } from "./api";
import { EstadoPunto, HallazgoAgente, Tarjeta, TituloFranja } from "./HoyApp";
import { Encabezado } from "./Shell";

const ESTADOS: Array<{ k: EstadoTrabajo | "todos"; label: string }> = [
  { k: "todos", label: "Todos" },
  { k: "hecho", label: "Hechos" },
  { k: "corriendo", label: "Corriendo" },
  { k: "pendiente", label: "En la cola" },
  { k: "fallo", label: "Fallaron" },
];

const MOTIVO: Record<Trabajo["motivo"], string> = { decision: "por una decisión", horario: "por horario", pedido: "por un pedido" };

export function AgentesApp() {
  const { id } = useParams<{ id?: string }>();
  return id ? <DetalleTrabajo id={id} /> : <ListaTrabajos />;
}

function ListaTrabajos() {
  const [estado, setEstado] = useState<EstadoTrabajo | "todos">("todos");
  const q = useQuery({
    queryKey: ["lmtm", "agentes", "lista", estado],
    queryFn: () => agentesApi.trabajos({ estado: estado === "todos" ? undefined : estado, limite: 200 }),
    refetchInterval: 20_000,
  });
  const cartera = useQuery({ queryKey: ["lmtm", "cartera"], queryFn: () => carteraApi.leer(), staleTime: 3 * 60_000 });
  const nombres = new Map((cartera.data?.clientes ?? []).map((c) => [c.clientId, c.cliente]));
  const ts = q.data?.trabajos ?? [];
  const tokens = ts.reduce((s, t) => s + (t.tokensEntrada ?? 0) + (t.tokensSalida ?? 0), 0);

  return (
    <>
      <Encabezado titulo="Agentes" bajada="Corren en el runner propio de LMTM: cada trabajo nace de un hecho y deja su registro." />
      <Roles />
      <div className="grid gap-8 px-4 md:px-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-3 flex gap-1.5 overflow-x-auto" role="tablist">
            {ESTADOS.map((e) => (
              <button
                key={e.k}
                type="button"
                role="tab"
                aria-selected={estado === e.k}
                onClick={() => setEstado(e.k)}
                className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] ${estado === e.k ? "border-l-tinta bg-l-tinta font-semibold text-l-papel" : "border-l-linea-2 text-l-tinta-2"}`}
              >
                {e.label}
              </button>
            ))}
          </div>
          {q.isLoading && <p className="text-[14px] text-l-tinta-3">Cargando…</p>}
          {q.error && <p className="text-[14px] text-l-critico-texto">No se pudo cargar: {q.error instanceof Error ? q.error.message : "error"}</p>}
          {q.data && ts.length === 0 && <p className="text-[14px] text-l-tinta-2">No hay trabajos con ese filtro.</p>}
          {ts.length > 0 && (
            <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
              {ts.map((t) => (
                <li key={t.id} className="border-b border-l-linea last:border-b-0">
                  <Link to={`/agentes/${t.id}`} className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-3.5 text-inherit hover:bg-l-papel/60">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-l-tinta-3">
                        <EstadoPunto estado={t.estado} />
                        <span className="font-semibold uppercase tracking-[0.06em] text-l-tinta-2">{nombreRol(t.rol)}</span>
                        {t.clientId && <span>· {nombres.get(t.clientId) ?? "cliente"}</span>}
                        <span>· {MOTIVO[t.motivo]}</span>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-[14px] leading-[1.45]">
                        {t.resultado?.resumen ?? (t.estado === "fallo" ? `No pudo terminar: ${t.error ?? "sin detalle"}` : t.estado === "corriendo" ? "Trabajando…" : "En la cola")}
                      </div>
                    </div>
                    <div className="text-right text-[12px] text-l-tinta-3">{haceCuanto(t.finishedAt ?? t.startedAt ?? t.createdAt)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="space-y-6">
          <Pedir clientes={(cartera.data?.clientes ?? []).map((c) => ({ id: c.clientId, nombre: c.cliente }))} />
          <Tarjeta>
            <TituloFranja>Consumo de la lista</TituloFranja>
            <p className="text-[13px] text-l-tinta-2">
              {ts.length} trabajos · {Math.round(tokens / 1000).toLocaleString("es-AR")} mil tokens (MiniMax)
            </p>
          </Tarjeta>
          <Tarjeta>
            <TituloFranja>Agentes de paperclip</TituloFranja>
            <p className="text-[13px] leading-[1.5] text-l-tinta-2">
              Los 14 agentes viejos siguen corriendo en paperclip mientras cada rol pasa al runner propio y supera al viejo en el evaluador.
            </p>
            <Link to="/agents/all" className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-l-marca">
              <Wrench className="h-3.5 w-3.5" aria-hidden /> Ver en Sistema
            </Link>
          </Tarjeta>
        </aside>
      </div>
    </>
  );
}

/**
 * Una tarjeta por rol, últimos 7 días. La nota del evaluador es código (las
 * reglas del playbook contra los números del día), no la opinión de otro agente;
 * al lado, la de los agentes de paperclip que hacen lo mismo, para comparar.
 */
function Roles() {
  const q = useQuery({ queryKey: ["lmtm", "agentes", "resumen"], queryFn: () => agentesApi.resumen(), refetchInterval: 120_000 });
  const roles = q.data?.roles ?? [];
  if (roles.length === 0) return null;
  const viejos = (q.data?.evaluador ?? []).filter((n) => !roles.some((r) => r.agente === n.agente));
  return (
    <div className="mb-6 grid gap-3 px-4 sm:grid-cols-2 md:px-8 xl:grid-cols-3">
      {roles.map((r) => (
        <Tarjeta key={r.rol}>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[15px] font-semibold">{nombreRol(r.rol)}</div>
            <div className="text-[12px] text-l-tinta-3">últimos 7 días</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            <span>
              <span className="font-semibold tabular-nums">{r.hechos}</span> <span className="text-l-tinta-3">hechos</span>
            </span>
            {r.fallos > 0 && (
              <span>
                <span className="font-semibold tabular-nums text-l-critico-texto">{r.fallos}</span> <span className="text-l-tinta-3">fallaron</span>
              </span>
            )}
            {r.enCurso > 0 && (
              <span>
                <span className="font-semibold tabular-nums">{r.enCurso}</span> <span className="text-l-tinta-3">en curso</span>
              </span>
            )}
            <span className="text-l-tinta-3">
              {Math.round(r.tokens / 1000).toLocaleString("es-AR")} mil tokens{r.segundos != null ? ` · ${r.segundos} s promedio` : ""}
            </span>
          </div>
          {r.evaluador && (
            <div className="mt-2 text-[13px]">
              <span className="font-semibold">
                {r.evaluador.defendibles}/{r.evaluador.propuestas}
              </span>{" "}
              <span className="text-l-tinta-2">propuestas defendibles según el evaluador</span>
              {viejos.map((v) => (
                <span key={v.agente} className="block text-[12px] text-l-tinta-3">
                  {v.agente} (paperclip): {v.defendibles}/{v.propuestas}
                </span>
              ))}
            </div>
          )}
        </Tarjeta>
      ))}
    </div>
  );
}

function Pedir({ clientes }: { clientes: Array<{ id: string; nombre: string }> }) {
  const qc = useQueryClient();
  const [rol, setRol] = useState(Object.keys(ROLES)[0]);
  const [clientId, setClientId] = useState("");
  const [pedido, setPedido] = useState("");
  const m = useMutation({
    mutationFn: () => agentesApi.pedir({ rol, clientId: clientId || null, pedido }),
    onSuccess: () => {
      setPedido("");
      void qc.invalidateQueries({ queryKey: ["lmtm", "agentes"] });
    },
  });
  return (
    <Tarjeta>
      <TituloFranja>Pedirle algo a un agente</TituloFranja>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <select value={rol} onChange={(e) => setRol(e.target.value)} className="h-10 w-full rounded-[10px] border border-l-linea-2 bg-l-sup px-2 text-[14px]">
          {Object.entries(ROLES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-10 w-full rounded-[10px] border border-l-linea-2 bg-l-sup px-2 text-[14px]">
          <option value="">Sin cliente (toda la cartera)</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <textarea
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          rows={3}
          placeholder="Ej.: revisá por qué subió el costo por consulta esta semana"
          className="w-full resize-y rounded-[10px] border border-l-linea-2 bg-l-sup px-3 py-2 text-[14px]"
        />
        <button
          type="submit"
          disabled={pedido.trim().length < 5 || m.isPending}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] bg-l-tinta px-3.5 text-[14px] font-semibold text-l-papel disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden /> {m.isPending ? "Mandando…" : "Pedir"}
        </button>
        {m.isSuccess && <p className="text-[13px] text-l-bien-texto">Quedó en la cola. Aparece en la lista en menos de un minuto.</p>}
        {m.error && <p className="text-[13px] text-l-critico-texto">{m.error instanceof Error ? m.error.message : "No se pudo."}</p>}
      </form>
    </Tarjeta>
  );
}

function DetalleTrabajo({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["lmtm", "agentes", "detalle", id],
    queryFn: () => agentesApi.trabajo(id),
    refetchInterval: (query) => (query.state.data?.trabajo.estado === "corriendo" || query.state.data?.trabajo.estado === "pendiente" ? 5_000 : false),
  });
  const t = q.data?.trabajo;
  const e = t?.entrada as { cliente?: { nombre?: string }; decision?: { que?: string }; pedido?: string; procedimiento?: string } | undefined;
  const duracion = t?.startedAt && t.finishedAt ? Math.round((new Date(t.finishedAt).getTime() - new Date(t.startedAt).getTime()) / 1000) : null;
  return (
    <>
      <Encabezado
        titulo={t ? nombreRol(t.rol) : "Trabajo"}
        bajada={
          <Link to="/agentes" className="inline-flex items-center gap-1 text-l-marca">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Todos los trabajos
          </Link>
        }
      />
      <div className="max-w-[860px] px-4 md:px-8">
        {q.isLoading && <p className="text-[14px] text-l-tinta-3">Cargando…</p>}
        {q.error && (
          <p className="flex gap-1.5 text-[14px] text-l-critico-texto">
            <OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> {q.error instanceof Error ? q.error.message : "error"}
          </p>
        )}
        {t && (
          <div className="space-y-5">
            <Tarjeta>
              <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-l-tinta-3">
                <EstadoPunto estado={t.estado} /> {t.estado} · {MOTIVO[t.motivo]} · {haceCuanto(t.createdAt)}
                {duracion != null && ` · ${duracion} s`}
                {t.turnos != null && ` · ${t.turnos} turnos`}
                {t.tokensEntrada != null && ` · ${Math.round(((t.tokensEntrada ?? 0) + (t.tokensSalida ?? 0)) / 1000)} mil tokens`}
              </div>
              {e?.cliente?.nombre && <div className="mt-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-l-tinta-2">{e.cliente.nombre}</div>}
              <div className="mt-0.5 text-[16px] font-medium leading-[1.4]">{e?.decision?.que ?? e?.pedido ?? e?.procedimiento}</div>
              <HallazgoAgente t={t} />
            </Tarjeta>
            <section>
              <TituloFranja>Cómo lo averiguó · {t.pasos.length} {t.pasos.length === 1 ? "paso" : "pasos"}</TituloFranja>
              {t.pasos.length === 0 ? (
                <p className="text-[13px] text-l-tinta-3">Sin pasos registrados.</p>
              ) : (
                <ol className="space-y-2">
                  {t.pasos.map((p, i) => (
                    <PasoTarjeta key={i} p={p} n={i + 1} />
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}

/** Una herramienta usada: qué pidió y qué volvió, plegado. */
function PasoTarjeta({ p, n }: { p: PasoAgente; n: number }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <li className="rounded-xl border border-l-linea bg-l-sup">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-l-papel text-[12px] font-semibold text-l-tinta-2">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="font-mono text-[13px] text-l-tinta">{p.herramienta}</span>
          <span className="ml-2 truncate text-[12px] text-l-tinta-3">{resumenEntrada(p.entrada)}</span>
        </span>
        {p.error && <span className="text-[12px] font-medium text-l-critico-texto">falló</span>}
        <ChevronDown className={`h-4 w-4 text-l-tinta-3 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {abierto && (
        <div className="space-y-2 border-t border-l-linea px-3.5 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-l-tinta-3">Pidió</div>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-l-papel p-2 text-[12px]">{JSON.stringify(p.entrada, null, 2)}</pre>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-l-tinta-3">Volvió</div>
            <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-l-papel p-2 text-[12px]">{p.salida}</pre>
          </div>
        </div>
      )}
    </li>
  );
}

function resumenEntrada(e: unknown): string {
  if (!e || typeof e !== "object") return "";
  return Object.entries(e as Record<string, unknown>)
    .filter(([k]) => k !== "clientId")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v)}`)
    .join(" · ");
}
