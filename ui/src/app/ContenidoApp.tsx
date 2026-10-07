// LMTM: Contenido en la app propia (fase C1). Es lo de Super Redes que ya
// existía, con el diseño nuevo y una puerta más cómoda:
//  · el calendario de TODOS los clientes (la lista "Redes Sociales" de ClickUp,
//    en vivo) con lo que le falta a cada pieza para salir;
//  · generar la pieza desde acá, con la misma generación de siempre
//    (video-higgsfield: Higgsfield —plan o API— con Magnific de respaldo para
//    las placas, entrega en el Drive de Super Redes y en el Cronopost). Antes de
//    pagar se ve qué se le va a pedir;
//  · la cola de lo etiquetado "generar contenido" y lo ya generado.
// Nada se publica solo: lo generado vuelve a la tarea para que una persona lo apruebe.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clapperboard, ExternalLink, Loader2, OctagonAlert, RefreshCw, Search, Sparkles } from "lucide-react";
import { Link } from "@/lib/router";
import { api } from "../api/client";
import { Boton } from "../lmtm/componentes";
import { horaCorta } from "../lmtm/formato";
import { Encabezado } from "./Shell";
import { Tarjeta, TituloFranja } from "./HoyApp";
import { QueFunciona } from "./QueFunciona";

interface Pieza {
  id: string;
  name: string;
  status: string;
  date: string;
  networks: string[];
  format: string | null;
  url: string | null;
  readyToPublish: boolean;
  missing: string[];
  clientId: string;
  cliente: string;
  slug: string;
}
interface Tablero {
  generadoAt: string;
  dias: number;
  piezas: Pieza[];
  sinLista: string[];
  conError: string[];
}
interface EnCola {
  clientId: string;
  cliente: string;
  taskId: string;
  titulo: string;
  url: string | null;
  tipo: string | null;
  conImagen: boolean;
}
interface Estado {
  sesion?: "ok" | "caida";
  via?: "plan" | "api" | null;
  creditos?: number | null;
  avisoSesion?: string | null;
  etiqueta: string;
  magnific?: boolean;
  pendientes: EnCola[];
}
interface Generado {
  id: string;
  title: string;
  url: string | null;
  kind: string;
  clientId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
interface Vista {
  formato?: string;
  prompt?: string;
  tomas?: string[];
  slides?: Array<{ slide: number; texto?: string; prompt?: string }>;
  piezas?: number;
  error?: string;
}
type Resultado = { ok: boolean; url?: string; error?: string; enCurso?: boolean; mensaje?: string };

const contenidoApi = {
  tablero: (fresco = false) => api.get<Tablero>(`/contenido/tablero?dias=14${fresco ? "&fresco=1" : ""}`),
  estado: () => api.get<Estado>("/video/estado"),
  generados: () => api.get<{ videos: Generado[] }>("/video/generados"),
  vista: (clientId: string, taskId: string) => api.post<Vista>("/video/prompt", { clientId, taskId }),
  generar: (clientId: string, taskId: string) => api.post<Resultado>("/video/generar", { clientId, taskId }),
};

type Filtro = "todo" | "falta" | "lista";
const FILTROS: Array<{ k: Filtro; label: string; pasa: (p: Pieza) => boolean }> = [
  { k: "todo", label: "Todas", pasa: () => true },
  { k: "falta", label: "Les falta algo", pasa: (p) => !p.readyToPublish },
  { k: "lista", label: "Listas para salir", pasa: (p) => p.readyToPublish },
];

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ZONA = "America/Argentina/Buenos_Aires";
const diaDe = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(iso));

/** "Hoy", "Mañana", "jueves 9" — el día de Buenos Aires. */
export function nombreDia(dia: string, hoy: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  const [hy, hm, hd] = hoy.split("-").map(Number);
  const dias = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 86_400_000);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  if (dias === -1) return "Ayer";
  return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
}

