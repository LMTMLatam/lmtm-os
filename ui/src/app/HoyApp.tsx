// LMTM: Hoy como bandeja (fase C1). Lo que cambió respecto de la lista de B2:
//  · filtros (aprobar / equipo / cliente) y búsqueda, y agrupar por cliente;
//  · cada fila se abre en el lugar: por qué completo, lo que encontró el agente
//    y la acción, sin salir de la pantalla;
//  · al costado, lo que hicieron los agentes (escritorio).
// Modelo de la bandeja: avisar / preguntar / aprobar (Agent Inbox, ver
// docs/rediseno/INVESTIGACION.md).

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronDown, Loader2, OctagonAlert, Search, Sparkles, WifiOff } from "lucide-react";
import { Link } from "@/lib/router";
import { decisionesApi, type Decision, type Fuente, type Hoy } from "../api/decisiones";
import { AccionesDecision, BarraCobertura, BloqueIncidente, LeyendaCobertura, Plata, PorQue } from "../lmtm/componentes";
import { etiquetaResponsable, fechaLarga, haceCuanto, horaCorta, pesos, tocaLaPauta } from "../lmtm/formato";
import { frasePlegadas, plegarSinPlata } from "../lmtm/plegar";
import { agentesApi, nombreRol, type Trabajo } from "./api";
import { Encabezado } from "./Shell";

type Filtro = "todo" | "aprobar" | "equipo" | "cliente";
const FILTROS: Array<{ k: Filtro; label: string; pasa: (d: Decision) => boolean }> = [
  { k: "todo", label: "Todo", pasa: () => true },
  { k: "aprobar", label: "Para aprobar", pasa: (d) => tocaLaPauta(d.accion) },
  { k: "equipo", label: "Equipo", pasa: (d) => d.responsable === "equipo" && !tocaLaPauta(d.accion) },
  { k: "cliente", label: "Cliente", pasa: (d) => d.responsable === "cliente" },
];
const NOMBRE_FUENTE: Record<Fuente, string> = { meta_ads: "Meta", google_ads: "Google", organico: "Redes" };

