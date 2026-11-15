// LMTM: Preparación de clientes (plan 15/11, fase 5). Reemplaza a la pantalla vieja
// «Readiness» y le suma la cobertura del cerebro: qué le falta a cada cliente para
// operar solo (cuentas, planilla, script) Y para que los agentes y Claude lo
// conozcan (marca, logo, productos, NAS). Agrupado por arreglo, de mayor a menor
// cantidad de clientes que destraba; la matriz completa abajo.

import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Link } from "@/lib/router";
import { api } from "../api/client";
import { readinessApi } from "../api/readiness";
import { Encabezado } from "./Shell";
import { Tarjeta, TituloFranja } from "./HoyApp";

const OPERACION: Record<string, { etiqueta: string; link?: string }> = {
  metaAdAccount: { etiqueta: "Cuenta de Meta Ads", link: "/conexiones" },
  googleAdAccount: { etiqueta: "Cuenta de Google Ads", link: "/conexiones" },
  metaPage: { etiqueta: "Página de Meta", link: "/conexiones" },
  rubro: { etiqueta: "Rubro" },
  location: { etiqueta: "Ubicación" },
  sheetRedes: { etiqueta: "Planilla de redes" },
  scriptRedes: { etiqueta: "Script de la planilla" },
  sheetProduccion: { etiqueta: "Planilla de producción" },
  brain: { etiqueta: "Memoria del cliente" },
};

interface Cobertura { promedio: number | null; clientes: Array<{ clientId: string; cliente: string; porcentaje: number; falta: string[] }> }

export function PreparacionApp() {
  const ops = useQuery({ queryKey: ["readiness"], queryFn: () => readinessApi.get(), staleTime: 5 * 60_000 });
  const cob = useQuery({ queryKey: ["lmtm", "cerebro", "cobertura"], queryFn: () => api.get<Cobertura>("/cerebro/cobertura"), staleTime: 5 * 60_000 });
  const clientes = ops.data?.clients ?? [];
  const porId = new Map((cob.data?.clientes ?? []).map((c) => [c.clientId, c]));

  // Un arreglo = un hueco que se repite en varios clientes. Los dos orígenes juntos.
  const huecos = new Map<string, { etiqueta: string; link?: string; clientes: string[] }>();
  for (const c of clientes) {
    for (const [k, v] of Object.entries(OPERACION)) {
      if ((c.checks as Record<string, boolean>)[k]) continue;
      const h = huecos.get(k) ?? { etiqueta: v.etiqueta, link: v.link, clientes: [] };
      h.clientes.push(c.name.trim());
      huecos.set(k, h);
    }
    for (const f of porId.get(c.id)?.falta ?? []) {
      if (f === "cuenta de anuncios conectada") continue; // ya está como Meta/Google
      const k = `cerebro:${f}`;
      const h = huecos.get(k) ?? { etiqueta: f[0]!.toUpperCase() + f.slice(1), clientes: [] };
      h.clientes.push(c.name.trim());
      huecos.set(k, h);
    }
  }
  const orden = [...huecos.entries()].sort((a, b) => b[1].clientes.length - a[1].clientes.length);
  const t = ops.data?.totals;

  return (
    <>
      <Encabezado titulo="Preparación de clientes" bajada="Qué le falta a cada cliente para operar solo y para que los agentes lo conozcan" />
      <div className="flex flex-col gap-4 px-4 pb-10 md:px-8">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Dato n={t?.clients} l="Clientes activos" />
          <Dato n={t?.dark} l="Sin cuenta de Meta (dashboard vacío)" mal />
          <Dato n={cob.data?.promedio != null ? `${cob.data.promedio} %` : undefined} l="Ficha del cerebro, promedio" />
          <Dato n={cob.data ? cob.data.clientes.filter((c) => c.porcentaje === 100).length : undefined} l="Clientes con la ficha completa" />
        </div>
        <Tarjeta>
          <TituloFranja>Qué hacer · ordenado por cuántos clientes destraba</TituloFranja>
          {(ops.isLoading || cob.isLoading) && <p className="text-[13px] text-l-tinta-3">Cargando…</p>}
          {!ops.isLoading && orden.length === 0 && <p className="text-[13px] text-l-tinta-2">Sin huecos: todos los clientes están completos.</p>}
          <ul className="flex flex-col gap-3">
            {orden.map(([k, h]) => (
              <li key={k} className="border-l-2 border-l-l-atencion pl-3">
                <p className="text-[14px]">
                  <span className="font-medium">{h.etiqueta}</span>
                  <span className="text-l-tinta-3"> — falta en {h.clientes.length} cliente{h.clientes.length > 1 ? "s" : ""}</span>
                  {h.link && <Link to={h.link} className="ml-2 text-[12px] text-l-marca underline">ir a cargarlo</Link>}
                </p>
                <p className="text-[12px] text-l-tinta-3">{h.clientes.slice(0, 10).join(", ")}{h.clientes.length > 10 ? ` y ${h.clientes.length - 10} más` : ""}</p>
              </li>
            ))}
          </ul>
        </Tarjeta>
        {clientes.length > 0 && (
          <details>
            <summary className="cursor-pointer select-none text-[13px] font-medium text-l-tinta-2">Matriz completa por cliente</summary>
            <div className="mt-2 overflow-x-auto rounded-2xl border border-l-linea bg-l-sup">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-l-tinta-3">
                    <th className="px-3 py-2 text-left font-medium">Cliente</th>
                    {Object.values(OPERACION).map((v) => <th key={v.etiqueta} className="px-1 py-2 font-medium">{v.etiqueta}</th>)}
                    <th className="px-3 py-2 text-right font-medium">Cerebro</th>
                  </tr>
                </thead>
                <tbody>
                  {[...clientes].sort((a, b) => a.readyPct - b.readyPct).map((c) => {
                    const cb = porId.get(c.id);
                    return (
                      <tr key={c.id} className="border-t border-l-linea">
                        <td className="px-3 py-1.5"><Link to={`/clientes/${c.slug}`} className="hover:text-l-marca">{c.name}</Link></td>
                        {Object.keys(OPERACION).map((k) => (
                          <td key={k} className="text-center">
                            {(c.checks as Record<string, boolean>)[k] ? <Check className="mx-auto h-3.5 w-3.5 text-l-bien" aria-label="sí" /> : <X className="mx-auto h-3.5 w-3.5 text-l-critico" aria-label="no" />}
                          </td>
                        ))}
                        <td className="px-3 text-right tabular-nums" title={cb?.falta.join(", ")}>{cb ? `${cb.porcentaje} %` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </>
  );
}

function Dato({ n, l, mal }: { n?: number | string; l: string; mal?: boolean }) {
  return (
    <div className="rounded-xl border border-l-linea bg-l-sup p-3">
      <div className={`text-[22px] font-semibold tabular-nums ${mal ? "text-l-critico-texto" : ""}`}>{n ?? "—"}</div>
      <div className="text-[12px] text-l-tinta-2">{l}</div>
    </div>
  );
}