export function ContenidoApp() {
  const qc = useQueryClient();
  const tablero = useQuery({ queryKey: ["lmtm", "contenido", "tablero"], queryFn: () => contenidoApi.tablero(), staleTime: 5 * 60_000 });
  const estado = useQuery({ queryKey: ["lmtm", "contenido", "estado"], queryFn: () => contenidoApi.estado(), refetchInterval: 60_000 });
  const generados = useQuery({ queryKey: ["lmtm", "contenido", "generados"], queryFn: () => contenidoApi.generados(), refetchInterval: 60_000 });
  const releer = useMutation({
    mutationFn: () => contenidoApi.tablero(true),
    onSuccess: (d) => qc.setQueryData(["lmtm", "contenido", "tablero"], d),
  });
  const e = estado.data;
  const puedeGenerar = e?.sesion !== "caida";

  return (
    <>
      <Encabezado
        titulo="Contenido"
        bajada={
          <>
            Super Redes de todos los clientes, de ClickUp en vivo
            {tablero.data ? ` · leído a las ${horaCorta(tablero.data.generadoAt)}` : ""}
          </>
        }
        derecha={
          <div className="flex flex-wrap items-center gap-2">
            <Motores e={e} />
            <button
              type="button"
              onClick={() => releer.mutate()}
              disabled={releer.isPending}
              className="grid h-9 w-9 place-items-center rounded-[8px] border border-l-linea-2 text-l-tinta-2 hover:text-l-tinta disabled:opacity-50"
              aria-label="Volver a leer ClickUp"
              title="Volver a leer ClickUp"
            >
              <RefreshCw className={`h-4 w-4 ${releer.isPending ? "animate-spin" : ""}`} aria-hidden />
            </button>
          </div>
        }
      />
      <div className="space-y-8 px-4 pb-10 md:px-8">
        {e?.avisoSesion && (
          <p className={`flex gap-2 rounded-xl border-l-[3px] px-3 py-2.5 text-[14px] ${puedeGenerar ? "border-l-l-atencion bg-l-sup" : "border-l-l-critico bg-l-critico-suave"}`} role="status">
            <OctagonAlert className={`mt-0.5 h-4 w-4 shrink-0 ${puedeGenerar ? "text-l-atencion-texto" : "text-l-critico"}`} aria-hidden />
            {e.avisoSesion}
          </p>
        )}

        {(e?.pendientes.length ?? 0) > 0 && (
          <section>
            <TituloFranja>Pedidos con la etiqueta “{e!.etiqueta}” · {e!.pendientes.length}</TituloFranja>
            <p className="-mt-1.5 mb-3 text-[13px] text-l-tinta-3">El barrido los toma solo cada 10 minutos; desde acá se pueden adelantar.</p>
            <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
              {e!.pendientes.map((p) => (
                <FilaGenerar
                  key={p.taskId}
                  clientId={p.clientId}
                  taskId={p.taskId}
                  arriba={p.cliente}
                  titulo={p.titulo}
                  detalle={[p.tipo, p.conImagen ? "con imagen base" : "sin imagen base"].filter(Boolean).join(" · ")}
                  url={p.url}
                  puede={puedeGenerar}
                />
              ))}
            </ul>
          </section>
        )}

        <section>
          <TituloFranja>Calendario · próximos {tablero.data?.dias ?? 14} días</TituloFranja>
          {tablero.isLoading && (
            <p className="flex items-center gap-2 text-[14px] text-l-tinta-3">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo la lista de Redes de cada cliente en ClickUp…
            </p>
          )}
          {tablero.error && (
            <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert">
              <OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se pudo leer ClickUp: {tablero.error instanceof Error ? tablero.error.message : "error"}
            </p>
          )}
          {tablero.data && <Calendario t={tablero.data} puede={puedeGenerar} />}
        </section>

        <section id="que-funciona" className="scroll-mt-4">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <TituloFranja>Qué funciona · todas las cuentas</TituloFranja>
            <Link to="/nichos" className="text-[13px] text-l-tinta-2 hover:text-l-marca">Ver por rubro →</Link>
          </div>
          <QueFunciona />
        </section>

        <section>
          <TituloFranja>Generado</TituloFranja>
          <Galeria items={generados.data?.videos ?? []} cargando={generados.isLoading} />
        </section>
      </div>
    </>
  );
}

