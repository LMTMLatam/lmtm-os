// LMTM: Google Ads, cuenta por cuenta (13/10: "no veo nada de Google").
// Se ve si la cuenta se puede leer, cuánto gastó, los leads y su costo, las
// campañas, y lo que está pendiente en Hoy. Solo lectura: lo que hay que hacer
// sale de Hoy, acá se mira.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, OctagonAlert } from "lucide-react";
import { Link } from "@/lib/router";
import { api } from "../api/client";
import { pesos } from "../lmtm/formato";
import { TituloFranja } from "./HoyApp";

interface Campana {
  id: string; nombre: string | null; estado: string | null; activa: boolean;
  inversion: number; leads: number; cpl: number | null; leadsDudosos: boolean; ultimoDiaConGasto: string | null;
}
interface ClienteGoogle {
  clientId: string; cliente: string; slug: string | null;
  estado: "fallando" | "atrasada" | "ok" | "sin_entrega" | "sin_conexion";
  detalle: string; ultimoDato: string | null; moneda: string | null;
  gasto7: number | null; gasto30: number | null; leads30: number | null; cpl30: number | null; leadsDudosos: boolean;
  campanas: { activas: number; activasSinGasto: number; lista: Campana[] } | null;
  pendientes: string[];
}
interface RespuestaGoogle { generadoAt: string; desde30?: string; hasta?: string; clientes: ClienteGoogle[] }

const ESTADO: Record<ClienteGoogle["estado"], { palabra: string; color: string }> = {
  fallando: { palabra: "sin acceso", color: "var(--l-critico)" },
  atrasada: { palabra: "atrasada", color: "var(--l-atencion)" },
  ok: { palabra: "al día", color: "var(--l-bien)" },
  sin_entrega: { palabra: "sin gasto", color: "var(--l-neutro)" },
  sin_conexion: { palabra: "sin conexión", color: "var(--l-neutro)" },
};

/** En la moneda de la cuenta: GALA gasta en dólares y no se puede leer como pesos. */
function plata(n: number | null, moneda: string | null): string {
  if (n == null) return "—";
  if (moneda && moneda !== "ARS") return `${moneda} ${Math.round(n).toLocaleString("es-AR")}`;
  return pesos(n);
}

export function PautaGoogle({ buscar }: { buscar: string }) {
  const q = useQuery({
    queryKey: ["lmtm", "pauta", "google"],
    queryFn: () => api.get<RespuestaGoogle>("/pauta/google"),
    staleTime: 10 * 60_000,
  });
  const texto = buscar.trim().toLowerCase();
  const clientes = (q.data?.clientes ?? []).filter((c) => !texto || c.cliente.toLowerCase().includes(texto));
  const conGasto = clientes.filter((c) => c.estado === "ok" || c.estado === "atrasada" || c.estado === "fallando");
  const apagadas = clientes.filter((c) => c.estado === "sin_entrega");

  return (
    <section>
      <TituloFranja>Google Ads · {conGasto.length} {conGasto.length === 1 ? "cuenta" : "cuentas"}</TituloFranja>
      <p className="-mt-1.5 mb-3 text-[13px] text-l-tinta-3">
        Últimos 30 días hasta ayer{q.data?.desde30 ? ` (desde el ${q.data.desde30.slice(8, 10)}/${q.data.desde30.slice(5, 7)})` : ""}. Las que no se pueden leer, primero.
      </p>
      {q.isLoading && <p className="flex items-center gap-2 text-[14px] text-l-tinta-3"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo las cuentas de Google…</p>}
      {q.error && <p className="flex gap-1.5 text-[14px] text-l-critico-texto" role="alert"><OctagonAlert className="mt-0.5 h-4 w-4" aria-hidden /> No se pudo cargar Google: {q.error instanceof Error ? q.error.message : "error"}</p>}
      {q.data && clientes.length === 0 && (
        <p className="text-[14px] text-l-tinta-2">Ningún cliente tiene una cuenta de Google conectada que se pueda leer.</p>
      )}
      {conGasto.length > 0 && (
        <ul className="overflow-hidden rounded-2xl border border-l-linea bg-l-sup">
          {conGasto.map((c) => <FilaGoogle key={c.clientId} c={c} />)}
        </ul>
      )}
      {apagadas.length > 0 && (
        <p className="mt-3 text-[13px] text-l-tinta-3">
          Conectadas sin gasto en 30 días ({apagadas.length}): {apagadas.map((c) => c.cliente).join(", ")}.
        </p>
      )}
    </section>
  );
}

