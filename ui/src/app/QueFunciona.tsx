// LMTM: qué contenido funciona, comparando todas las cuentas (pedido 7/10).
// Cada publicación se mide contra lo normal de SU cuenta en esa red: 2× es el
// doble de lo que esa cuenta suele sacar. Así una cuenta chica y una grande se
// comparan sin que gane la que tiene más seguidores. Datos de
// /api/contenido/que-funciona (services/contenido-analisis.ts).

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, OctagonAlert, Sparkles } from "lucide-react";
import { Link } from "@/lib/router";
import { api } from "../api/client";
import { Tarjeta, TituloFranja } from "./HoyApp";
import { BarrasH, BarrasPar } from "../lmtm/graficos";

export interface Ejemplo {
  clientId: string; cliente: string; slug: string; red: string; formato: string;
  angulo: string | null; anguloNombre: string | null;
  indice: number; engagement: number; fecha: string; permalink: string | null; texto: string;
}
/** cuota: parte de las publicaciones medidas del grupo (0 a 1). */
export interface Fila { clave: string; nombre: string; publicaciones: number; cuentas: number; cuota: number; indice: number; mejor: Ejemplo }
export interface AnalisisContenido {
  generadoAt: string; dias: number; publicaciones: number; cuentas: number; clasificadas: number; sinClasificar: number;
  angulos: Fila[]; formatos: Fila[];
  nichos: Array<{ nicho: string; cuentas: number; publicaciones: number; angulos: Fila[]; formatos: Fila[] }>;
  reutilizar: Ejemplo[];
  recientes?: Ejemplo[];
  clientes: Array<{
    clientId: string; cliente: string; slug: string; nicho: string | null; publicaciones: number; top: Ejemplo[];
    mejorAngulo: Fila | null;
    oportunidad: { angulo: string; nombre: string; indiceEnNicho: number; publicacionesNicho: number; cuentasNicho: number; usosPropios: number } | null;
  }>;
  /** La competencia medida en Instagram (competencia-ig.ts): aparte, nunca en el mismo ranking. */
  competencia?: {
    cuentas: number; publicaciones: number;
    nichos: Array<{ nicho: string; cuentas: number; publicaciones: number; angulos: Fila[]; formatos: Fila[] }>;
    reutilizar: Ejemplo[];
    estado: {
      conInstagram: number; medidas: number; noEncontradas: number; noEmpresa: number; otras: number; sinRevisar: number;
      noExisten?: number; privadas?: number; conFacebook?: number; medidasFacebook?: number; motivoFacebook?: string | null;
    };
  };
}

export const queFuncionaApi = { leer: () => api.get<AnalisisContenido>("/contenido/que-funciona?dias=180") };

export function useQueFunciona() {
  return useQuery({ queryKey: ["lmtm", "contenido", "que-funciona"], queryFn: () => queFuncionaApi.leer(), staleTime: 30 * 60_000 });
}

/** "1,9×" */
export const veces = (x: number) => `${x.toFixed(x >= 10 ? 0 : 1).replace(".", ",")}×`;

const RED: Record<string, string> = { instagram: "Instagram", facebook: "Facebook" };

/** Barra contra la línea de "lo normal" (1×). Hasta 3× llena la barra. */
function Barra({ indice }: { indice: number }) {
  const ancho = Math.min(indice, 3) / 3;
  const arriba = indice >= 1;
  return (
    <span className="relative block h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-l-linea" aria-hidden>
      <span className={`absolute inset-y-0 left-0 rounded-full ${arriba ? "bg-l-marca" : "bg-l-tinta-3"}`} style={{ width: `${ancho * 100}%` }} />
      <span className="absolute inset-y-[-2px] w-px bg-l-tinta-2" style={{ left: `${100 / 3}%` }} />
    </span>
  );
}

