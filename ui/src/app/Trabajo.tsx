// LMTM: Trabajo (15/10). Lo que los agentes hicieron y propusieron —en Meta,
// Google, Search Console y Analytics— con el resultado medido de cada cambio.
// Antes estaba repartido en cinco lugares y ninguna pantalla lo juntaba.
// Se usa en la pantalla de la agencia, en la ficha del cliente y en sus
// dashboards de pauta y web.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, TrendingUp, Zap } from "lucide-react";
import { Link } from "@/lib/router";
import { novedadesApi, trabajoApi, type AreaTrabajo, type ItemTrabajo, type NovedadesCliente, type Plataforma, type Resultado } from "../api/trabajo";
import { fechaLarga, horaCorta, pesos } from "../lmtm/formato";
import { Tarjeta } from "./HoyApp";
import { Encabezado } from "./Shell";

const VISTAS = [
  { k: "todo", label: "Todo" },
  { k: "hecho", label: "Hecho" },
  { k: "propuesto", label: "Esperando" },
  { k: "pauta", label: "Pauta" },
  { k: "web", label: "Web y SEO" },
  { k: "analisis", label: "Análisis" },
  { k: "informe", label: "Informes" },
  { k: "contenido", label: "Contenido" },
] as const;
type Vista = (typeof VISTAS)[number]["k"];

const AREA: Record<AreaTrabajo, string> = { pauta: "Pauta", web: "Web y SEO", contenido: "Contenido", analisis: "Análisis", informe: "Informe" };
const PLATAFORMA: Record<Plataforma, string> = { meta: "Meta", google: "Google Ads", search_console: "Search Console", analytics: "Analytics" };
const ESTADO: Record<ItemTrabajo["estado"], string> = { hecho: "Hecho", propuesto: "Esperando", descartado: "Descartado" };

function filtrar(items: ItemTrabajo[], v: Vista): ItemTrabajo[] {
  if (v === "todo") return items;
  if (v === "hecho" || v === "propuesto") return items.filter((i) => i.estado === v);
  return items.filter((i) => i.area === v);
}

/** "23/10" a partir de "2026-10-23". */
const diaCorto = (iso: string) => `${Number(iso.slice(8, 10))}/${iso.slice(5, 7)}`;
const diaBA = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(iso));

const METRICA: Record<Resultado["metrica"], string> = {
  cpl: "Costo por consulta de la cuenta, semana antes → semana después",
  ctr: "CTR de la cuenta, semana antes → semana después",
  clics_google: "Clics desde Google, 28 días antes → 28 después",
  eventos_clave: "Conversiones en Analytics, 28 días antes → 28 después",
};

/** El resultado de un cambio dicho en una línea (sin veredicto: eso va aparte). */
export function textoResultado(r: Resultado): string {
  if (r.estado === "midiendo") return r.seMideEl ? `Se mide desde el ${diaCorto(r.seMideEl)}` : "Midiéndose";
  if (r.estado === "sin_datos") return "Sin datos suficientes para medirlo";
  const f = (n: number | null) =>
    n == null ? "—" : r.metrica === "cpl" ? pesos(n) : r.metrica === "ctr" ? `${n.toLocaleString("es-AR")}%` : Math.round(n).toLocaleString("es-AR");
  return `${METRICA[r.metrica]}: ${f(r.antes)} → ${f(r.despues)}`;
}

const VEREDICTO: Record<NonNullable<Resultado["veredicto"]>, { label: string; clase: string }> = {
  mejoro: { label: "Mejoró", clase: "bg-l-bien/15 text-l-bien-texto" },
  igual: { label: "Igual", clase: "bg-l-neutro/20 text-l-tinta-2" },
  empeoro: { label: "Empeoró", clase: "bg-l-critico-suave text-l-critico-texto" },
};

function LineaResultado({ r }: { r: Resultado }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-l-tinta-2">
      {r.veredicto && <span className={`rounded-full px-2 py-px text-[12px] font-semibold ${VEREDICTO[r.veredicto].clase}`}>{VEREDICTO[r.veredicto].label}</span>}
      <span className="tabular-nums">{textoResultado(r)}</span>
    </p>
  );
}

