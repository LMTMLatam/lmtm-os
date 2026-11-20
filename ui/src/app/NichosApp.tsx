// LMTM: Nichos en la app propia (pedido 7/10: "mantener el que había antes
// pero mucho más pulido"). Un rubro a la vez, con lo que hace falta para
// decidir contenido y pauta:
//  · qué funciona en orgánico en las cuentas del rubro (ángulos y formatos,
//    cada publicación contra lo normal de su cuenta);
//  · la pauta de 30 días contra la mejor del rubro (meta alcanzable = el cuarto
//    de mejores cuentas del mismo rubro);
//  · el radar semanal del agente, las acciones, las ideas, las referencias de
//    video y la competencia — todo lo que tenía la pantalla de antes.
// Abajo, ordenar rubros (renombrar, asignar clientes), igual que antes.

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Briefcase, ExternalLink, Loader2, OctagonAlert, X } from "lucide-react";
import { Link } from "@/lib/router";
import { nichesApi, type NicheIntel } from "../api/niches";
import { NicheManager, VideoRefRow } from "./nichos-edicion";
import { Encabezado } from "./Shell";
import { Tarjeta, TituloFranja } from "./HoyApp";
import { QueFuncionaNicho, useQueFunciona } from "./QueFunciona";
import { BarrasH, BarrasPar } from "../lmtm/graficos";

const pesos = (n: number) => `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)}`;
const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;

