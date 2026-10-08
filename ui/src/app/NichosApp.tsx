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
import { Briefcase, ExternalLink, Loader2, Megaphone, OctagonAlert, X } from "lucide-react";
import { Link } from "@/lib/router";
import { nichesApi, type NicheIntel } from "../api/niches";
import { NicheManager, VideoRefRow } from "./nichos-edicion";
import { Encabezado } from "./Shell";
import { Tarjeta, TituloFranja } from "./HoyApp";
import { QueFuncionaNicho } from "./QueFunciona";

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
                  className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] transition-colors ${activo ? "border-l-tinta bg-l-tinta font-semibold text-l-papel" : "border-l-linea-2 text-l-tinta-2 hover:border-l-tinta-3"}`}
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
        <p className="mt-3 text-[12px] text-l-tinta-3">Cada publicación contra lo normal de su cuenta (1× = lo normal). <Link to="/contenido#que-funciona" className="text-l-tinta-2 hover:text-l-marca">Todas las cuentas →</Link></p>
      </Tarjeta>

      <Tarjeta>
        <TituloFranja>Pauta · últimos 30 días</TituloFranja>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cifra etiqueta="Inversión" valor={pesos(n.ads30d.spend)} />
          <Cifra etiqueta="Resultados" valor={n.ads30d.leads.toLocaleString("es-AR")} />
          <Cifra etiqueta="CTR en Meta" valor={n.ads30d.ctr != null ? pct(n.ads30d.ctr) : "—"} meta={ev?.idealCtr != null ? pct(ev.idealCtr) : null} />
          <Cifra etiqueta="Costo por resultado" valor={n.ads30d.cpl != null ? pesos(n.ads30d.cpl) : "—"} meta={ev?.idealCpl != null ? pesos(ev.idealCpl) : null} />
        </div>
        <p className="mt-2 text-[12px] text-l-tinta-3">
          {ev ? `Meta alcanzable: el promedio del cuarto de mejores cuentas del rubro (${ev.clients ?? "?"} cuentas con pauta). ` : ""}
          El CTR se compara solo en Meta (el de búsqueda de Google es de otra escala). Resultados y costo por resultado no incluyen las cuentas de Google que cuentan como conversión cualquier acción.
        </p>
        {conPauta.length > 0 && (
          <ul className="mt-3">
            {conPauta.map((c) => {
              const a = c.ads30d!;
              const ctrOk = ev?.idealCtr != null && a.ctr != null ? a.ctr >= ev.idealCtr : null;
              const cplOk = a.cpl != null && ev?.idealCpl != null ? a.cpl <= ev.idealCpl : null;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-b border-l-linea py-2 text-[13px] last:border-b-0">
                  <Link to={`/clientes/${c.slug}`} className="min-w-[10rem] flex-1 font-medium text-inherit hover:text-l-marca">{c.name}</Link>
                  <span className="tabular-nums text-l-tinta-3">{pesos(a.spend)}</span>
                  <span className="tabular-nums text-l-tinta-3">{a.leads} resultados</span>
                  {a.ctr != null && <span className={`tabular-nums ${ctrOk === false ? "text-l-atencion-texto" : "text-l-tinta-2"}`}>CTR {pct(a.ctr)}</span>}
                  <span className={`tabular-nums ${cplOk === false ? "text-l-atencion-texto" : "text-l-tinta-2"}`}>{a.cpl != null ? `${pesos(a.cpl)} c/u` : "sin resultados"}</span>
                  {a.leadsDudosos && <span className="rounded-full border border-l-atencion px-2 py-0.5 text-[11px] font-medium text-l-atencion-texto" title="Google cuenta como conversión más de un tercio de los clics: no son leads. Hay que corregir las acciones de conversión en la cuenta.">conversiones de Google sin confirmar</span>}
                </li>
              );
            })}
          </ul>
        )}
        {sinPauta.length > 0 && (
          <p className="mt-2 text-[12px] text-l-tinta-3">
            Sin pauta en 30 días: {sinPauta.map((c) => (c.syncStatus?.status === "failed" ? `${c.name} (no podemos leer la cuenta)` : c.name)).join(", ")}.
          </p>
        )}
        {enOtraMoneda.length > 0 && (
          <p className="mt-1 text-[12px] text-l-tinta-3">
            Con la cuenta en otra moneda (no se suman ni comparan en pesos): {enOtraMoneda.map((c) => `${c.name} (${c.monedaCuenta})`).join(", ")}.
          </p>
        )}
        {n.topCampaigns.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[12px] font-medium text-l-tinta-2">Mejores campañas del rubro por CTR</div>
            <ul>
              {n.topCampaigns.map((c, i) => (
                <li key={i} className="flex items-center gap-2 py-1 text-[13px]">
                  <Megaphone className="h-3.5 w-3.5 shrink-0 text-l-tinta-3" aria-hidden />
                  <span className="min-w-0 flex-1 truncate" title={c.name}>{c.name}</span>
                  <span className="shrink-0 text-[12px] text-l-tinta-3">{c.clientName} · CTR {pct(c.ctr)}{c.cpl != null ? ` · ${pesos(c.cpl)} c/u` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Tarjeta>

      {n.report && r && (
        <Tarjeta>
          <TituloFranja>Radar de la semana del {n.report.week.split("-").reverse().join("/")} · lo escribe el agente del rubro</TituloFranja>
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
        </Tarjeta>
      )}

      {(n.actions.length > 0 || n.experiment || n.hooks.length > 0 || n.trends.length > 0) && (
        <Tarjeta>
          <TituloFranja>Acciones e ideas</TituloFranja>
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
        </Tarjeta>
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

function Cifra({ etiqueta, valor, meta }: { etiqueta: string; valor: string; meta?: string | null }) {
  return (
    <div className="rounded-xl border border-l-linea px-3 py-2.5">
      <div className="text-[12px] text-l-tinta-3">{etiqueta}</div>
      <div className="mt-0.5 text-[20px] font-semibold tabular-nums tracking-[-0.01em]">{valor}</div>
      {meta && <div className="text-[12px] text-l-tinta-3">meta alcanzable {meta}</div>}
    </div>
  );
}

function Marca({ texto, fuerte }: { texto: string; fuerte?: boolean }) {
  return (
    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${fuerte ? "bg-l-critico-suave text-l-critico-texto" : "bg-l-marca-suave text-l-marca"}`}>{texto}</span>
  );
}