function Punto({ estado }: { estado: ItemTrabajo["estado"] }) {
  const color = estado === "hecho" ? "var(--l-bien)" : estado === "propuesto" ? "var(--l-atencion)" : "var(--l-neutro)";
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />;
}

function FilaTrabajo({ i, conCliente }: { i: ItemTrabajo; conCliente: boolean }) {
  return (
    <li className="border-b border-l-linea px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-l-tinta-3">
        <Punto estado={i.estado} />
        <span className="font-semibold text-l-tinta-2">{ESTADO[i.estado]}</span>
        <span>
          · {AREA[i.area]}
          {i.plataforma ? ` · ${PLATAFORMA[i.plataforma]}` : ""} · {i.quien}
        </span>
        {i.automatico && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-l-marca-suave px-1.5 py-px text-[11px] font-semibold text-l-marca">
            <Zap className="h-3 w-3" aria-hidden /> Solo
          </span>
        )}
        <span className="ml-auto tabular-nums">{horaCorta(i.fecha)}</span>
      </div>
      {conCliente && i.cliente && (
        <div className="mt-0.5 text-[13px] font-semibold">
          {i.clienteSlug ? (
            <Link to={`/clientes/${i.clienteSlug}/agentes`} className="text-l-marca hover:underline">
              {i.cliente}
            </Link>
          ) : (
            i.cliente
          )}
        </div>
      )}
      <p className="mt-0.5 text-[14px] leading-[1.45] text-l-tinta">{i.que}</p>
      {i.resultado && <LineaResultado r={i.resultado} />}
      {(i.porque || i.siguiente) && (
        <details className="mt-1 text-[13px] text-l-tinta-2">
          <summary className="cursor-pointer select-none text-l-tinta-3">{i.porque ? "Por qué" : "Qué sigue"}</summary>
          {i.porque && <p className="mt-1 whitespace-pre-line leading-[1.5]">{i.porque}</p>}
          {i.siguiente && (
            <p className="mt-1 whitespace-pre-line leading-[1.5]">
              <span className="font-semibold">Qué sigue:</span> {i.siguiente}
            </p>
          )}
        </details>
      )}
      {i.enlace && (
        <Link to={i.enlace} className="mt-1 inline-block text-[12px] font-semibold text-l-marca">
          {i.enlace.startsWith("/agentes") ? "Ver cómo lo averiguó" : "Decidir en Hoy"}
        </Link>
      )}
    </li>
  );
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <Tarjeta className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-l-tinta-3">{titulo}</div>
      <div className="mt-1 text-[26px] font-semibold leading-none tabular-nums tracking-[-0.02em]">{valor}</div>
      {detalle && <div className="mt-1.5 text-[13px] leading-[1.4] text-l-tinta-2">{detalle}</div>}
    </Tarjeta>
  );
}

function Resumen({ items }: { items: ItemTrabajo[] }) {
  const cambios = items.filter((i) => i.id.startsWith("accion:"));
  const solos = cambios.filter((i) => i.automatico).length;
  const medidos = items.filter((i) => i.resultado?.estado === "medido");
  const cuenta = (v: string) => medidos.filter((i) => i.resultado?.veredicto === v).length;
  const midiendo = items.filter((i) => i.resultado?.estado === "midiendo");
  const primera = midiendo.map((i) => i.resultado!.seMideEl).filter((x): x is string => !!x).sort()[0];
  const esperando = items.filter((i) => i.estado === "propuesto");
  const informes = esperando.filter((i) => i.area === "informe").length;
  const analisis = items.filter((i) => i.area === "analisis" && i.estado === "hecho").length;
  const s = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Cifra
        titulo="Cambios en las cuentas"
        valor={String(cambios.length)}
        detalle={cambios.length ? `${solos} los hizo solo el piloto automático` : "Pausas, presupuestos y palabras clave en Meta y Google"}
      />
      <Cifra
        titulo="Resultado medido"
        valor={String(medidos.length)}
        detalle={
          medidos.length
            ? `${cuenta("mejoro")} mejoraron · ${cuenta("igual")} igual · ${cuenta("empeoro")} empeoraron`
            : midiendo.length
              ? `${s(midiendo.length, "cambio se está midiendo", "cambios se están midiendo")}${primera ? `; el primero el ${diaCorto(primera)}` : ""}`
              : "Cada cambio se mide a los 7 días"
        }
      />
      <Cifra
        titulo="Esperando una persona"
        valor={String(esperando.length)}
        detalle={esperando.length ? `${esperando.length - informes} propuestas · ${s(informes, "informe sin publicar", "informes sin publicar")}` : "Nada pendiente"}
      />
      <Cifra titulo="Análisis de los agentes" valor={String(analisis)} detalle="Qué encontraron y qué sugieren hacer" />
    </div>
  );
}