function Motores({ e }: { e?: Estado }) {
  if (!e) return null;
  const caido = e.sesion === "caida";
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[12px]">
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${caido ? "bg-l-critico-suave text-l-critico-texto" : "bg-l-marca-suave text-l-marca"}`}>
        Higgsfield · {caido ? "no puede generar" : e.via === "plan" ? `plan, ${e.creditos ?? "?"} créditos` : "API, pago por uso"}
      </span>
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${e.magnific ? "bg-l-sup text-l-tinta-2" : "bg-l-sup text-l-tinta-3"}`}>
        Magnific {e.magnific ? "de respaldo" : "sin configurar"}
      </span>
    </span>
  );
}

function Calendario({ t, puede }: { t: Tablero; puede: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [buscar, setBuscar] = useState("");
  const hoy = diaDe(new Date().toISOString());
  const texto = buscar.trim().toLowerCase();
  const pasa = FILTROS.find((f) => f.k === filtro)!.pasa;
  // Lo que ya pasó sin estar completo no va a salir: va aparte, arriba, contado.
  const futuras = t.piezas.filter((p) => diaDe(p.date) >= hoy);
  const pasadas = t.piezas.filter((p) => diaDe(p.date) < hoy && !p.readyToPublish);
  const visibles = futuras.filter(pasa).filter((p) => !texto || p.cliente.toLowerCase().includes(texto) || p.name.toLowerCase().includes(texto));
  const porDia = useMemo(() => {
    const m = new Map<string, Pieza[]>();
    for (const p of visibles) m.set(diaDe(p.date), [...(m.get(diaDe(p.date)) ?? []), p]);
    return [...m.entries()];
  }, [visibles]);
  const [verPasadas, setVerPasadas] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-10 -mx-4 bg-l-papel/95 px-4 pb-3 pt-1 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtrar piezas">
            {FILTROS.map((f) => {
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
                  {f.label} <span className={activo ? "opacity-70" : "text-l-tinta-3"}>{futuras.filter(f.pasa).length}</span>
                </button>
              );
            })}
          </div>
          <label className="relative ml-auto min-w-[180px] flex-1 sm:max-w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-l-tinta-3" aria-hidden />
            <input
              value={buscar}
              onChange={(ev) => setBuscar(ev.target.value)}
              placeholder="Buscar cliente o pieza"
              className="h-9 w-full rounded-full border border-l-linea-2 bg-l-sup pl-8 pr-3 text-[13px] text-l-tinta outline-none focus:border-l-marca"
            />
          </label>
        </div>
      </div>

      {pasadas.length > 0 && (
        <div className="mb-4 rounded-xl border-l-[3px] border-l-l-critico bg-l-critico-suave px-3 py-2.5 text-[14px]">
          <button type="button" onClick={() => setVerPasadas((v) => !v)} className="text-left" aria-expanded={verPasadas}>
            <span className="font-semibold">
              {pasadas.length === 1 ? "1 pieza pasó su fecha" : `${pasadas.length} piezas pasaron su fecha`} sin estar completa
            </span>{" "}
            — el despachador las descarta: completarlas y reprogramar. <span className="font-semibold text-l-marca">{verPasadas ? "Ocultar" : "Ver"}</span>
          </button>
          {verPasadas && (
            <ul className="mt-2 space-y-1 text-[13px]">
              {pasadas.map((p) => (
                <li key={p.id}>
                  <span className="font-medium">{p.cliente}</span> · {p.name} · falta {p.missing.join(", ")}
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noreferrer noopener" className="ml-1.5 font-semibold text-l-marca">
                      Abrir
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {porDia.length === 0 ? (
        <p className="text-[14px] text-l-tinta-2">{futuras.length === 0 ? "No hay piezas programadas en estos días." : "Nada con ese filtro."}</p>
      ) : (
        <div className="space-y-5">
          {porDia.map(([dia, ps]) => (
            <div key={dia}>
              <h3 className="mb-2 text-[13px] font-semibold text-l-tinta">
                {nombreDia(dia, hoy)} <span className="font-normal text-l-tinta-3">· {ps.length} {ps.length === 1 ? "pieza" : "piezas"}</span>
              </h3>
              <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
                {ps.map((p) => (
                  <FilaGenerar
                    key={p.id}
                    clientId={p.clientId}
                    taskId={p.id}
                    arriba={p.cliente}
                    slug={p.slug}
                    titulo={p.name}
                    detalle={[p.format, p.networks.join(", ")].filter(Boolean).join(" · ")}
                    url={p.url}
                    puede={puede}
                    estado={p.readyToPublish ? { ok: true, texto: "Lista" } : { ok: false, texto: `Falta ${p.missing.join(", ")}` }}
                    // Generar tiene sentido cuando lo que falta es la pieza.
                    ofrecerGenerar={p.missing.includes("pieza")}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {(t.sinLista.length > 0 || t.conError.length > 0) && (
        <p className="mt-4 text-[12px] text-l-tinta-3">
          {t.sinLista.length > 0 && <>Sin lista de Redes en ClickUp: {t.sinLista.join(", ")}. </>}
          {t.conError.length > 0 && <>No se pudo leer: {t.conError.join(", ")}.</>}
        </p>
      )}
    </>
  );
}

/**
 * Una pieza con su botón de generar. Generar es en dos pasos: primero se ve qué
 * se le va a pedir a Higgsfield (sin gastar), después se confirma.
 */
function FilaGenerar(props: {
  clientId: string;
  taskId: string;
  arriba: string;
  slug?: string;
  titulo: string;
  detalle: string;
  url: string | null;
  puede: boolean;
  estado?: { ok: boolean; texto: string };
  ofrecerGenerar?: boolean;
}) {
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const ver = useMutation({
    mutationFn: () => contenidoApi.vista(props.clientId, props.taskId),
    onSuccess: setVista,
    onError: (e) => setResultado({ ok: false, error: e instanceof Error ? e.message : "No se pudo armar el pedido." }),
  });
  const generar = useMutation({
    mutationFn: () => contenidoApi.generar(props.clientId, props.taskId),
    onSuccess: (r) => {
      setResultado(r);
      setVista(null);
      void qc.invalidateQueries({ queryKey: ["lmtm", "contenido"] });
    },
    onError: (e) => setResultado({ ok: false, error: e instanceof Error ? e.message : "No se pudo generar." }),
  });
  const ofrecer = props.ofrecerGenerar ?? true;
  return (
    <li className="border-b border-l-linea px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {props.slug ? (
              <Link to={`/clientes/${props.slug}`} className="text-[12px] font-semibold uppercase tracking-[0.06em] text-l-tinta-2 hover:text-l-marca">
                {props.arriba}
              </Link>
            ) : (
              <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-l-tinta-2">{props.arriba}</span>
            )}
            {props.estado && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${props.estado.ok ? "bg-l-marca-suave text-l-bien-texto" : "bg-l-papel text-l-atencion-texto"}`}>
                {props.estado.ok ? "✓ " : ""}
                {props.estado.texto}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[15px] font-medium leading-[1.4]">{props.titulo}</div>
          {props.detalle && <div className="text-[12px] text-l-tinta-3">{props.detalle}</div>}
        </div>
        <div className="flex items-center gap-2">
          {ofrecer && !resultado && !vista && (
            <Boton tipo="secundario" onClick={() => ver.mutate()} disabled={!props.puede || ver.isPending}>
              {ver.isPending ? "Armando…" : (
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" aria-hidden /> Generar
                </span>
              )}
            </Boton>
          )}
          {props.url && (
            <a href={props.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-1 px-1 text-[13px] font-semibold text-l-marca">
              ClickUp <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>

      {vista && (
        <div className="mt-3 rounded-xl border border-l-marca/25 bg-l-marca-suave/60 p-3 text-[13px]">
          {vista.error ? (
            <p className="text-l-critico-texto">{vista.error}</p>
          ) : (
            <>
              <div className="text-[12px] font-semibold text-l-marca">
                Esto es lo que se va a pedir{vista.formato ? ` (${vista.formato}${vista.piezas && vista.piezas > 1 ? `, ${vista.piezas} piezas` : ""})` : ""}:
              </div>
              {vista.prompt && <p className="mt-1 whitespace-pre-line text-l-tinta">{vista.prompt}</p>}
              {vista.tomas && (
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-l-tinta-2">
                  {vista.tomas.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ol>
              )}
              {vista.slides && (
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-l-tinta-2">
                  {vista.slides.map((s) => (
                    <li key={s.slide}>{s.texto || s.prompt}</li>
                  ))}
                </ol>
              )}
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!vista.error && (
              <Boton tipo="primario" onClick={() => generar.mutate()} disabled={generar.isPending}>
                {generar.isPending ? "Generando… (puede tardar unos minutos)" : "Confirmar y generar"}
              </Boton>
            )}
            <Boton tipo="secundario" onClick={() => setVista(null)} disabled={generar.isPending}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}

      {resultado && (
        <p className={`mt-2 flex gap-1.5 text-[13px] ${resultado.ok ? "text-l-bien-texto" : "text-l-critico-texto"}`} role="status">
          {resultado.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <span>
            {resultado.enCurso
              ? resultado.mensaje
              : resultado.ok
                ? resultado.error ?? "Listo: quedó en la tarea, en el Drive de Super Redes y en el Cronopost."
                : `No se generó: ${resultado.error ?? "error"}`}
            {resultado.url && (
              <a href={resultado.url} target="_blank" rel="noreferrer noopener" className="ml-1.5 font-semibold text-l-marca">
                Ver
              </a>
            )}
          </span>
        </p>
      )}
    </li>
  );
}

/** Las imágenes de Drive no son públicas: van por el proxy del servidor. Un video muestra el ícono. */
function miniatura(g: Generado): string | null {
  if (g.kind === "video") return null;
  const id = /\/d\/([\w-]{20,})/.exec(g.url ?? "")?.[1];
  return id ? `/api/drive-img/${id}` : g.url;
}

function Galeria({ items, cargando }: { items: Generado[]; cargando: boolean }) {
  if (cargando) return <p className="text-[14px] text-l-tinta-3">Cargando…</p>;
  if (items.length === 0) {
    return (
      <Tarjeta>
        <p className="text-[14px] text-l-tinta-2">Todavía no se generó nada. Tocá “Generar” en una pieza del calendario, o etiquetala en ClickUp.</p>
      </Tarjeta>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.slice(0, 20).map((g) => {
        const mini = miniatura(g);
        const piezas = Number(g.metadata?.piezas ?? 0);
        return (
          <a
            key={g.id}
            // A la tarea, no al archivo: desde la tarea se ve el contexto y se aprueba o se pide de nuevo.
            href={(g.metadata?.taskUrl as string | undefined) ?? g.url ?? undefined}
            target="_blank"
            rel="noreferrer noopener"
            className="block overflow-hidden rounded-xl border border-l-linea bg-l-sup hover:border-l-tinta-3"
          >
            <div className="relative grid aspect-[4/5] place-items-center bg-l-papel">
              {mini ? <img src={mini} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Clapperboard className="h-6 w-6 text-l-tinta-3" aria-hidden />}
              <span className="absolute left-1.5 top-1.5 rounded-full bg-l-sup/90 px-2 py-0.5 text-[10px] font-medium text-l-tinta-2">
                {g.kind === "video" ? "Video" : piezas > 1 ? `Carrusel ${piezas}` : "Placa"}
              </span>
            </div>
            <p className="line-clamp-2 p-2 text-[12px] leading-[1.35] text-l-tinta" title={g.title}>
              {g.title.replace(/^(Video|Placa|Carrusel|Imagen): /, "")}
            </p>
          </a>
        );
      })}
    </div>
  );
}