function FilaRanking({ f, conEjemplo = true }: { f: Fila; conEjemplo?: boolean }) {
  return (
    <li className="border-b border-l-linea py-2.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-[14px] font-medium">{f.nombre}</span>
        <Barra indice={f.indice} />
        <span className={`w-12 shrink-0 text-right text-[14px] font-semibold tabular-nums ${f.indice >= 1 ? "" : "text-l-tinta-3"}`}>{veces(f.indice)}</span>
      </div>
      <div className="mt-0.5 text-[12px] text-l-tinta-3">
        {f.publicaciones} publicaciones ({Math.round(f.cuota * 100)} % de las medidas) de {f.cuentas} {f.cuentas === 1 ? "cuenta" : "cuentas"}
        {conEjemplo && (
          <>
            {" · la mejor: "}
            <LinkEjemplo e={f.mejor} corto />
          </>
        )}
      </div>
    </li>
  );
}

function LinkEjemplo({ e, corto }: { e: Ejemplo; corto?: boolean }) {
  const texto = `${e.cliente} (${veces(e.indice)})`;
  return e.permalink ? (
    <a href={e.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-l-tinta-2 underline-offset-2 hover:underline" title={e.texto}>
      {texto}
      {!corto && <ExternalLink className="h-3 w-3" aria-hidden />}
    </a>
  ) : (
    <span title={e.texto}>{texto}</span>
  );
}

function Nota({ a }: { a: AnalisisContenido }) {
  return (
    <p className="text-[12px] leading-relaxed text-l-tinta-3">
      {a.publicaciones.toLocaleString("es-AR")} publicaciones de {a.cuentas} cuentas, últimos {a.dias} días. Cada una se compara con lo normal de su cuenta en
      esa red (1× = lo normal); los ángulos, con lo normal de ese mismo formato en la cuenta (reel contra reel), para que un ángulo no gane solo por estar
      hecho en reel. Interacción = reacciones + comentarios×3 + compartidos×5; Meta no nos da el alcance de estas cuentas. Una fila aparece con al
      menos 10 publicaciones de 2 cuentas; el % dice cuánto se usa: rendir mucho con pocas publicaciones es para probar más, no una regla.
      {a.sinClasificar > 0 && ` Hay ${a.sinClasificar} publicaciones todavía sin ángulo: se clasifican solas cada hora.`}
    </p>
  );
}

/** La sección completa, para Contenido. */
export function QueFunciona() {
  const q = useQueFunciona();
  if (q.isLoading) return <p className="flex items-center gap-2 text-[14px] text-l-tinta-3"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Midiendo las publicaciones de todas las cuentas…</p>;
  if (q.error || !q.data) return <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert"><OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se pudo leer el análisis: {q.error instanceof Error ? q.error.message : "error"}</p>;
  const a = q.data;
  const conOportunidad = a.clientes.filter((c) => c.oportunidad);
  return (
    <div className="space-y-6">
      <Nota a={a} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta>
          <TituloFranja>Ángulos, en todas las cuentas</TituloFranja>
          {a.angulos.length ? (
            <ul>{a.angulos.map((f) => <FilaRanking key={f.clave} f={f} />)}</ul>
          ) : (
            <p className="text-[13px] text-l-tinta-3">Todavía no hay ángulos con muestra suficiente{a.sinClasificar > 0 ? ": faltan clasificar publicaciones" : ""}.</p>
          )}
        </Tarjeta>
        <Tarjeta>
          <TituloFranja>Formatos, en todas las cuentas</TituloFranja>
          <ul>{a.formatos.map((f) => <FilaRanking key={f.clave} f={f} />)}</ul>
        </Tarjeta>
      </div>

      <Tarjeta>
        <TituloFranja>Para reutilizar · doblaron lo normal de su cuenta</TituloFranja>
        <p className="-mt-1.5 mb-2 text-[12px] text-l-tinta-3">Volver a contarlas con otro formato u otro gancho. Hasta 3 por cuenta.</p>
        <ul>
          {a.reutilizar.slice(0, 15).map((e) => (
            <li key={`${e.clientId}-${e.permalink}-${e.fecha}`} className="flex items-start gap-3 border-b border-l-linea py-2.5 last:border-b-0">
              <span className="w-12 shrink-0 pt-0.5 text-right text-[14px] font-semibold tabular-nums">{veces(e.indice)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px]">
                  <Link to={`/clientes/${e.slug}`} className="font-medium text-inherit hover:text-l-marca">{e.cliente}</Link>
                  <span className="text-l-tinta-3"> · {RED[e.red] ?? e.red} {e.formato}{e.anguloNombre ? ` · ${e.anguloNombre}` : ""} · {e.fecha.split("-").reverse().join("/")}</span>
                </span>
                <span className="block truncate text-[12px] text-l-tinta-3">{e.texto}</span>
              </span>
              {e.permalink && (
                <a href={e.permalink} target="_blank" rel="noreferrer" className="shrink-0 pt-0.5 text-l-tinta-3 hover:text-l-tinta" aria-label="Ver la publicación">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ul>
      </Tarjeta>

      {conOportunidad.length > 0 && (
        <Tarjeta>
          <TituloFranja>Para probar en cada cliente · funciona en su rubro y casi no lo usa</TituloFranja>
          <ul>
            {conOportunidad.map((c) => (
              <li key={c.clientId} className="flex items-center gap-3 border-b border-l-linea py-2.5 last:border-b-0">
                <Sparkles className="h-4 w-4 shrink-0 text-l-marca" aria-hidden />
                <span className="min-w-0 flex-1 text-[14px]">
                  <Link to={`/clientes/${c.slug}`} className="font-medium text-inherit hover:text-l-marca">{c.cliente}</Link>
                  {": "}
                  <span className="font-medium">{c.oportunidad!.nombre}</span>
                  <span className="text-l-tinta-3">
                    {" "}rinde {veces(c.oportunidad!.indiceEnNicho)} en {c.nicho} ({c.oportunidad!.publicacionesNicho} publicaciones de {c.oportunidad!.cuentasNicho} cuentas); lo usó {c.oportunidad!.usosPropios} {c.oportunidad!.usosPropios === 1 ? "vez" : "veces"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}

interface ConScore {
  id: string; red: string; formato: string | null; fecha: string | null; permalink: string | null; texto: string;
  score: number | null; partes: Partial<Record<"consultas" | "viralidad" | "intencion" | "interaccion", number>>;
  interaccion: number; alcance: number | null; difusion: number | null; consultas: number | null; visitasPerfil: number | null; seguidores: number | null;
}
const ORDENES = {
  score: { nombre: "Mejor score", de: (p: ConScore) => p.score },
  consultas: { nombre: "Más consultas", de: (p: ConScore) => p.consultas },
  alcance: { nombre: "Más virales", de: (p: ConScore) => p.alcance },
} as const;
const NOMBRE_PARTE = { consultas: "consultas", viralidad: "viralidad", intencion: "visitas al perfil", interaccion: "interacción" } as const;
const num = (x: number) => Intl.NumberFormat("es-AR", { notation: "compact" }).format(x);

/**
 * Score de publicaciones (pedido 21/11): cada una contra las de la misma cuenta y red, por las consultas del
 * anuncio que la usa, su alcance y difusión, las visitas al perfil que trajo y su interacción. Lo que una
 * publicación no tiene medido no cuenta como cero: el score dice con qué partes se armó.
 */
function ScorePublicaciones({ clientId }: { clientId: string }) {
  const [orden, setOrden] = useState<keyof typeof ORDENES>("score");
  const q = useQuery({
    queryKey: ["lmtm", "contenido", "score", clientId],
    queryFn: () => api.get<{ dias: number; publicaciones: ConScore[]; conAlcance: number; pautadas: number }>(`/contenido/score-publicaciones?clientId=${clientId}`),
    staleTime: 30 * 60_000,
  });
  if (q.isLoading) return <p className="text-[14px] text-l-tinta-3">Calificando las publicaciones…</p>;
  const d = q.data;
  const conScore = d?.publicaciones.filter((p) => p.score != null) ?? [];
  if (!d || !conScore.length) {
    return (
      <Tarjeta>
        <TituloFranja>Score de publicaciones</TituloFranja>
        <p className="text-[14px] text-l-tinta-2">Todavía no se puede calificar: hacen falta al menos 5 publicaciones leídas de una misma red en los últimos 90 días.</p>
      </Tarjeta>
    );
  }
  const de = ORDENES[orden].de;
  const filas = conScore.filter((p) => de(p) != null).sort((a, b) => de(b)! - de(a)!).slice(0, 10);
  return (
    <Tarjeta>
      <TituloFranja>Score de publicaciones · {d.dias} días</TituloFranja>
      <div className="mb-2 flex flex-wrap gap-2">
        {(Object.keys(ORDENES) as Array<keyof typeof ORDENES>).map((k) => (
          <button key={k} type="button" onClick={() => setOrden(k)} aria-pressed={orden === k}
            className={`min-h-9 rounded-full border px-3 text-[13px] ${orden === k ? "border-l-marca text-l-tinta font-semibold" : "border-l-linea text-l-tinta-2 hover:text-l-tinta"}`}>
            {ORDENES[k].nombre}
          </button>
        ))}
      </div>
      {filas.length === 0 ? (
        <p className="py-3 text-[14px] text-l-tinta-2">
          {orden === "consultas" ? "Ninguna publicación de estos días se usó en un anuncio: no hay consultas que atribuirle a una publicación." : "Meta todavía no dio el alcance de estas publicaciones. Se lee en cada sincronización, solo para Instagram."}
        </p>
      ) : (
        <ul>
          {filas.map((p) => (
            <li key={p.id} className="flex items-start gap-3 border-b border-l-linea py-2.5 last:border-b-0">
              <span className="w-10 shrink-0 pt-0.5 text-right text-[18px] font-semibold tabular-nums" title="Score de 0 a 100 contra las publicaciones de esta cuenta">{p.score}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-l-tinta-3">{RED[p.red] ?? p.red} {p.formato ?? ""}{p.fecha ? ` · ${p.fecha.split("-").reverse().join("/")}` : ""}</span>
                <span className="block text-[14px] [overflow-wrap:anywhere]">{p.texto.slice(0, 140) || "Sin texto"}</span>
                <span className="mt-0.5 block text-[13px] text-l-tinta-2">
                  {[
                    p.consultas != null && `${p.consultas} ${p.consultas === 1 ? "consulta" : "consultas"} por pauta`,
                    p.alcance != null && `${num(p.alcance)} de alcance`,
                    p.difusion != null && `${num(p.difusion)} compartidos y guardados`,
                    p.visitasPerfil != null && `${num(p.visitasPerfil)} visitas al perfil`,
                    !!p.seguidores && `${num(p.seguidores)} seguidores nuevos`,
                    `${num(p.interaccion)} de interacción`,
                  ].filter(Boolean).join(" · ")}
                </span>
                <span className="block text-[12px] text-l-tinta-3">Score armado con: {(Object.keys(p.partes) as Array<keyof typeof NOMBRE_PARTE>).map((k) => NOMBRE_PARTE[k]).join(", ")}</span>
              </span>
              {p.permalink && (
                <a href={p.permalink} target="_blank" rel="noreferrer" className="shrink-0 pt-0.5 text-l-tinta-3 hover:text-l-tinta" aria-label="Ver la publicación">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-l-tinta-3">
        De 0 a 100 contra las publicaciones de esta misma cuenta y red: consultas 40, viralidad 25, visitas al perfil 20, interacción 15, solo con lo que cada una tiene medido.
        Las consultas son las del anuncio que usa esa publicación ({d.pautadas} pautadas); quien la vio y escribió por privado sin tocar nada no se puede contar. Con alcance: {d.conAlcance} de {d.publicaciones.length}.
      </p>
    </Tarjeta>
  );
}

/** Lo de un rubro, para la pantalla de Nichos. */
/** Lo de un cliente, para su ficha: sus mejores publicaciones, su mejor ángulo
 *  y lo que funciona en su rubro y no usa. */
export function QueFuncionaCliente({ clientId }: { clientId: string }) {
  const q = useQueFunciona();
  if (q.isLoading) return <p className="text-[14px] text-l-tinta-3">Midiendo…</p>;
  const c = q.data?.clientes.find((x) => x.clientId === clientId);
  if (!c) {
    return (
      <div className="space-y-4">
        <p className="text-[14px] text-l-tinta-2">
          Esta cuenta no tiene publicaciones suficientes leídas para medirla: hacen falta al menos 8 en una red y que lo normal sea 5 interacciones o más.
        </p>
        <ScorePublicaciones clientId={clientId} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ScorePublicaciones clientId={clientId} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta>
          <TituloFranja>Sus publicaciones que mejor rindieron</TituloFranja>
          <ul>
            {c.top.map((e) => (
              <li key={`${e.permalink}-${e.fecha}`} className="flex items-start gap-3 border-b border-l-linea py-2.5 last:border-b-0">
                <span className="w-12 shrink-0 pt-0.5 text-right text-[14px] font-semibold tabular-nums">{veces(e.indice)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-l-tinta-3">{RED[e.red] ?? e.red} {e.formato}{e.anguloNombre ? ` · ${e.anguloNombre}` : ""} · {e.fecha.split("-").reverse().join("/")}</span>
                  <span className="block text-[14px] [overflow-wrap:anywhere]">{e.texto.slice(0, 160)}</span>
                </span>
                {e.permalink && (
                  <a href={e.permalink} target="_blank" rel="noreferrer" className="shrink-0 pt-0.5 text-l-tinta-3 hover:text-l-tinta" aria-label="Ver la publicación">
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-l-tinta-3">Contra lo normal de esta cuenta en esa red, sobre {c.publicaciones} publicaciones medidas. Para reutilizar con otro formato u otro gancho.</p>
        </Tarjeta>
        <Tarjeta>
          <TituloFranja>Ángulos</TituloFranja>
          <div className="space-y-3 text-[14px]">
            {c.mejorAngulo ? (
              <p><span className="font-medium">Su mejor ángulo:</span> {c.mejorAngulo.nombre} <span className="text-l-tinta-3">{veces(c.mejorAngulo.indice)} en {c.mejorAngulo.publicaciones} publicaciones</span></p>
            ) : (
              <p className="text-l-tinta-3">Todavía no hay ningún ángulo con 3 publicaciones clasificadas en esta cuenta.</p>
            )}
            {c.oportunidad ? (
              <p className="flex gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-l-marca" aria-hidden />
                <span>
                  <span className="font-medium">Para probar:</span> {c.oportunidad.nombre} rinde {veces(c.oportunidad.indiceEnNicho)} en {c.nicho} ({c.oportunidad.publicacionesNicho} publicaciones de {c.oportunidad.cuentasNicho} cuentas) y esta cuenta lo usó {c.oportunidad.usosPropios} {c.oportunidad.usosPropios === 1 ? "vez" : "veces"}.
                </span>
              </p>
            ) : (
              <p className="text-l-tinta-3">Sin un ángulo del rubro que rinda más y esta cuenta no esté usando.</p>
            )}
          </div>
        </Tarjeta>
      </div>
      {c.nicho && <NichoVsCompetencia nicho={c.nicho} />}
    </div>
  );
}

/**
 * Nuestros clientes del rubro contra su competencia en Instagram (20/11: «las comparativas, más visuales»): qué ángulo
 * y qué formato rinde en cada lado y cuánto publica cada cuenta. Cada publicación contra lo normal de su cuenta.
 */
export function NichoVsCompetencia({ nicho }: { nicho: string }) {
  const q = useQueFunciona();
  const mismo = (x: { nicho: string }) => x.nicho.toLowerCase() === nicho.toLowerCase();
  const nuestro = q.data?.nichos.find(mismo);
  const comp = q.data?.competencia?.nichos.find(mismo);
  if (q.isLoading) return <p className="text-[13px] text-l-tinta-3">Midiendo las publicaciones del rubro…</p>;
  if (!nuestro && !comp) return null;
  const veces = (x: number) => `${x.toFixed(1).replace(".", ",")}×`;
  const par = (de: "angulos" | "formatos", max: number) => {
    const claves = [...new Set([...(nuestro?.[de] ?? []), ...(comp?.[de] ?? [])].sort((a, b) => b.indice - a.indice).map((f) => f.clave))].slice(0, max);
    return claves.map((clave) => {
      const a = nuestro?.[de].find((f) => f.clave === clave);
      const b = comp?.[de].find((f) => f.clave === clave);
      // Con cuántas publicaciones se midió cada lado: un 2× de 10 publicaciones no pesa como uno de 300.
      return { etiqueta: `${(a ?? b)!.nombre.replace(/^Instagram · /, "")} · ${a?.publicaciones ?? "pocas"} nuestras, ${b?.publicaciones ?? "pocas"} de la competencia`, a: a?.indice ?? 0, b: b?.indice ?? 0 };
    });
  };
  return (
    <Tarjeta>
      <TituloFranja>Qué funciona en redes · nosotros contra la competencia · {q.data!.dias} días</TituloFranja>
      {comp && nuestro ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-[14px] font-semibold">Ángulos que más rinden <span className="font-normal text-l-tinta-3">· 1× = lo normal de ese formato en cada cuenta</span></h3>
            <BarrasPar grupos={par("angulos", 6)} nombres={["Nuestros clientes", "Competencia"]} formato={veces} tope={5} />
          </div>
          <div className="space-y-8">
            <div>
              <h3 className="mb-3 text-[14px] font-semibold">Formatos</h3>
              <BarrasPar grupos={par("formatos", 4)} nombres={["Nuestros clientes", "Competencia"]} formato={veces} tope={5} />
            </div>
            <div>
              <h3 className="mb-3 text-[14px] font-semibold">Publicaciones por cuenta</h3>
              <BarrasPar
                grupos={[{ etiqueta: `${nuestro.cuentas} cuentas nuestras · ${comp.cuentas} de la competencia`, a: nuestro.publicaciones / nuestro.cuentas, b: comp.publicaciones / comp.cuentas }]}
                nombres={["Nuestros clientes", "Competencia"]}
                formato={(x) => Math.round(x).toLocaleString("es-AR")}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-[14px] font-semibold">Ángulos que más rinden</h3>
            <BarrasH filas={(nuestro ?? comp)!.angulos.slice(0, 6).map((f) => ({ etiqueta: f.nombre, valor: f.indice, detalle: `${f.publicaciones} publicaciones` }))} formato={veces} referencia={{ valor: 1, etiqueta: "lo normal de cada cuenta (1×)" }} />
          </div>
          <div>
            <h3 className="mb-3 text-[14px] font-semibold">Formatos</h3>
            <BarrasH filas={(nuestro ?? comp)!.formatos.map((f) => ({ etiqueta: f.nombre.replace(/^Instagram · /, ""), valor: f.indice, detalle: `${f.publicaciones} publicaciones` }))} formato={veces} referencia={{ valor: 1, etiqueta: "lo normal de cada cuenta (1×)" }} />
            <p className="mt-4 text-[12px] text-l-tinta-3">{comp ? "Son de la competencia: de nuestras cuentas del rubro todavía no hay muestra suficiente." : "Todavía no hay dos cuentas de la competencia medidas en este rubro."}</p>
          </div>
        </div>
      )}
      <p className="mt-5 text-[12px] text-l-tinta-3">
        <Link to="/contenido/calendario#que-funciona" className="text-l-tinta-2 hover:text-l-marca">Todas las cuentas →</Link>
      </p>
    </Tarjeta>
  );
}
