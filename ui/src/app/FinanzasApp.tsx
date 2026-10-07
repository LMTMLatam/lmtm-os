// LMTM: Finanzas en la app propia (07/10). Lo mismo que la pantalla vieja de
// "Gastos e ingresos" (resumen por moneda, fijos por mes, cargar, borrar y por
// categoría), con el diseño nuevo. Borrar pide confirmación en el lugar.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { financeApi, type FinanceType, type Recurrence } from "../api/finance";
import { clientsApi } from "../api/clients";
import { Boton } from "../lmtm/componentes";
import { Encabezado } from "./Shell";
import { Tarjeta, TituloFranja } from "./HoyApp";

const CATEGORIAS: Record<FinanceType, string[]> = {
  income: ["Pago de cliente", "Anticipo", "Otro ingreso"],
  expense: ["Suscripción", "Sueldos", "Publicidad", "Herramientas", "Impuestos", "Oficina", "Otro gasto"],
};

/** Centavos → "ARS 1.234,5". */
export function monto(centavos: number, moneda: string): string {
  return `${moneda} ${(centavos / 100).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const campo = "h-10 w-full rounded-[10px] border border-l-linea-2 bg-l-sup px-3 text-[14px] text-l-tinta outline-none focus:border-l-marca";

export function FinanzasApp() {
  const { selectedCompanyId } = useCompany();
  const empresa = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const movimientos = useQuery({ queryKey: ["lmtm", "finanzas", empresa, "mov"], queryFn: () => financeApi.list(empresa), enabled: !!empresa });
  const resumen = useQuery({ queryKey: ["lmtm", "finanzas", empresa, "resumen"], queryFn: () => financeApi.summary(empresa), enabled: !!empresa });
  const clientes = useQuery({ queryKey: ["clients", "para-finanzas"], queryFn: () => clientsApi.list() });
  const refrescar = () => void qc.invalidateQueries({ queryKey: ["lmtm", "finanzas", empresa] });
  const crear = useMutation({ mutationFn: (b: Parameters<typeof financeApi.create>[1]) => financeApi.create(empresa, b), onSuccess: refrescar });
  const borrar = useMutation({ mutationFn: (id: string) => financeApi.remove(empresa, id), onSuccess: refrescar });

  const [tipo, setTipo] = useState<FinanceType>("expense");
  const [categoria, setCategoria] = useState(CATEGORIAS.expense[0]);
  const [importe, setImporte] = useState("");
  const [moneda, setMoneda] = useState("ARS");
  const [clientId, setClientId] = useState("");
  const [recurrencia, setRecurrencia] = useState<Recurrence>("one_time");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [detalle, setDetalle] = useState("");
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const totales = useMemo(() => {
    const m: Record<string, { income: number; expense: number }> = {};
    for (const r of resumen.data?.byTypeCurrency ?? []) {
      m[r.currency] ??= { income: 0, expense: 0 };
      m[r.currency][r.type] = r.total;
    }
    return m;
  }, [resumen.data]);

  const cargar = () => {
    // Igual que la pantalla vieja: la coma pasa a punto. No se sacan los puntos
    // de miles: "1234.50" se leería como 123450.
    const centavos = Math.round(parseFloat(importe.replace(",", ".")) * 100);
    if (!centavos || centavos <= 0) return;
    crear.mutate({
      type: tipo, category: categoria, description: detalle || null, amountCents: centavos, currency: moneda,
      clientId: tipo === "income" ? clientId || null : null, recurring: recurrencia !== "one_time", recurrence: recurrencia, occurredAt: fecha,
    });
    setImporte("");
    setDetalle("");
  };

  if (!empresa) return <p className="px-4 pt-6 text-[14px] text-l-tinta-3 md:px-8">Cargando la empresa…</p>;
  const filas = movimientos.data?.entries ?? [];

  return (
    <>
      <Encabezado titulo="Finanzas" bajada="Pagos de clientes, suscripciones y gastos de la agencia." />
      <div className="max-w-[1080px] space-y-8 px-4 pb-10 md:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(totales).map(([m, t]) => {
            const neto = t.income - t.expense;
            return (
              <Tarjeta key={m}>
                <div className="text-[13px] font-medium text-l-tinta-2">{m}</div>
                <div className="mt-2 space-y-1 text-[14px]">
                  <div className="flex justify-between"><span className="text-l-tinta-2">Ingresos</span><span className="tabular-nums">{monto(t.income, m)}</span></div>
                  <div className="flex justify-between"><span className="text-l-tinta-2">Gastos</span><span className="tabular-nums">{monto(t.expense, m)}</span></div>
                  <div className="flex justify-between border-t border-l-linea pt-1.5 font-semibold">
                    <span>Neto</span>
                    <span className={`tabular-nums ${neto >= 0 ? "text-l-bien-texto" : "text-l-critico-texto"}`}>{monto(neto, m)}</span>
                  </div>
                </div>
              </Tarjeta>
            );
          })}
          {(resumen.data?.recurringMonthly ?? []).length > 0 && (
            <Tarjeta>
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-l-tinta-2"><Repeat className="h-4 w-4" aria-hidden /> Fijos por mes</div>
              <div className="mt-2 space-y-1 text-[14px]">
                {resumen.data!.recurringMonthly.map((r, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-l-tinta-2">{r.type === "income" ? "Ingresos fijos" : "Gastos fijos"} ({r.currency})</span>
                    <span className="tabular-nums">{monto(r.monthly, r.currency)}</span>
                  </div>
                ))}
              </div>
            </Tarjeta>
          )}
        </div>

        <section>
          <TituloFranja>Cargar un movimiento</TituloFranja>
          <form
            className="grid gap-3 rounded-2xl border border-l-linea bg-l-sup p-4 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              cargar();
            }}
          >
            <label className="text-[12px] text-l-tinta-3">
              Tipo
              <select className={`${campo} mt-1`} value={tipo} onChange={(e) => { const t = e.target.value as FinanceType; setTipo(t); setCategoria(CATEGORIAS[t][0]); }}>
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
              </select>
            </label>
            <label className="text-[12px] text-l-tinta-3">
              Categoría
              <select className={`${campo} mt-1`} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {CATEGORIAS[tipo].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-[12px] text-l-tinta-3">
              Monto
              <input className={`${campo} mt-1 tabular-nums`} value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </label>
            <label className="text-[12px] text-l-tinta-3">
              Moneda
              <select className={`${campo} mt-1`} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                <option>ARS</option>
                <option>USD</option>
              </select>
            </label>
            {tipo === "income" && (
              <label className="text-[12px] text-l-tinta-3">
                Cliente (opcional)
                <select className={`${campo} mt-1`} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">—</option>
                  {(clientes.data?.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <label className="text-[12px] text-l-tinta-3">
              Se repite
              <select className={`${campo} mt-1`} value={recurrencia} onChange={(e) => setRecurrencia(e.target.value as Recurrence)}>
                <option value="one_time">Una vez</option>
                <option value="monthly">Todos los meses</option>
                <option value="yearly">Todos los años</option>
              </select>
            </label>
            <label className="text-[12px] text-l-tinta-3">
              Fecha
              <input type="date" className={`${campo} mt-1`} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </label>
            <label className="text-[12px] text-l-tinta-3 sm:col-span-2 lg:col-span-3">
              Detalle
              <input className={`${campo} mt-1`} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Ej.: suscripción de Make, pago mensual de DUNOD…" />
            </label>
            <div className="flex items-end">
              <Boton tipo="primario" disabled={!importe || crear.isPending}>
                {crear.isPending ? "Cargando…" : "Agregar"}
              </Boton>
            </div>
          </form>
        </section>

        <section>
          <TituloFranja>Movimientos · {filas.length}</TituloFranja>
          {movimientos.isLoading ? (
            <p className="text-[14px] text-l-tinta-3">Cargando…</p>
          ) : filas.length === 0 ? (
            <p className="text-[14px] text-l-tinta-2">Todavía no hay movimientos.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-l-linea bg-l-sup">
              <table className="w-full min-w-[620px] text-[14px]">
                <thead className="border-b border-l-linea text-[12px] text-l-tinta-3">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Fecha</th>
                    <th className="px-4 py-2 text-left font-medium">Categoría</th>
                    <th className="px-4 py-2 text-left font-medium">Detalle</th>
                    <th className="px-4 py-2 text-right font-medium">Monto</th>
                    <th className="px-2" />
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.id} className="border-b border-l-linea last:border-b-0">
                      <td className="px-4 py-2 tabular-nums text-l-tinta-3">{new Date(f.occurredAt).toLocaleDateString("es-AR")}</td>
                      <td className="px-4 py-2">
                        {f.category}
                        {f.recurring && <Repeat className="ml-1 inline h-3.5 w-3.5 text-l-tinta-3" aria-label="se repite" />}
                      </td>
                      <td className="max-w-[300px] truncate px-4 py-2 text-l-tinta-2">{[f.clientName, f.description].filter(Boolean).join(" · ")}</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-medium ${f.type === "income" ? "text-l-bien-texto" : "text-l-critico-texto"}`}>
                        {f.type === "income" ? "+" : "−"}{monto(f.amountCents, f.currency)}
                      </td>
                      <td className="whitespace-nowrap px-2 text-right">
                        {confirmando === f.id ? (
                          <span className="inline-flex gap-1">
                            <button type="button" className="rounded-[8px] px-2 py-1 text-[12px] font-semibold text-l-critico-texto" onClick={() => { borrar.mutate(f.id); setConfirmando(null); }}>
                              Borrar
                            </button>
                            <button type="button" className="rounded-[8px] px-2 py-1 text-[12px] text-l-tinta-3" onClick={() => setConfirmando(null)}>
                              No
                            </button>
                          </span>
                        ) : (
                          <button type="button" className="rounded-[8px] px-2 py-1 text-[12px] text-l-tinta-3 hover:text-l-critico-texto" onClick={() => setConfirmando(f.id)} disabled={borrar.isPending}>
                            Borrar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {(resumen.data?.byCategory ?? []).length > 0 && (
          <section>
            <TituloFranja>Por categoría</TituloFranja>
            <div className="grid gap-x-8 gap-y-1 rounded-2xl border border-l-linea bg-l-sup p-4 text-[14px] sm:grid-cols-2">
              {resumen.data!.byCategory.map((c, i) => (
                <div key={i} className="flex justify-between">
                  <span>
                    {c.category} <span className="text-[12px] text-l-tinta-3">({c.type === "income" ? "ingreso" : "gasto"}, {c.currency})</span>
                  </span>
                  <span className="tabular-nums text-l-tinta-2">{monto(c.total, c.currency)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
