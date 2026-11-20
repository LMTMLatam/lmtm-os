// LMTM: Hoy y Decisiones. Rediseño 20/11 (pedido de Naza): Hoy muestra solo lo
// urgente, los números de la agencia, unas pocas sugerencias y lo que hicieron los
// agentes. La lista entera de decisiones, con filtros, búsqueda y agrupar por
// cliente, quedó en /decisiones (PendientesApp). Cada fila se abre en el lugar:
// por qué completo, lo que encontró el agente y la acción.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Lightbulb, Loader2, OctagonAlert, Search, Sparkles, TrendingUp, TriangleAlert, WifiOff } from "lucide-react";
import { Link } from "@/lib/router";
import { api } from "../api/client";
import { decisionesApi, type Decision, type Fuente, type Hoy } from "../api/decisiones";
import { AccionesDecision, BarraCobertura, BloqueIncidente, EnQueSeBasa, LeyendaCobertura, ParaQue, Plata, PorQue } from "../lmtm/componentes";
import { paraQueDecision } from "../lmtm/para-que";
import { etiquetaResponsable, fechaLarga, haceCuanto, horaCorta, pesos, tocaLaPauta } from "../lmtm/formato";
import { frasePlegadas, plegarSinPlata } from "../lmtm/plegar";
import { agentesApi, nombreRol, type Trabajo } from "./api";
import { Encabezado } from "./Shell";
import { TareasEsperando } from "./Esperando";
import { useQueFunciona } from "./QueFunciona";
import { ImpactoAgentes } from "./ImpactoAgentes";
import { PublicacionTrabada } from "./PublicacionTrabada";
import { agruparUrgentes, repartirHoy } from "../lmtm/hoy";
import { alertasDeAgencia, movimientoCartera, type Alerta } from "../lmtm/alertas";
import { AntesDespues, BarrasH, BarrasPar, Chispa, Linea, Proporcion } from "../lmtm/graficos";
import { growthApi } from "../api/growth";
import { carteraApi } from "../api/informes";
import { nichesApi } from "../api/niches";
import type { ResumenTrabajo } from "../api/trabajo";

// Por tema y no por "quién": el 07/10 Nazareno pidió que sea más fácil de
// atacar. Se entra por lo que hay que hacer (plata, contenido, conexiones,
// lo que espera una respuesta), no por "Equipo/Cliente".
export type Filtro = "todo" | "plata" | "contenido" | "web" | "conexiones" | "esperan";
export function temaDe(d: Pick<Decision, "tipo">): Exclude<Filtro, "todo"> | null {
  if (d.tipo.startsWith("pauta:") || d.tipo.startsWith("saldo:")) return "plata";
  if (d.tipo.startsWith("cadena:")) return "contenido";
  if (d.tipo.startsWith("web:") || d.tipo === "contenido:busquedas") return "web";
  if (d.tipo.startsWith("cobertura:")) return "conexiones";
  if (d.tipo === "cola:esperando_persona") return "esperan";
  return null;
}
export const FILTROS: Array<{ k: Filtro; label: string; pasa: (d: Decision) => boolean }> = [
  { k: "todo", label: "Todo", pasa: () => true },
  { k: "plata", label: "Pauta y saldo", pasa: (d) => temaDe(d) === "plata" },
  { k: "contenido", label: "Contenido", pasa: (d) => temaDe(d) === "contenido" },
  { k: "web", label: "Web y Google", pasa: (d) => temaDe(d) === "web" },
  { k: "conexiones", label: "Conexiones", pasa: (d) => temaDe(d) === "conexiones" },
  { k: "esperan", label: "Te esperan", pasa: (d) => temaDe(d) === "esperan" },
];
const ES_COLA = (d: Decision) => d.tipo === "cola:esperando_persona";
const NOMBRE_FUENTE: Record<Fuente, string> = { meta_ads: "Meta", google_ads: "Google", organico: "Redes" };

export function useDatosHoy() {
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
  return { hoy, trabajos: trabajos.data?.trabajos ?? [], porDecision };
}

export function Bajada({ h }: { h?: Hoy }) {
  return (
    <>
      {fechaLarga(new Date())}
      {h?.ultimaCorrida ? ` · actualizado a las ${horaCorta(h.ultimaCorrida)}` : ""}
    </>
  );
}

