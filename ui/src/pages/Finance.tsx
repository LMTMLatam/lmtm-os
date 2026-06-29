import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Wallet, Trash2, Repeat, Plus } from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { financeApi, type FinanceEntryInput, type FinanceType, type Recurrence } from "../api/finance";
import { clientsApi } from "../api/clients";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const CATEGORIES: Record<FinanceType, string[]> = {
  income: ["Pago de cliente", "Anticipo", "Otro ingreso"],
  expense: ["Suscripción", "Sueldos", "Publicidad", "Herramientas", "Impuestos", "Oficina", "Otro gasto"],
};

function fmt(cents: number, currency: string) {
  return `${currency} ${(cents / 100).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function Finance() {
  const { selectedCompanyId } = useCompany();
  const qc = useQueryClient();
  const companyId = selectedCompanyId ?? "";

  const entriesQuery = useQuery({
    queryKey: ["finance", companyId, "entries"],
    queryFn: () => financeApi.list(companyId),
    enabled: !!companyId,
  });
  const summaryQuery = useQuery({
    queryKey: ["finance", companyId, "summary"],
    queryFn: () => financeApi.summary(companyId),
    enabled: !!companyId,
  });
  const clientsQuery = useQuery({
    queryKey: ["clients", "for-finance"],
    queryFn: () => clientsApi.list(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["finance", companyId] });
  };
  const create = useMutation({
    mutationFn: (body: FinanceEntryInput) => financeApi.create(companyId, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => financeApi.remove(companyId, id),
    onSuccess: invalidate,
  });

  // form state
  const [type, setType] = useState<FinanceType>("expense");
  const [category, setCategory] = useState("Suscripción");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [clientId, setClientId] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("one_time");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const summary = summaryQuery.data;
  const totals = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    for (const r of summary?.byTypeCurrency ?? []) {
      map[r.currency] ??= { income: 0, expense: 0 };
      map[r.currency][r.type] = r.total;
    }
    return map;
  }, [summary]);

  const submit = () => {
    const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!cents || cents <= 0) return;
    create.mutate({
      type,
      category,
      description: description || null,
      amountCents: cents,
      currency,
      clientId: type === "income" ? clientId || null : null,
      recurring: recurrence !== "one_time",
      recurrence,
      occurredAt: date,
    });
    setAmount("");
    setDescription("");
  };

  if (!companyId) return <p className="p-6 text-sm text-muted-foreground">Seleccioná una empresa.</p>;

  const entries = entriesQuery.data?.entries ?? [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Wallet className="h-5 w-5" /> Gastos e Ingresos</h1>
        <p className="text-sm text-muted-foreground">Llevá las finanzas de la agencia: pagos de clientes, suscripciones y gastos, sectorizados.</p>
      </div>

      {/* Summary cards per currency */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(totals).map(([cur, t]) => {
          const net = t.income - t.expense;
          return (
            <Card key={cur} className="p-4 space-y-2">
              <div className="text-xs text-muted-foreground font-medium">{cur}</div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><TrendingUp className="h-4 w-4" /> Ingresos</span>
                <span className="tabular-nums font-medium">{fmt(t.income, cur)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400"><TrendingDown className="h-4 w-4" /> Gastos</span>
                <span className="tabular-nums font-medium">{fmt(t.expense, cur)}</span>
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t">
                <span className="font-semibold">Neto</span>
                <span className={`tabular-nums font-bold ${net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{fmt(net, cur)}</span>
              </div>
            </Card>
          );
        })}
        {(summary?.recurringMonthly ?? []).length > 0 && (
          <Card className="p-4 space-y-1.5">
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1"><Repeat className="h-3.5 w-3.5" /> Recurrente / mes</div>
            {summary!.recurringMonthly.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className={r.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{r.type === "income" ? "Ingresos fijos" : "Gastos fijos"} ({r.currency})</span>
                <span className="tabular-nums">{fmt(r.monthly, r.currency)}</span>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Add entry */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Plus className="h-4 w-4" /> Cargar movimiento</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Tipo</label>
            <select className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" value={type} onChange={(e) => { const t = e.target.value as FinanceType; setType(t); setCategory(CATEGORIES[t][0]); }}>
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Categoría</label>
            <select className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES[type].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Monto</label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Moneda</label>
            <select className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option>ARS</option><option>USD</option>
            </select>
          </div>
          {type === "income" && (
            <div>
              <label className="text-xs text-muted-foreground">Cliente (opcional)</label>
              <select className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">—</option>
                {(clientsQuery.data?.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Recurrencia</label>
            <select className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              <option value="one_time">Único</option>
              <option value="monthly">Mensual</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Fecha</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="text-xs text-muted-foreground">Descripción</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Suscripción Make, pago mensual DUNOD…" />
          </div>
          <div className="flex items-end">
            <Button className="w-full" disabled={!amount || create.isPending} onClick={submit}>Agregar</Button>
          </div>
        </div>
      </Card>

      {/* Entries list */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-2 border-b text-sm font-semibold">Movimientos ({entries.length})</div>
        {entriesQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : entries.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Todavía no hay movimientos. Cargá el primero arriba.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr><th className="text-left px-4 py-2">Fecha</th><th className="text-left px-4 py-2">Categoría</th><th className="text-left px-4 py-2">Detalle</th><th className="text-right px-4 py-2">Monto</th><th className="px-2"></th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{new Date(e.occurredAt).toLocaleDateString("es-AR")}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="text-[10px]">{e.category}</Badge>
                    {e.recurring && <Repeat className="inline h-3 w-3 ml-1 text-muted-foreground" />}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground truncate max-w-[280px]">{e.clientName ? <span className="text-foreground">{e.clientName}</span> : null} {e.description}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${e.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {e.type === "income" ? "+" : "−"}{fmt(e.amountCents, e.currency)}
                  </td>
                  <td className="px-2">
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={remove.isPending} onClick={() => remove.mutate(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* By category */}
      {(summary?.byCategory ?? []).length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Por categoría</h3>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {summary!.byCategory.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${c.type === "income" ? "bg-emerald-500" : "bg-rose-500"}`} />
                  {c.category} <span className="text-muted-foreground text-xs">({c.currency})</span>
                </span>
                <span className="tabular-nums text-muted-foreground">{fmt(c.total, c.currency)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