export function NichosApp() {
  const q = useQuery({ queryKey: ["niches"], queryFn: () => nichesApi.list(), staleTime: 10 * 60_000 });
  const nichos = q.data?.niches ?? [];
  const [elegido, setElegido] = useState<string | null>(null);
  const n = nichos.find((x) => x.niche === elegido) ?? nichos[0] ?? null;

  return (
    <>
      <Encabezado titulo="Nichos" bajada="Cada rubro con lo que funciona en sus cuentas, su pauta contra la mejor del rubro y el radar de la semana" />
      <div className="space-y-6 px-4 pb-10 md:px-8">
        {q.isLoading && <p className="flex items-center gap-2 text-[14px] text-l-tinta-3"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo los rubros…</p>}
        {q.error && <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert"><OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se pudieron leer los rubros.</p>}

        {nichos.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Rubro">
            {nichos.map((x) => {
              const activo = x.niche === n?.niche;
              return (
                <button
                  key={x.niche}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  onClick={() => setElegido(x.niche)}
                  className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] transition-colors ${activo ? "border-transparent bg-[image:var(--l-marca-grad)] font-semibold text-l-marca-tinta" : "border-l-linea-2 text-l-tinta-2 hover:border-l-tinta-3"}`}
                >
                  {x.niche} <span className={activo ? "opacity-70" : "text-l-tinta-3"}>{x.clients.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {n && <Rubro key={n.niche} n={n} />}

        <NicheManager />
      </div>
    </>
  );
}

function Rubro({ n }: { n: NicheIntel }) {
  const [kit, setKit] = useState<string | null>(null);
  const gen = useMutation({ mutationFn: () => nichesApi.salesKit(n.niche), onSuccess: (d) => setKit(d.onePager) });
  const ev = n.benchmark?.evidence ?? null;
  const conPauta = n.clients.filter((c) => c.ads30d && c.ads30d.impressions > 0);
  const enOtraMoneda = n.clients.filter((c) => c.monedaCuenta);
  const sinPauta = n.clients.filter((c) => !c.monedaCuenta && (!c.ads30d || c.ads30d.impressions === 0));
  const r = n.report?.sections;
  const ctrs = conPauta.filter((c) => c.ads30d!.ctr != null && !c.monedaCuenta).map((c) => ({ etiqueta: c.name, valor: c.ads30d!.ctr! })).sort((a, b) => b.valor - a.valor);
  const cpls = conPauta.filter((c) => c.ads30d!.cpl != null && !c.ads30d!.leadsDudosos && !c.monedaCuenta).map((c) => ({ etiqueta: c.name, valor: c.ads30d!.cpl! })).sort((a, b) => a.valor - b.valor);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{n.niche}</h2>
        <span className="text-[13px] text-l-tinta-3">{n.clients.length} {n.clients.length === 1 ? "cliente" : "clientes"}</span>
        <button
          type="button"
          onClick={() => gen.mutate()}
          disabled={gen.isPending}
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-l-linea-2 px-3 text-[13px] text-l-tinta-2 hover:text-l-tinta disabled:opacity-50"
        >
          {gen.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Briefcase className="h-4 w-4" aria-hidden />}
          Kit de venta del rubro
        </button>
      </div>

      {kit && (
        <Tarjeta className="relative">
          <button type="button" onClick={() => setKit(null)} className="absolute right-3 top-3 text-l-tinta-3 hover:text-l-tinta" aria-label="Cerrar"><X className="h-4 w-4" aria-hidden /></button>
          <TituloFranja>Kit de venta · {n.niche}</TituloFranja>
          <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-l-tinta-2">{kit}</pre>
        </Tarjeta>
      )}

      <Tarjeta>
        <TituloFranja>Qué funciona en orgánico · cuentas del rubro</TituloFranja>
        <QueFuncionaNicho nicho={n.niche} />
        <p className="mt-3 text-[12px] text-l-tinta-3">Cada publicación contra lo normal de su cuenta (1× = lo normal). <Link to="/contenido/calendario#que-funciona" className="text-l-tinta-2 hover:text-l-marca">Todas las cuentas →</Link></p>
      </Tarjeta>

      <Tarjeta>
        <TituloFranja>Pauta · últimos 30 días</TituloFranja>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cifra etiqueta="Inversión" valor={pesos(n.ads30d.spend)} />
          <Cifra etiqueta="Resultados" valor={n.ads30d.leads.toLocaleString("es-AR")} />
          <Cifra etiqueta="CTR en Meta" valor={n.ads30d.ctr != null ? pct(n.ads30d.ctr) : "—"} meta={ev?.idealCtr != null ? pct(ev.idealCtr) : null} avance={n.ads30d.ctr != null && ev?.idealCtr ? n.ads30d.ctr / ev.idealCtr : null} />
          <Cifra etiqueta="Costo por resultado" valor={n.ads30d.cpl != null ? pesos(n.ads30d.cpl) : "—"} meta={ev?.idealCpl != null ? pesos(ev.idealCpl) : null} avance={n.ads30d.cpl && ev?.idealCpl ? ev.idealCpl / n.ads30d.cpl : null} />
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          {ctrs.length > 0 && (
            <div>
              <h3 className="mb-3 text-[14px] font-semibold">CTR en Meta por cliente</h3>
              <BarrasH filas={ctrs} formato={pct} referencia={ev?.idealCtr ? { valor: ev.idealCtr, etiqueta: "la meta alcanzable del rubro" } : undefined} />
            </div>
          )}
          {cpls.length > 0 && (
            <div>
              <h3 className="mb-3 text-[14px] font-semibold">Costo por resultado por cliente <span className="font-normal text-l-tinta-3">· más corto es mejor</span></h3>
              <BarrasH filas={cpls} formato={pesos} referencia={ev?.idealCpl ? { valor: ev.idealCpl, etiqueta: "la meta alcanzable del rubro" } : undefined} />
            </div>
          )}
        </div>
        {(sinPauta.length > 0 || enOtraMoneda.length > 0 || conPauta.some((c) => c.ads30d?.leadsDudosos)) && (
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-l-linea pt-3">
            {sinPauta.map((c) => (
              <span key={c.id} className="rounded-full border border-l-linea-2 px-2.5 py-1 text-[12px] text-l-tinta-3" title={c.syncStatus?.status === "failed" ? "No podemos leer la cuenta" : "Sin pauta en 30 días"}>
                {c.name} · {c.syncStatus?.status === "failed" ? "sin acceso" : "sin pauta"}
              </span>
            ))}
            {enOtraMoneda.map((c) => (
              <span key={c.id} className="rounded-full border border-l-linea-2 px-2.5 py-1 text-[12px] text-l-tinta-3" title="La cuenta factura en otra moneda: no se suma ni compara en pesos">{c.name} · {c.monedaCuenta}</span>
            ))}
            {conPauta.filter((c) => c.ads30d?.leadsDudosos).map((c) => (
              <span key={`d-${c.id}`} className="rounded-full border border-l-atencion px-2.5 py-1 text-[12px] text-l-atencion-texto" title="Google cuenta como conversión más de un tercio de los clics: no son consultas">{c.name} · Google sin confirmar</span>
            ))}
          </div>
        )}
        {n.topCampaigns.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-3 text-[14px] font-semibold">Mejores campañas del rubro por CTR</h3>
            <BarrasH filas={n.topCampaigns.slice(0, 6).map((c) => ({ etiqueta: `${c.clientName} · ${c.name}`, valor: c.ctr, detalle: c.cpl != null ? `${pesos(c.cpl)} por resultado` : undefined }))} formato={pct} />
          </div>
        )}
        <p className="mt-4 text-[11px] text-l-tinta-3">{ev ? `Meta alcanzable: el promedio del cuarto de mejores cuentas del rubro (${ev.clients ?? "?"} con pauta). ` : ""}CTR solo de Meta; sin las conversiones dudosas de Google.</p>
      </Tarjeta>

      <NosotrosVsCompetencia nicho={n.niche} />

      {n.report && r && (
        <Plegable titulo={`Radar de la semana del ${n.report.week.split("-").reverse().join("/")}`} detalle="lo escribe el agente del rubro">
          <div className="space-y-4 text-[13px] leading-relaxed">
            {(r.analisisCruzado?.organico || r.analisisCruzado?.pauta) && (
              <div className="grid gap-3 md:grid-cols-2">
                {r.analisisCruzado?.organico && <p><span className="font-medium">Orgánico. </span><span className="text-l-tinta-2">{r.analisisCruzado.organico}</span></p>}
                {r.analisisCruzado?.pauta && <p><span className="font-medium">Pauta. </span><span className="text-l-tinta-2">{r.analisisCruzado.pauta}</span></p>}
              </div>
            )}
            {(r.ideas?.length ?? 0) > 0 && (
              <div>
                <div className="mb-1 text-[12px] font-medium text-l-tinta-2">Ideas con referencia</div>
                <ul className="space-y-1.5">
                  {r.ideas!.map((idea, i) => (
                    <li key={i}>
                      <span className="font-medium">{idea.titulo}</span>
                      {idea.url && <a href={idea.url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 text-l-tinta-2 hover:text-l-marca">referencia <ExternalLink className="h-3 w-3" aria-hidden /></a>}
                      {idea.detalle && <span className="block text-l-tinta-3">{idea.detalle}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(r.referentes?.length ?? 0) > 0 && (
              <div>
                <div className="mb-1 text-[12px] font-medium text-l-tinta-2">Referentes de afuera (no son clientes nuestros)</div>
                <ul className="space-y-1">
                  {r.referentes!.map((x, i) => (
                    <li key={i} className="text-l-tinta-2">
                      <span className="font-medium text-l-tinta">{x.nombre}</span>
                      {x.plataforma && <span className="text-l-tinta-3"> · {x.plataforma}</span>}
                      {x.queHacen && <span> — {x.queHacen}</span>}
                      {x.urlEjemplo && <a href={x.urlEjemplo} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 hover:text-l-marca">ejemplo <ExternalLink className="h-3 w-3" aria-hidden /></a>}
                      {!x.urlEjemplo && x.urlPerfil && <a href={x.urlPerfil} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 hover:text-l-marca">perfil <ExternalLink className="h-3 w-3" aria-hidden /></a>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(r.planPorCliente?.length ?? 0) > 0 && (
              <div>
                <div className="mb-1 text-[12px] font-medium text-l-tinta-2">Para dónde ir con cada cliente</div>
                <ul className="space-y-1.5">
                  {r.planPorCliente!.map((p, i) => (
                    <li key={i}>
                      <span className="font-medium">{p.cliente}: </span>
                      <span className="text-l-tinta-2">{p.movidas.join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Plegable>
      )}

      {(n.actions.length > 0 || n.experiment || n.hooks.length > 0 || n.trends.length > 0) && (
        <Plegable titulo="Acciones e ideas" detalle={`${n.actions.length + n.hooks.length + n.trends.length + (n.experiment ? 1 : 0)}`}>
          <ul className="space-y-2 text-[13px]">
            {n.actions.map((a, i) => (
              <li key={`a${i}`} className="flex items-start gap-2">
                <Marca texto={a.kind === "idea" ? "idea" : a.priority === 1 ? "urgente" : a.priority === 2 ? "mejora" : "sumar"} fuerte={a.priority === 1} />
                <span className="text-l-tinta-2">
                  {a.action}
                  {a.clientSlug && <Link to={`/clientes/${a.clientSlug}`} className="ml-1 text-l-tinta hover:text-l-marca">ver cliente →</Link>}
                </span>
              </li>
            ))}
            {n.experiment && (
              <li className="flex items-start gap-2"><Marca texto="probar" /><span className="text-l-tinta-2">{n.experiment.pattern}</span></li>
            )}
            {n.hooks.map((h, i) => (
              <li key={`h${i}`} className="flex items-start gap-2"><Marca texto="gancho" /><span className="text-l-tinta-2">{h.text}{h.format ? <span className="text-l-tinta-3"> · {h.format}</span> : null}</span></li>
            ))}
            {n.trends.map((t, i) => (
              <li key={`t${i}`} className="flex items-start gap-2">
                <Marca texto="tendencia" />
                <span className="text-l-tinta-2">
                  {t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="hover:text-l-marca">{t.title}</a> : t.title}
                </span>
              </li>
            ))}
          </ul>
        </Plegable>
      )}

      {n.videoReferences.length > 0 && (
        <Tarjeta>
          <TituloFranja>Referencias de video del rubro</TituloFranja>
          <p className="-mt-1.5 mb-2 text-[12px] text-l-tinta-3">Etiquetá tipo y concepto: guían al agente cuando arma contenido en Super Redes.</p>
          <div className="divide-y divide-l-linea">
            {n.videoReferences.map((v) => <VideoRefRow key={v.id} nicheKey={n.niche} r={v} />)}
          </div>
        </Tarjeta>
      )}

      {n.competitors.length > 0 && (
        <Tarjeta>
          <TituloFranja>Competencia cargada · {n.competitors.length}</TituloFranja>
          <div className="flex flex-wrap gap-1.5">
            {n.competitors.map((c, i) => (
              <span key={i} className="rounded-full border border-l-linea-2 px-2.5 py-1 text-[12px] text-l-tinta-2" title={`Competidor de ${c.clientName}`}>{c.name}</span>
            ))}
          </div>
        </Tarjeta>
      )}
    </div>
  );
}

/** Un número del rubro; con meta, una barra de cuánto le falta (llena = en la meta o mejor). */
function Cifra({ etiqueta, valor, meta, avance }: { etiqueta: string; valor: string; meta?: string | null; avance?: number | null }) {
  return (
    <div className="rounded-[14px] border border-l-linea px-3 py-2.5">
      <div className="text-[12px] text-l-tinta-3">{etiqueta}</div>
      <div className="mt-0.5 text-[22px] font-semibold tabular-nums tracking-[-0.01em]">{valor}</div>
      {avance != null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-l-linea" aria-hidden>
          <div className={`h-full rounded-full ${avance >= 1 ? "bg-l-bien" : "bg-[var(--l-serie-2)]"}`} style={{ width: `${Math.min(100, avance * 100)}%` }} />
        </div>
      )}
      {meta && <div className="mt-1 text-[12px] text-l-tinta-3">meta {meta}</div>}
    </div>
  );
}

/** Texto largo (del agente) plegado: se abre si hace falta. */
function Plegable({ titulo, detalle, children }: { titulo: string; detalle?: string; children: React.ReactNode }) {
  return (
    <details className="rounded-2xl border border-l-linea bg-l-sup px-4 py-3">
      <summary className="min-h-10 cursor-pointer py-1 text-[14px] font-semibold text-l-tinta">
        {titulo} {detalle && <span className="font-normal text-l-tinta-3">· {detalle}</span>}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** Nuestros clientes del rubro contra su competencia en Instagram: cuánto publican y qué formato rinde. */
function NosotrosVsCompetencia({ nicho }: { nicho: string }) {
  const q = useQueFunciona();
  const nuestro = q.data?.nichos.find((x) => x.nicho === nicho);
  const comp = q.data?.competencia?.nichos.find((x) => x.nicho === nicho);
  if (!nuestro || !comp || nuestro.cuentas === 0 || comp.cuentas === 0) return null;
  const formatos = [...new Set([...nuestro.formatos, ...comp.formatos].map((f) => f.clave))].map((clave) => ({
    etiqueta: (nuestro.formatos.find((f) => f.clave === clave) ?? comp.formatos.find((f) => f.clave === clave))!.nombre.replace(/^Instagram · /, ""),
    a: nuestro.formatos.find((f) => f.clave === clave)?.indice ?? 0,
    b: comp.formatos.find((f) => f.clave === clave)?.indice ?? 0,
  }));
  const veces = (x: number) => `${x.toFixed(1).replace(".", ",")}×`;
  return (
    <Tarjeta>
      <TituloFranja>Nosotros contra la competencia · {q.data!.dias} días</TituloFranja>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-[14px] font-semibold">Publicaciones por cuenta</h3>
          <BarrasPar grupos={[{ etiqueta: `${nuestro.cuentas} cuentas nuestras · ${comp.cuentas} de la competencia`, a: nuestro.publicaciones / nuestro.cuentas, b: comp.publicaciones / comp.cuentas }]} nombres={["Nuestros clientes", "Competencia"]} formato={(x) => Math.round(x).toLocaleString("es-AR")} />
        </div>
        <div>
          <h3 className="mb-3 text-[14px] font-semibold">Qué formato rinde <span className="font-normal text-l-tinta-3">· contra lo normal de cada cuenta</span></h3>
          <BarrasPar grupos={formatos} nombres={["Nuestros clientes", "Competencia"]} formato={veces} />
        </div>
      </div>
    </Tarjeta>
  );
}

function Marca({ texto, fuerte }: { texto: string; fuerte?: boolean }) {
  return (
    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${fuerte ? "bg-l-critico-suave text-l-critico-texto" : "bg-l-marca-suave text-l-marca"}`}>{texto}</span>
  );
}