function FilaGoogle({ c }: { c: ClienteGoogle }) {
  const [abierta, setAbierta] = useState(false);
  const e = ESTADO[c.estado];
  const sinAcceso = c.estado === "fallando";
  return (
    <li className="border-b border-l-linea last:border-b-0">
      <button
        type="button"
        onClick={() => setAbierta((x) => !x)}
        aria-expanded={abierta}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-l-papel/60"
      >
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.color }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{c.cliente}</span>
          <span className="block text-[12px] text-l-tinta-3">
            {sinAcceso
              ? c.detalle
              : [
                  `${plata(c.gasto30, c.moneda)} en 30 días · ${plata(c.gasto7, c.moneda)} en 7`,
                  c.leads30 != null ? `${c.leads30} ${c.leadsDudosos ? "conversiones (dudosas)" : "leads"}` : null,
                  c.cpl30 != null && !c.leadsDudosos ? `${plata(c.cpl30, c.moneda)} por lead` : null,
                  c.campanas ? `${c.campanas.activas} ${c.campanas.activas === 1 ? "campaña activa" : "campañas activas"}${c.campanas.activasSinGasto ? ` (${c.campanas.activasSinGasto} sin gasto)` : ""}` : null,
                ].filter(Boolean).join(" · ")}
          </span>
          {c.pendientes.length > 0 && (
            <span className="mt-0.5 block truncate text-[12px] text-l-atencion-texto">En Hoy: {c.pendientes[0]}{c.pendientes.length > 1 ? ` (y ${c.pendientes.length - 1} más)` : ""}</span>
          )}
        </span>
        <span className="shrink-0 pt-0.5 text-right text-[12px] text-l-tinta-3">{e.palabra}</span>
        {abierta ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-l-tinta-3" aria-hidden /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-l-tinta-3" aria-hidden />}
      </button>
      {abierta && (
        <div className="space-y-2 px-4 pb-4 pl-[38px] text-[13px]">
          {c.leadsDudosos && (
            <p className="text-l-atencion-texto">Google cuenta como conversión más de un tercio de los clics: hay acciones mal configuradas en la cuenta y el costo por lead no sirve para decidir.</p>
          )}
          {c.campanas && c.campanas.lista.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] text-l-tinta-3">
                    <th className="py-1 pr-3 font-medium">Campaña</th>
                    <th className="py-1 pr-3 font-medium">Estado</th>
                    <th className="py-1 pr-3 text-right font-medium">Gasto 30 días</th>
                    <th className="py-1 pr-3 text-right font-medium">Leads</th>
                    <th className="py-1 text-right font-medium">Costo por lead</th>
                  </tr>
                </thead>
                <tbody>
                  {c.campanas.lista.map((k) => (
                    <tr key={k.id} className="border-t border-l-linea">
                      <td className="max-w-[320px] truncate py-1.5 pr-3" title={k.nombre ?? k.id}>{k.nombre ?? k.id}</td>
                      <td className="py-1.5 pr-3 text-l-tinta-2">{k.activa ? (k.inversion === 0 ? "activa, sin gasto" : "activa") : "pausada"}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{plata(k.inversion, c.moneda)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{k.leads}{k.leadsDudosos ? "*" : ""}</td>
                      <td className="py-1.5 text-right tabular-nums">{k.cpl != null && !k.leadsDudosos ? plata(k.cpl, c.moneda) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !sinAcceso && <p className="text-l-tinta-3">Sin campañas con datos en el período.</p>
          )}
          {c.pendientes.length > 1 && (
            <ul className="list-disc pl-4 text-l-tinta-2">{c.pendientes.map((p) => <li key={p}>{p}</li>)}</ul>
          )}
          {c.slug && <Link to={`/clientes/${c.slug}/dashboard`} className="inline-block text-l-tinta-2 hover:text-l-marca">Abrir su tablero de pauta →</Link>}
        </div>
      )}
    </li>
  );
}