export function CargaHoy({ hoy }: { hoy: ReturnType<typeof useDatosHoy>["hoy"] }) {
  if (hoy.isLoading) return <p className="text-[14px] text-l-tinta-3" role="status">Cargando…</p>;
  if (!hoy.error) return null;
  return (
    <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert">
      <OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se pudo cargar: {hoy.error instanceof Error ? hoy.error.message : "error"}
    </p>
  );
}

/**
 * Hoy (pedido de Naza 20/11): «la parte principal deberían ser gráficos, con resultados […]; alertas del estilo
 * "estamos por detrás de la competencia en muchos clientes del nicho"; no acción humana, eso derivalo a otro lado».
 * Acá solo se mira: números de la agencia, alertas de los datos y comparativas. Lo que hay que hacer está en
 * Pendientes (/decisiones) y en Aprobaciones.
 */
export function HoyApp() {
  const { hoy } = useDatosHoy();
  const h = hoy.data;
  const r = h ? repartirHoy(h.decisiones, h.oportunidades ?? []) : null;
  const urgentes = h && r ? h.incidentes.length + r.urgentes.length : null;
  const overview = useQuery({ queryKey: ["growth", "overview"], queryFn: () => growthApi.overview(), staleTime: 10 * 60_000 });
  const cartera = useQuery({ queryKey: ["lmtm", "cartera"], queryFn: () => carteraApi.leer(), staleTime: 3 * 60_000 });
  const nichos = useQuery({ queryKey: ["niches"], queryFn: () => nichesApi.list(), staleTime: 10 * 60_000 });
  const contenido = useQueFunciona();
  const trabajo = useQuery({
    queryKey: ["lmtm", "trabajo", "resumen", 30],
    queryFn: () => api.get<{ dias: number; resumen: ResumenTrabajo }>("/trabajo?dias=30&resumen=1"),
    staleTime: 10 * 60_000,
  });
  const alertas = alertasDeAgencia({ nichos: nichos.data?.niches, contenido: contenido.data, cartera: cartera.data });
  const serie = overview.data?.spendTrend ?? [];
  const k = overview.data?.kpis;
  const mov = movimientoCartera(cartera.data);
  // Los cinco que más cambiaron su costo por consulta contra la semana anterior (sin los dudosos).
  const movidos = (cartera.data?.clientes ?? [])
    .filter((f) => f.semana.cpl != null && f.semana.cplAnterior != null && f.semana.cplAnterior > 0 && !f.semana.leadsDudosos)
    .map((f) => ({ etiqueta: f.cliente, antes: f.semana.cplAnterior!, despues: f.semana.cpl! }))
    .sort((a, b) => Math.abs(b.despues / b.antes - 1) - Math.abs(a.despues / a.antes - 1))
    .slice(0, 5);
  const res = trabajo.data?.resumen;
  const c = contenido.data;
  const enAmbos = (c?.nichos ?? [])
    .map((n) => ({ n, comp: c?.competencia?.nichos.find((x) => x.nicho === n.nicho) }))
    .filter((x) => x.comp && x.n.cuentas >= 2 && x.comp.cuentas >= 2);

  return (
    <>
      <Encabezado
        titulo="Hoy"
        bajada={<Bajada h={h} />}
        derecha={
          urgentes != null && (
            <Link to="/decisiones" className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-l-linea-2 px-4 text-[14px] text-l-tinta-2 hover:border-l-marca hover:text-l-tinta">
              Pendientes del equipo <span className="rounded-full bg-l-marca-suave px-2 py-px text-[12px] font-semibold tabular-nums text-l-tinta">{urgentes} urgentes</span>
            </Link>
          )
        }
      />
      <div className="space-y-6 px-4 pb-10 md:px-8">
        <CargaHoy hoy={hoy} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Numero titulo="Inversión · 30 días" valor={k ? pesos(k.spend30d) : null} chispa={serie.map((p) => p.spend)} brillo />
          <Numero titulo="Consultas · 30 días" valor={k ? entero(k.leads30d) : null} chispa={serie.map((p) => p.leads)} />
          <Numero titulo="Costo por consulta · 30 días" valor={k && k.leads30d > 0 ? pesos(k.spend30d / k.leads30d) : null} chispa={serie.map((p) => (p.leads > 0 ? p.spend / p.leads : 0))} />
          <Numero titulo="Plata parada por día" valor={h?.plataParada != null ? pesos(h.plataParada) : null} chispa={(h?.evolucion ?? []).map((p) => p.plataParada ?? 0)} pie={h ? `en ${h.clientesParados} ${h.clientesParados === 1 ? "cliente" : "clientes"}` : undefined} />
        </div>

        <ImpactoAgentes />

        {alertas.length > 0 && (
          <section>
            <h2 className="mb-3 text-[18px] font-semibold">Alertas</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {alertas.map((a) => (
                <TarjetaAlerta key={a.clave} a={a} />
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel titulo="Inversión por día" bajada="Toda la agencia, últimos 30 días">
            <Linea puntos={serie.map((p) => ({ x: p.date, y: p.spend }))} formato={pesos} etiqueta="Inversión por día" />
          </Panel>
          <Panel titulo="Consultas por día" bajada="Toda la agencia, últimos 30 días">
            <Linea puntos={serie.map((p) => ({ x: p.date, y: p.leads }))} formato={entero} etiqueta="Consultas por día" />
          </Panel>
          <Panel titulo="La cartera esta semana" bajada="Costo por consulta de cada cliente contra la semana anterior">
            <Proporcion
              tramos={[
                { etiqueta: "bajaron", valor: mov.bajo, tono: "bien", marca: "↓" },
                { etiqueta: "igual", valor: mov.igual, tono: "neutro", marca: "=" },
                { etiqueta: "subieron", valor: mov.subio, tono: "critico", marca: "↑" },
              ]}
            />
            {movidos.length > 0 && (
              <div className="mt-5 border-t border-l-linea pt-4">
                <p className="mb-3 text-[12px] text-l-tinta-3">Los que más se movieron</p>
                <AntesDespues filas={movidos} formato={pesos} menorEsMejor />
              </div>
            )}
          </Panel>
          <Panel titulo="Trabajo de los agentes" bajada="Lo que hicieron en 30 días, por área">
            {res ? (
              <>
                <BarrasH
                  filas={(Object.entries(res.porArea) as Array<[keyof typeof AREA, { hechos: number }]>)
                    .map(([area, v]) => ({ etiqueta: AREA[area] ?? area, valor: v.hechos }))
                    .sort((a, b) => b.valor - a.valor)}
                  formato={entero}
                />
              </>
            ) : (
              <p className="text-[13px] text-l-tinta-3">Cargando…</p>
            )}
          </Panel>
          {c && c.formatos.length > 0 && (
            <Panel titulo="Qué formato rinde en redes" bajada={`Cada publicación contra lo normal de su cuenta · ${c.dias} días`}>
              <BarrasH
                filas={c.formatos.map((f) => ({ etiqueta: f.nombre.replace(/^Instagram · /, ""), valor: f.indice, detalle: `${f.publicaciones} publicaciones` }))}
                formato={(x) => `${x.toFixed(1).replace(".", ",")}×`}
                referencia={{ valor: 1, etiqueta: "lo normal de cada cuenta (1×)" }}
              />
            </Panel>
          )}
          {enAmbos.length > 0 && (
            <Panel titulo="Publicaciones por cuenta" bajada={`Nuestros clientes contra su competencia en Instagram · ${c!.dias} días`}>
              <BarrasPar
                grupos={enAmbos.map(({ n, comp }) => ({ etiqueta: n.nicho, a: n.publicaciones / n.cuentas, b: comp!.publicaciones / comp!.cuentas }))}
                nombres={["Nuestros clientes", "Competencia"]}
                formato={(x) => entero(x)}
              />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

const AREA = { pauta: "Pauta", web: "Web", contenido: "Contenido", analisis: "Análisis", informe: "Informes" } as const;
const entero = (n: number) => Math.round(n).toLocaleString("es-AR");

function Panel({ titulo, bajada, children }: { titulo: string; bajada?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-l-linea bg-l-sup p-5">
      <h3 className="text-[16px] font-semibold">{titulo}</h3>
      {bajada && <p className="mb-4 mt-0.5 text-[12px] text-l-tinta-3">{bajada}</p>}
      {children}
    </section>
  );
}

function Numero({ titulo, valor, chispa, pie, brillo }: { titulo: string; valor: string | null; chispa: number[]; pie?: string; brillo?: boolean }) {
  return (
    <div className={`flex flex-col gap-2 rounded-[20px] border border-l-linea bg-l-sup p-5 ${brillo ? "bg-[image:var(--l-brillo-caja)]" : ""}`}>
      <p className="text-[13px] text-l-tinta-2">{titulo}</p>
      <p className="text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{valor ?? <span className="text-[20px] italic text-l-tinta-3">sin dato</span>}</p>
      <Chispa valores={chispa} />
      {pie && <p className="text-[12px] text-l-tinta-3">{pie}</p>}
    </div>
  );
}

function TarjetaAlerta({ a }: { a: Alerta }) {
  const Icono = a.tono === "atencion" ? TriangleAlert : a.tono === "bien" ? TrendingUp : Lightbulb;
  const color = a.tono === "atencion" ? "text-l-atencion-texto" : a.tono === "bien" ? "text-l-bien-texto" : "text-l-marca";
  const cuerpo = (
    <div className="flex h-full gap-3 rounded-[18px] border border-l-linea bg-l-sup p-4 hover:border-l-tinta-3">
      <Icono className={`mt-1 h-5 w-5 shrink-0 ${color}`} aria-hidden />
      <p className="text-[14px] leading-[1.45] text-l-tinta-2">
        <span className="mr-1.5 text-[22px] font-semibold tabular-nums text-l-tinta">{a.grande}</span>
        {a.texto}
      </p>
    </div>
  );
  return a.link ? <Link to={a.link} className="block text-inherit">{cuerpo}</Link> : cuerpo;
}

/** Lo que corta la pauta o la publicación hoy. Sin nada, una línea: no una pantalla vacía. */
export function Urgente({ h, urgentes, porDecision }: { h: Hoy; urgentes: Decision[]; porDecision: Map<string, Trabajo> }) {
  const nada = h.whatsapp !== "desconectado" && h.incidentes.length === 0 && urgentes.length === 0;
  return (
    <section className="space-y-4">
      <TituloFranja critico={!nada}>Urgente</TituloFranja>
      {h.whatsapp === "desconectado" && (
        <p className="flex gap-2 rounded-xl border-l-[3px] border-l-l-critico bg-l-critico-suave px-3 py-2.5 text-[14px]" role="alert">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-l-critico" aria-hidden />
          <span>
            <span className="font-semibold">El WhatsApp de avisos está desconectado.</span> Mientras siga así no sale ningún aviso.
          </span>
        </p>
      )}
      {h.incidentes.length > 0 && (
        <ul>
          {h.incidentes.map((d) => (
            <BloqueIncidente key={d.id} d={d} />
          ))}
        </ul>
      )}
      {agruparUrgentes(urgentes).map((g) => (
        <GrupoUrgente key={g.titulo} titulo={g.titulo} items={g.items} porDecision={porDecision} />
      ))}
      <PublicacionTrabada />
      {nada && <p className="text-[14px] text-l-tinta-2">Sin incidentes, saldos por agotarse ni publicación cortada.</p>}
    </section>
  );
}

/** Un grupo de lo urgente: las 3 que más pesan a la vista, el resto a un clic. */
function GrupoUrgente({ titulo, items, porDecision }: { titulo: string; items: Decision[]; porDecision: Map<string, Trabajo> }) {
  const [todas, setTodas] = useState(false);
  const visibles = todas ? items : items.slice(0, 3);
  return (
    <div>
      <h3 className="mb-2 text-[14px] font-semibold text-l-tinta">
        {titulo} <span className="font-normal text-l-tinta-3">· {items.length}</span>
      </h3>
      <Lista decisiones={visibles} porDecision={porDecision} />
      {items.length > 3 && (
        <button type="button" onClick={() => setTodas((v) => !v)} aria-expanded={todas} className="mt-2 inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-l-marca">
          {todas ? "Ver menos" : `Ver las ${items.length}`} <ChevronDown className={`h-4 w-4 transition-transform ${todas ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Lo que hay que hacer (sin lo urgente ni lo que se aprueba, que van arriba en Pendientes), con sus filtros por tema. */
export function ParaHacer({ h, decisiones, porDecision, filtroInicial }: { h: Hoy; decisiones: Decision[]; porDecision: Map<string, Trabajo>; filtroInicial: Filtro }) {
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial);
  const [buscar, setBuscar] = useState("");
  const [agrupar, setAgrupar] = useState(false);
  const [verTodas, setVerTodas] = useState(false);
  const [verOportunidades, setVerOportunidades] = useState(false);
  const oportunidades = h.oportunidades ?? [];
  const texto = buscar.trim().toLowerCase();
  const filtradas = decisiones.filter(FILTROS.find((f) => f.k === filtro)!.pasa).filter((d) => !texto || d.cliente.toLowerCase().includes(texto) || d.que.toLowerCase().includes(texto));
  // Todo lo que tiene plata se ve; de lo que no, unas pocas y el resto contado
  // en una línea (lmtm/plegar.ts). Buscando o filtrando se ve todo lo que pasa.
  const { visibles: aLaVista, plegadas, porFamilia } = plegarSinPlata(filtradas);
  const plegar = !verTodas && filtro === "todo" && !texto;
  const visibles = plegar ? aLaVista : filtradas;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        {/* Primero lo que hay para ganar (08/10: "que las principales sean
            oportunidades de contenido o de upsell, no todo saldo y pausar"). */}
        {oportunidades.length > 0 && (
          <section className="mb-7">
            <TituloFranja>Oportunidades · {oportunidades.length}</TituloFranja>
            <Lista decisiones={verOportunidades ? oportunidades : oportunidades.slice(0, 5)} porDecision={porDecision} />
            {oportunidades.length > 5 && (
              <button type="button" onClick={() => setVerOportunidades((v) => !v)} className="mt-2 text-[13px] font-semibold text-l-marca">
                {verOportunidades ? "Ver menos" : `Ver las ${oportunidades.length}`}
              </button>
            )}
          </section>
        )}

        <section className="mt-7">
          <div className="sticky top-0 z-10 -mx-4 bg-l-papel/95 px-4 pb-3 pt-2 backdrop-blur md:-mx-8 md:px-8">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtrar por tema">
                {FILTROS.map((f) => {
                  const n = decisiones.filter(f.pasa).length;
                  const activo = f.k === filtro;
                  if (n === 0 && f.k !== "todo" && !activo) return null;
                  return (
                    <button
                      key={f.k}
                      type="button"
                      role="tab"
                      aria-selected={activo}
                      onClick={() => setFiltro(f.k)}
                      className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] transition-colors ${activo ? "border-transparent bg-[image:var(--l-marca-grad)] font-semibold text-l-marca-tinta" : "border-l-linea-2 text-l-tinta-2 hover:border-l-tinta-3"}`}
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
            <p className="mt-4 text-[14px] text-l-tinta-2">{decisiones.length === 0 ? "No hay nada para hacer. Si algo cambia, aparece acá." : "Nada con ese filtro."}</p>
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
export function FilaAbrible({ d, agente, sinCliente }: { d: Decision; agente?: Trabajo; sinCliente?: boolean }) {
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
          {/* Para qué sirve, sin abrirla (20/11). */}
          <ParaQue texto={paraQueDecision(d.tipo)} />
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
              {ES_COLA(d) ? (
                <TareasEsperando clientId={d.clientId} />
              ) : (
                <>
                  <EnQueSeBasa>
                    <PorQue d={d} max={6} />
                  </EnQueSeBasa>
                  {agente && <HallazgoAgente t={agente} />}
                </>
              )}
              <div className="flex flex-wrap items-center gap-x-4">
                {!ES_COLA(d) && <AccionesDecision d={d} />}
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

export function EstadoPunto({ estado }: { estado: Trabajo["estado"] }) {
  const color = estado === "hecho" ? "var(--l-bien)" : estado === "fallo" ? "var(--l-critico)" : estado === "corriendo" ? "var(--l-marca)" : "var(--l-neutro)";
  return <span className={`inline-block h-2 w-2 rounded-full ${estado === "corriendo" ? "animate-pulse" : ""}`} style={{ background: color }} aria-hidden />;
}
