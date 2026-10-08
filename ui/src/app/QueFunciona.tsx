// LMTM: qué contenido funciona, comparando todas las cuentas (pedido 7/10).
// Cada publicación se mide contra lo normal de SU cuenta en esa red: 2× es el
// doble de lo que esa cuenta suele sacar. Así una cuenta chica y una grande se
// comparan sin que gane la que tiene más seguidores. Datos de
// /api/contenido/que-funciona (services/contenido-analisis.ts).

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, OctagonAlert, Sparkles } from "lucide-react";
import { Link } from "@/lib/router";
import { api } from "../api/client";
import { Tarjeta, TituloFranja } from "./HoyApp";

export interface Ejemplo {
  clientId: string; cliente: string; slug: string; red: string; formato: string;
  angulo: string | null; anguloNombre: string | null;
  indice: number; engagement: number; fecha: string; permalink: string | null; texto: string;
}
export interface Fila { clave: string; nombre: string; publicaciones: number; cuentas: number; indice: number; mejor: Ejemplo }
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
    estado: { conInstagram: number; medidas: number; noEncontradas: number; noEmpresa: number; otras: number; sinRevisar: number };
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
        {f.publicaciones} publicaciones de {f.cuentas} {f.cuentas === 1 ? "cuenta" : "cuentas"}
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
      esa red (1× = lo normal). Interacción = reacciones + comentarios×3 + compartidos×5; Meta no nos da el alcance de estas cuentas. Una fila aparece con al
      menos 6 publicaciones de 2 cuentas.
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

/** Lo de un rubro, para la pantalla de Nichos. */
export function QueFuncionaNicho({ nicho }: { nicho: string }) {
  const q = useQueFunciona();
  const mismo = (x: { nicho: string }) => x.nicho.toLowerCase() === nicho.toLowerCase();
  const n = q.data?.nichos.find(mismo);
  const comp = q.data?.competencia;
  const c = comp?.nichos.find(mismo);
  if (q.isLoading) return <p className="text-[13px] text-l-tinta-3">Midiendo…</p>;
  return (
    <div className="space-y-6">
      {n ? <RankingNicho n={n} /> : <p className="text-[13px] text-l-tinta-3">Menos de dos cuentas propias de este rubro tienen publicaciones suficientes leídas: no se puede comparar entre clientes todavía.</p>}
      <div>
        <div className="mb-1 text-[13px] font-semibold">La competencia</div>
        {c ? (
          <>
            <RankingNicho n={c} />
            <p className="mt-2 text-[12px] text-l-tinta-3">Cuentas de Instagram de los competidores cargados en cada cliente, cada publicación contra lo normal de su cuenta. Se toma el ángulo o el formato, nunca el texto.</p>
          </>
        ) : (
          <p className="text-[13px] text-l-tinta-3">
            Todavía no hay dos cuentas de la competencia medidas en este rubro.
            {comp ? ` En toda la agencia: ${comp.estado.medidas} de ${comp.estado.conInstagram} cuentas con Instagram medidas${comp.estado.sinRevisar ? `, ${comp.estado.sinRevisar} por leer` : ""}${comp.estado.noEncontradas + comp.estado.noEmpresa ? `, ${comp.estado.noEncontradas + comp.estado.noEmpresa} que Instagram no devuelve (usuario mal cargado o cuenta personal)` : ""}.` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function RankingNicho({ n }: { n: { cuentas: number; publicaciones: number; angulos: Fila[]; formatos: Fila[] } }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="mb-1 text-[12px] font-medium text-l-tinta-2">Ángulos · {n.cuentas} cuentas, {n.publicaciones} publicaciones</div>
        {n.angulos.length ? <ul>{n.angulos.map((f) => <FilaRanking key={f.clave} f={f} />)}</ul> : <p className="text-[13px] text-l-tinta-3">Sin muestra suficiente por ángulo.</p>}
      </div>
      <div>
        <div className="mb-1 text-[12px] font-medium text-l-tinta-2">Formatos</div>
        {n.formatos.length ? <ul>{n.formatos.map((f) => <FilaRanking key={f.clave} f={f} />)}</ul> : <p className="text-[13px] text-l-tinta-3">Sin muestra suficiente por formato.</p>}
      </div>
    </div>
  );
}

/** Tarjeta chica para Hoy: lo que más rinde y lo que se puede reutilizar. */
export function TarjetaQueFunciona() {
  const q = useQueFunciona();
  const a = q.data;
  const angulo = a?.angulos[0] ?? null;
  const formato = a?.formatos[0] ?? null;
  return (
    <Link to="/contenido#que-funciona" className="block text-inherit">
      <Tarjeta className="h-full hover:border-l-tinta-3">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-l-tinta-2">
          <Sparkles className="h-4 w-4" aria-hidden /> Lo que funciona
        </div>
        {q.isLoading ? (
          <div className="mt-2 text-[13px] text-l-tinta-3">Midiendo…</div>
        ) : !a || (!angulo && !formato) ? (
          <div className="mt-1 text-[24px] italic text-l-tinta-3">sin dato</div>
        ) : (
          <div className="mt-1.5 space-y-1 text-[13px]">
            {angulo && <div><span className="font-semibold">{angulo.nombre}</span> <span className="text-l-tinta-3">rinde {veces(angulo.indice)} lo normal</span></div>}
            {formato && <div><span className="font-semibold">{formato.clave}</span> <span className="text-l-tinta-3">{veces(formato.indice)}</span></div>}
            <div className="text-[12px] text-l-tinta-3">{a.reutilizar.length} publicaciones para reutilizar</div>
          </div>
        )}
      </Tarjeta>
    </Link>
  );
}

/** Lo de un cliente, para su ficha: sus mejores publicaciones, su mejor ángulo
 *  y lo que funciona en su rubro y no usa. */
export function QueFuncionaCliente({ clientId }: { clientId: string }) {
  const q = useQueFunciona();
  if (q.isLoading) return <p className="text-[14px] text-l-tinta-3">Midiendo…</p>;
  const c = q.data?.clientes.find((x) => x.clientId === clientId);
  if (!c) {
    return (
      <p className="text-[14px] text-l-tinta-2">
        Esta cuenta no tiene publicaciones suficientes leídas para medirla: hacen falta al menos 8 en una red y que lo normal sea 5 interacciones o más.
      </p>
    );
  }
  return (
    <div className="space-y-4">
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
      {c.nicho && (
        <Tarjeta>
          <TituloFranja>Lo que funciona en {c.nicho}</TituloFranja>
          <QueFuncionaNicho nicho={c.nicho} />
        </Tarjeta>
      )}
    </div>
  );
}