export function HoyApp() {
  const hoy = useQuery({ queryKey: ["lmtm", "hoy"], queryFn: () => decisionesApi.hoy(), staleTime: 60_000, refetchInterval: 5 * 60_000 });
  const trabajos = useQuery({
    queryKey: ["lmtm", "agentes", "trabajos"],
    queryFn: () => agentesApi.trabajos({ limite: 300 }),
    refetchInterval: 60_000,
  });
  const porDecision = useMemo(() => {
    const m = new Map<string, Trabajo>();
    // Vienen del más nuevo al más viejo: el primero de cada decisión es el que vale.
    for (const t of trabajos.data?.trabajos ?? []) if (t.ref?.startsWith("decision:") && !m.has(t.ref.slice(9))) m.set(t.ref.slice(9), t);
    return m;
  }, [trabajos.data]);

  return (
    <>
      <Encabezado
        titulo="Hoy"
        bajada={
          <>
            {fechaLarga(new Date())}
            {hoy.data?.ultimaCorrida ? ` · decisiones actualizadas a las ${horaCorta(hoy.data.ultimaCorrida)}` : ""}
          </>
        }
        derecha={hoy.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-l-tinta-3" aria-label="Actualizando" /> : null}
      />
      <div className="px-4 md:px-8">
        {hoy.isLoading && <p className="text-[14px] text-l-tinta-3">Cargando…</p>}
        {hoy.error && (
          <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert">
            <OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se pudo cargar Hoy: {hoy.error instanceof Error ? hoy.error.message : "error"}
          </p>
        )}
        {hoy.data && <Contenido h={hoy.data} porDecision={porDecision} trabajos={trabajos.data?.trabajos ?? []} />}
      </div>
    </>
  );
}

function Contenido({ h, porDecision, trabajos }: { h: Hoy; porDecision: Map<string, Trabajo>; trabajos: Trabajo[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [buscar, setBuscar] = useState("");
  const [agrupar, setAgrupar] = useState(false);
  const [verTodas, setVerTodas] = useState(false);
  const texto = buscar.trim().toLowerCase();
  const filtradas = h.decisiones.filter(FILTROS.find((f) => f.k === filtro)!.pasa).filter((d) => !texto || d.cliente.toLowerCase().includes(texto) || d.que.toLowerCase().includes(texto));
  // Todo lo que tiene plata se ve; de lo que no, unas pocas y el resto contado
  // en una línea (lmtm/plegar.ts). Buscando o filtrando se ve todo lo que pasa.
  const { visibles: aLaVista, plegadas, porFamilia } = plegarSinPlata(filtradas);
  const plegar = !verTodas && filtro === "todo" && !texto;
  const visibles = plegar ? aLaVista : filtradas;
  const investigadas = h.decisiones.filter((d) => porDecision.get(d.id)?.estado === "hecho").length;
  const hechosHoy = trabajos.filter((t) => t.estado === "hecho" && t.finishedAt && Date.now() - new Date(t.finishedAt).getTime() < 86_400_000).length;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        {h.whatsapp === "desconectado" && (
          <p className="mb-5 flex gap-2 rounded-xl border-l-[3px] border-l-l-critico bg-l-critico-suave px-3 py-2.5 text-[14px]" role="alert">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-l-critico" aria-hidden />
            <span>
              <span className="font-semibold">El WhatsApp de avisos está desconectado.</span> Mientras siga así no sale ningún aviso.
            </span>
          </p>
        )}

        {/* Arriba SOLO los incidentes (PLAN, superficies): lo que no puede esperar
            va antes que cualquier número. */}
        {h.incidentes.length > 0 && (
          <section className="mb-7">
            <TituloFranja critico>Incidentes · {h.incidentes.length}</TituloFranja>
            <ul>
              {h.incidentes.map((d) => (
                <BloqueIncidente key={d.id} d={d} />
              ))}
            </ul>
          </section>
        )}

        {/* Los tres números del día. La plata es el héroe. */}
        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
          <Tarjeta>
            <div className="text-[13px] font-medium text-l-tinta-2">Plata parada por día</div>
            {h.plataParada != null ? (
              <div className="mt-1 text-[44px] font-semibold leading-none tracking-[-0.03em]">{pesos(h.plataParada)}</div>
            ) : (
              <div className="mt-1 text-[24px] italic text-l-tinta-3">sin dato</div>
            )}
            <div className="mt-1.5 text-[12px] text-l-tinta-3">
              {h.plataParada != null && `en ${h.clientesParados} ${h.clientesParados === 1 ? "cliente" : "clientes"} · `}datos hasta ayer
            </div>
          </Tarjeta>
          <Tarjeta>
            <div className="text-[13px] font-medium text-l-tinta-2">Para decidir</div>
            <div className="mt-1 text-[32px] font-semibold leading-none tracking-[-0.02em]">{h.incidentes.length + h.decisiones.length}</div>
            <div className="mt-1.5 text-[12px] text-l-tinta-3">
              {h.incidentes.length > 0 ? `${h.incidentes.length} ${h.incidentes.length === 1 ? "incidente" : "incidentes"} · ` : ""}
              {h.decisiones.filter((d) => tocaLaPauta(d.accion)).length} para aprobar
            </div>
          </Tarjeta>
          <Tarjeta>
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-l-tinta-2">
              <Bot className="h-4 w-4" aria-hidden /> Agentes
            </div>
            <div className="mt-1 text-[32px] font-semibold leading-none tracking-[-0.02em]">{hechosHoy}</div>
            <div className="mt-1.5 text-[12px] text-l-tinta-3">
              trabajos en 24 h · {investigadas} {investigadas === 1 ? "decisión investigada" : "decisiones investigadas"}
            </div>
          </Tarjeta>
        </div>

        <section className="mt-7">
          <div className="sticky top-0 z-10 -mx-4 bg-l-papel/95 px-4 pb-3 pt-2 backdrop-blur md:-mx-8 md:px-8">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtrar decisiones">
                {FILTROS.map((f) => {
                  const n = h.decisiones.filter(f.pasa).length;
                  const activo = f.k === filtro;
                  return (
                    <button
                      key={f.k}
                      type="button"
                      role="tab"
                      aria-selected={activo}
                      onClick={() => setFiltro(f.k)}
                      className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] transition-colors ${activo ? "border-l-tinta bg-l-tinta font-semibold text-l-papel" : "border-l-linea-2 text-l-tinta-2 hover:border-l-tinta-3"}`}
                    >
                      {f.label} <span className={activo ? "opacity-70" : "text-l-tinta-3"}>{n}</span>
                    </button>
                  );
                })}
              </div>
              <label className="relative ml-auto min-w-[180px] flex-1 sm:max-w-[240px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-l-tinta-3" aria-hidden />
                <input
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Buscar cliente o tema"
                  className="h-9 w-full rounded-full border border-l-linea-2 bg-l-sup pl-8 pr-3 text-[13px] text-l-tinta outline-none focus:border-l-marca"
                />
              </label>
              <label className="flex min-h-9 cursor-pointer items-center gap-1.5 text-[13px] text-l-tinta-2">
                <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} className="accent-[var(--l-marca)]" />
                Por cliente
              </label>
            </div>
          </div>

          {visibles.length === 0 ? (
            <p className="mt-4 text-[14px] text-l-tinta-2">{h.decisiones.length === 0 ? "No hay nada para decidir. Si algo cambia, aparece acá." : "Nada con ese filtro."}</p>
          ) : agrupar ? (
            <Agrupadas decisiones={visibles} porDecision={porDecision} />
          ) : (
            <Lista decisiones={visibles} porDecision={porDecision} />
          )}
          {plegar && plegadas.length > 0 && (
            <div className="mt-3 text-[14px] text-l-tinta-2">
              <p>
                {plegadas.length === 1 ? "Queda 1 más sin plata medida" : `Quedan ${plegadas.length} más sin plata medida`}: {frasePlegadas(porFamilia)}.
              </p>
              <button type="button" onClick={() => setVerTodas(true)} className="mt-1 inline-flex min-h-10 items-center gap-1 font-semibold text-l-marca">
                Ver las {plegadas.length} <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
        </section>

        {h.esperando.length > 0 && (
          <section className="mt-8">
            <TituloFranja>Hecho, esperando el dato · {h.esperando.length}</TituloFranja>
            <ul className="space-y-1.5 text-[14px] text-l-tinta-2">
              {h.esperando.map((d) => (
                <li key={d.id}>
                  <span className="font-medium text-l-tinta">{d.cliente}</span> · {d.que}
                  {d.ejecutadaAt && <span className="text-l-tinta-3"> · {haceCuanto(d.ejecutadaAt)}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
        <Tarjeta>
          <div className="mb-3 flex items-center justify-between">
            <TituloFranja sinMargen>Lo que hicieron los agentes</TituloFranja>
            <Link to="/agentes" className="text-[12px] font-semibold text-l-marca">
              Ver todo
            </Link>
          </div>
          <FeedAgentes trabajos={trabajos.slice(0, 8)} />
        </Tarjeta>
        <Tarjeta>
          <TituloFranja>Qué estamos viendo</TituloFranja>
          {h.cobertura ? (
            <>
              {(Object.keys(NOMBRE_FUENTE) as Fuente[]).map((f) => (
                <BarraCobertura key={f} nombre={NOMBRE_FUENTE[f]} conteo={h.cobertura!.porFuente[f]} total={h.cobertura!.clientes} />
              ))}
              <LeyendaCobertura />
            </>
          ) : (
            <p className="text-[13px] italic text-l-tinta-3">sin dato: no se pudo leer la salud de las fuentes</p>
          )}
        </Tarjeta>
      </aside>
    </div>
  );
}

export function Tarjeta({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-l-linea bg-l-sup p-4 ${className}`}>{children}</div>;
}

export function TituloFranja({ children, critico, sinMargen }: { children: React.ReactNode; critico?: boolean; sinMargen?: boolean }) {
  return <h2 className={`${sinMargen ? "" : "mb-3"} text-[12px] font-semibold uppercase tracking-[0.08em] ${critico ? "text-l-critico-texto" : "text-l-tinta-2"}`}>{children}</h2>;
}

function Lista({ decisiones, porDecision }: { decisiones: Decision[]; porDecision: Map<string, Trabajo> }) {
  return (
    <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
      {decisiones.map((d) => (
        <FilaAbrible key={d.id} d={d} agente={porDecision.get(d.id)} />
      ))}
    </ul>
  );
}

function Agrupadas({ decisiones, porDecision }: { decisiones: Decision[]; porDecision: Map<string, Trabajo> }) {
  const grupos = new Map<string, Decision[]>();
  for (const d of decisiones) grupos.set(d.clienteSlug, [...(grupos.get(d.clienteSlug) ?? []), d]);
  const total = (ds: Decision[]) => ds.reduce((s, d) => s + (d.arsPorDia ?? 0), 0);
  const orden = [...grupos.values()].sort((a, b) => total(b) - total(a));
  return (
    <div className="space-y-4">
      {orden.map((ds) => (
        <div key={ds[0].clienteSlug} className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
          <div className="flex items-baseline justify-between gap-3 border-b border-l-linea px-4 py-2.5">
            <Link to={`/clientes/${ds[0].clienteSlug}`} className="text-[13px] font-semibold uppercase tracking-[0.06em] text-l-tinta hover:text-l-marca">
              {ds[0].cliente}
            </Link>
            <span className="text-[12px] text-l-tinta-3">
              {ds.length} · {total(ds) > 0 ? `${pesos(total(ds))} por día` : "sin plata medida"}
            </span>
          </div>
          <ul>
            {ds.map((d) => (
              <FilaAbrible key={d.id} d={d} agente={porDecision.get(d.id)} sinCliente />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Una decisión: cerrada es una línea; abierta trae el por qué, el agente y la acción. */
function FilaAbrible({ d, agente, sinCliente }: { d: Decision; agente?: Trabajo; sinCliente?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <li className="border-b border-l-linea last:border-b-0">
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-expanded={abierta}
        className={`grid w-full grid-cols-[1fr_auto] gap-x-3 px-4 py-3.5 text-left transition-colors hover:bg-l-papel/60 ${abierta ? "bg-l-papel/60" : ""}`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {!sinCliente && <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-l-tinta-2">{d.cliente}</span>}
            <Chip>{tocaLaPauta(d.accion) ? "Para aprobar" : etiquetaResponsable(d.responsable)}</Chip>
            {agente && <ChipAgente t={agente} />}
          </div>
          <div className="mt-0.5 text-[15px] font-medium leading-[1.4]">{d.que}</div>
        </div>
        <div className="flex items-start gap-2 text-right">
          <Plata valor={d.arsPorDia} />
          <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-l-tinta-3 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden />
        </div>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ${abierta ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          {abierta && (
            <div className="px-4 pb-4">
              <PorQue d={d} max={6} />
              {agente && <HallazgoAgente t={agente} />}
              <div className="flex flex-wrap items-center gap-x-4">
                <AccionesDecision d={d} />
                <Link to={`/clientes/${d.clienteSlug}`} className="mt-3 text-[13px] font-semibold text-l-marca">
                  Ver el cliente
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Chip({ children, tono }: { children: React.ReactNode; tono?: "marca" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tono === "marca" ? "bg-l-marca-suave text-l-marca" : "bg-l-papel text-l-tinta-2"}`}>
      {children}
    </span>
  );
}

function ChipAgente({ t }: { t: Trabajo }) {
  if (t.estado === "hecho") return <Chip tono="marca"><Sparkles className="h-3 w-3" aria-hidden /> Investigado</Chip>;
  if (t.estado === "corriendo" || t.estado === "pendiente") return <Chip tono="marca"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Investigando</Chip>;
  return null;
}

/** Lo que encontró el agente: separado en verificado y supuesto, como lo devolvió. */
export function HallazgoAgente({ t }: { t: Trabajo }) {
  const r = t.resultado;
  if (t.estado !== "hecho" || !r) {
    // El error técnico va en Agentes (ahí se diagnostica); acá, castellano.
    return t.estado === "fallo" ? (
      <p className="mt-3 text-[13px] text-l-tinta-3">
        El {nombreRol(t.rol).toLowerCase()} intentó averiguarlo y no pudo terminar; se reintenta solo.{" "}
        <Link to={`/agentes/${t.id}`} className="font-semibold text-l-marca">
          Ver qué pasó
        </Link>
      </p>
    ) : null;
  }
  return (
    <div className="mt-3 rounded-xl border border-l-marca/25 bg-l-marca-suave/60 p-3">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-l-marca">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> {nombreRol(t.rol)} · {t.finishedAt ? haceCuanto(t.finishedAt) : ""}
      </div>
      {r.resumen && <p className="mt-1 text-[14px] font-medium leading-[1.45] text-l-tinta">{r.resumen}</p>}
      {(r.verificado?.length ?? 0) > 0 && (
        <ul className="mt-2 space-y-0.5 text-[13px] text-l-tinta-2">
          {r.verificado!.map((v, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-l-bien" aria-hidden>✓</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      )}
      {(r.supuestos?.length ?? 0) > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[13px] text-l-tinta-3">
          {r.supuestos!.map((v, i) => (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden>?</span>
              <span>
                <span className="font-medium">Supuesto:</span> {v}
              </span>
            </li>
          ))}
        </ul>
      )}
      {r.siguientePaso && (
        <p className="mt-2 text-[13px] text-l-tinta">
          <span className="font-semibold">Siguiente paso ({r.siguientePaso.quien}):</span> {r.siguientePaso.que}
        </p>
      )}
      {r.brief && (
        <div className="mt-2 rounded-lg bg-l-sup p-2.5 text-[13px] leading-[1.5] text-l-tinta">
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-l-tinta-3">
            {t.rol === "contenido" ? "Calendario propuesto" : "Concepto de reemplazo"}
          </div>
          <p className="whitespace-pre-line">{r.brief}</p>
        </div>
      )}
      <Link to={`/agentes/${t.id}`} className="mt-1.5 inline-block text-[12px] font-semibold text-l-marca">
        Ver cómo lo averiguó
      </Link>
    </div>
  );
}

function FeedAgentes({ trabajos }: { trabajos: Trabajo[] }) {
  if (trabajos.length === 0) return <p className="text-[13px] text-l-tinta-3">Todavía no corrió ningún trabajo.</p>;
  return (
    <ul className="space-y-3">
      {trabajos.map((t) => (
        <li key={t.id}>
          <Link to={`/agentes/${t.id}`} className="block rounded-lg text-inherit hover:opacity-80">
            <div className="flex items-center gap-1.5 text-[12px] text-l-tinta-3">
              <EstadoPunto estado={t.estado} />
              {nombreRol(t.rol)} · {haceCuanto(t.finishedAt ?? t.startedAt ?? t.createdAt)}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[13px] leading-[1.4] text-l-tinta">
              {t.resultado?.resumen ?? (t.estado === "fallo" ? "No pudo terminar; se reintenta solo." : t.estado === "corriendo" ? "Trabajando…" : "En la cola")}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function EstadoPunto({ estado }: { estado: Trabajo["estado"] }) {
  const color = estado === "hecho" ? "var(--l-bien)" : estado === "fallo" ? "var(--l-critico)" : estado === "corriendo" ? "var(--l-marca)" : "var(--l-neutro)";
  return <span className={`inline-block h-2 w-2 rounded-full ${estado === "corriendo" ? "animate-pulse" : ""}`} style={{ background: color }} aria-hidden />;
}