function SelectorDias({ dias, onChange }: { dias: number; onChange: (d: number) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Período">
      {[7, 30, 90].map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={dias === d}
          onClick={() => onChange(d)}
          className={`min-h-9 rounded-full border px-3 text-[13px] tabular-nums ${dias === d ? "border-l-tinta bg-l-tinta font-semibold text-l-papel" : "border-l-linea-2 text-l-tinta-2"}`}
        >
          {d} días
        </button>
      ))}
    </div>
  );
}

/** El registro: resumen, filtros y la lista agrupada por día. */
function PanelTrabajo({
  items,
  cargando,
  error,
  conCliente,
  vistas = true,
  resumen = true,
}: {
  items: ItemTrabajo[];
  cargando: boolean;
  error: unknown;
  conCliente: boolean;
  vistas?: boolean;
  resumen?: boolean;
}) {
  const [vista, setVista] = useState<Vista>("todo");
  const [cuantos, setCuantos] = useState(80);
  const lista = filtrar(items, vista);
  const dias: Array<{ dia: string; items: ItemTrabajo[] }> = [];
  for (const i of lista.slice(0, cuantos)) {
    const dia = diaBA(i.fecha);
    if (dias[dias.length - 1]?.dia !== dia) dias.push({ dia, items: [] });
    dias[dias.length - 1].items.push(i);
  }
  if (cargando) return <p className="text-[14px] text-l-tinta-3">Cargando…</p>;
  if (error) return <p className="text-[14px] text-l-critico-texto">No se pudo leer el trabajo: {error instanceof Error ? error.message : "error"}</p>;
  return (
    <div className="space-y-5">
      {resumen && <Resumen items={items} />}
      {vistas && (
        <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtrar">
          {VISTAS.map((v) => {
            const n = filtrar(items, v.k).length;
            if (v.k !== "todo" && n === 0) return null;
            return (
              <button
                key={v.k}
                type="button"
                role="tab"
                aria-selected={vista === v.k}
                onClick={() => setVista(v.k)}
                className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] ${vista === v.k ? "border-l-tinta bg-l-tinta font-semibold text-l-papel" : "border-l-linea-2 text-l-tinta-2"}`}
              >
                {v.label} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      )}
      {lista.length === 0 && <p className="text-[14px] text-l-tinta-2">Todavía no hay trabajo registrado en este período.</p>}
      {dias.map((g) => (
        <section key={g.dia}>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-l-tinta-3">{fechaLarga(new Date(`${g.dia}T15:00:00Z`))}</h3>
          <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
            {g.items.map((i) => (
              <FilaTrabajo key={i.id} i={i} conCliente={conCliente} />
            ))}
          </ul>
        </section>
      ))}
      {lista.length > cuantos && (
        <button type="button" onClick={() => setCuantos((c) => c + 80)} className="min-h-10 rounded-[10px] border border-l-linea-2 px-4 text-[14px] text-l-tinta-2">
          Ver más ({lista.length - cuantos})
        </button>
      )}
    </div>
  );
}

// ── Buenas noticias (15/10) ─────────────────────────────────────────────
// Titulares con números medidos para reenviarle al cliente. Ver
// server/src/services/novedades.ts: los arma el sistema, no un modelo.

function BotonCopiar({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<"" | "ok" | "manual">("");
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(texto).then(() => setEstado("ok"), () => setEstado("manual"))}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] bg-l-tinta px-3 text-[13px] font-semibold text-l-papel"
      >
        <Copy className="h-4 w-4" aria-hidden /> {estado === "ok" ? "Copiado" : "Copiar para WhatsApp"}
      </button>
      {estado === "manual" && (
        <textarea
          readOnly
          value={texto}
          rows={6}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-2 w-full rounded-[10px] border border-l-linea-2 bg-l-sup p-2 text-[13px]"
        />
      )}
    </div>
  );
}

function TarjetaNovedades({ c, conCliente }: { c: NovedadesCliente; conCliente: boolean }) {
  return (
    <Tarjeta className="min-w-0">
      {conCliente && (
        <Link to={`/clientes/${c.slug}/agentes`} className="text-[13px] font-semibold text-l-marca hover:underline">
          {c.cliente}
        </Link>
      )}
      <ul className="mt-1 space-y-2.5">
        {c.novedades.map((n) => (
          <li key={n.tipo}>
            <div className="flex items-start gap-1.5 text-[14px] font-semibold leading-[1.35] text-l-tinta">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-l-bien" aria-hidden /> {n.titular}
            </div>
            <p className="mt-0.5 pl-[22px] text-[13px] leading-[1.45] text-l-tinta-2">{n.detalle}</p>
          </li>
        ))}
      </ul>
      {c.mensaje && <BotonCopiar texto={c.mensaje} />}
    </Tarjeta>
  );
}

/** Las buenas noticias de un cliente, o de todos los que tienen alguna. */
export function BuenasNoticias({ clientId }: { clientId?: string }) {
  const q = useQuery({ queryKey: ["lmtm", "novedades", clientId ?? "agencia"], queryFn: () => novedadesApi.leer(clientId), staleTime: 10 * 60_000 });
  const clientes = (q.data?.clientes ?? []).filter((c) => c.novedades.length > 0);
  if (clientId && clientes.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-l-tinta-2">
          Buenas noticias para mandar{!clientId && clientes.length ? ` · ${clientes.length} clientes` : ""}
        </h2>
        <p className="mt-0.5 text-[13px] text-l-tinta-3">
          Mejoras medidas con datos hasta ayer. Cada una exige un mínimo de volumen y no esconde un empeoramiento.
        </p>
      </div>
      {q.isLoading && <p className="text-[14px] text-l-tinta-3">Buscando buenas noticias…</p>}
      {q.error && <p className="text-[14px] text-l-critico-texto">No se pudieron leer: {q.error instanceof Error ? q.error.message : "error"}</p>}
      {q.data && clientes.length === 0 && <p className="text-[14px] text-l-tinta-2">Hoy ningún cliente tiene una mejora que alcance los mínimos.</p>}
      <div className={clientId ? "" : "grid gap-3 md:grid-cols-2 xl:grid-cols-3"}>
        {clientes.map((c) => (
          <TarjetaNovedades key={c.clientId} c={c} conCliente={!clientId} />
        ))}
      </div>
    </section>
  );
}

export function TrabajoApp() {
  const [dias, setDias] = useState(30);
  const q = useQuery({ queryKey: ["lmtm", "trabajo", "agencia", dias], queryFn: () => trabajoApi.leer({ dias }), refetchInterval: 60_000 });
  return (
    <>
      <Encabezado
        titulo="Trabajo"
        bajada="Lo que los agentes hicieron y propusieron en Meta, Google, Search Console y Analytics, y qué pasó después."
        derecha={<SelectorDias dias={dias} onChange={setDias} />}
      />
      <div className="space-y-8 px-4 pb-10 md:px-8">
        <BuenasNoticias />
        <PanelTrabajo items={q.data?.items ?? []} cargando={q.isLoading} error={q.error} conCliente />
      </div>
    </>
  );
}

/** El trabajo de un cliente; con `areas`, solo esas (el dashboard de pauta muestra pauta y web). */
export function TrabajoDelCliente({ clientId, areas, resumen = true }: { clientId: string; areas?: AreaTrabajo[]; resumen?: boolean }) {
  const [dias, setDias] = useState(30);
  const q = useQuery({ queryKey: ["lmtm", "trabajo", clientId, dias], queryFn: () => trabajoApi.leer({ clientId, dias }), refetchInterval: 60_000 });
  const items = (q.data?.items ?? []).filter((i) => !areas || areas.includes(i.area));
  return (
    <div className="space-y-3">
      {(!areas || areas.includes("pauta")) && <BuenasNoticias clientId={clientId} />}
      <div className="flex justify-end">
        <SelectorDias dias={dias} onChange={setDias} />
      </div>
      <PanelTrabajo items={items} cargando={q.isLoading} error={q.error} conCliente={false} vistas={!areas} resumen={resumen} />
    </div>
  );
}
