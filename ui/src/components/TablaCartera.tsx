import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { ArrowDownUp, Copy, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "../api/client";

/**
 * La cartera entera, cruzada, en una tabla.
 *
 * Cada fila trae las tres comparaciones que hacen falta para decidir: contra el
 * rubro, contra su propio mes anterior, y contra lo que se pierde por no actuar.
 * De ahí sale la última columna, que es la única que importa de verdad.
 *
 * Viene ordenada por urgencia, no alfabéticamente: lo primero que se ve es lo
 * que hay que hacer hoy.
 */

interface Accion {
  texto: string;
  prioridad: number;
  tono: "critico" | "alerta" | "oportunidad" | "neutro";
}

interface FilaCartera {
  clientId: string;
  nombre: string;
  slug: string;
  rubro: string | null;
  inversion30d: number;
  leads30d: number;
  cpl: number | null;
  deltaRubroPct: number | null;
  cplRubro: number | null;
  deltaPropioPct: number | null;
  cplPrevio: number | null;
  formatoDominante: string | null;
  formatoDominantePct: number | null;
  plataParadaPorDia: number;
  proximaAccion: Accion;
}

type Orden = "urgencia" | "inversion" | "cpl" | "rubro" | "propio" | "parada";

const TONO: Record<Accion["tono"], string> = {
  critico: "var(--estado-critico)",
  alerta: "var(--estado-alerta)",
  oportunidad: "var(--estado-ok)",
  neutro: "var(--color-muted-foreground)",
};

const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

/** Un delta donde el signo importa: negativo es bueno (más barato). */
function Delta({ pct, referencia }: { pct: number | null; referencia: string | null }) {
  if (pct == null) {
    // No se dibuja un cero: "no se puede comparar" y "está igual" son cosas
    // distintas y confundirlas es la forma más fácil de leer mal la tabla.
    return <span className="text-muted-foreground/50">—</span>;
  }
  const bueno = pct < 0;
  return (
    <span
      className="tabular-nums"
      style={{ color: Math.abs(pct) < 10 ? undefined : bueno ? "var(--estado-ok)" : "var(--estado-alerta)" }}
      title={referencia ?? undefined}
    >
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

export function TablaCartera() {
  const [orden, setOrden] = useState<Orden>("urgencia");
  const [copiado, setCopiado] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cartera"],
    queryFn: () => api.get<{ filas: FilaCartera[]; desde: string; hasta: string }>("/cartera"),
    staleTime: 3 * 60_000,
  });

  const filas = useMemo(() => {
    const f = [...(data?.filas ?? [])];
    const nulosAlFinal = (a: number | null, b: number | null) => (b ?? -Infinity) - (a ?? -Infinity);
    switch (orden) {
      case "inversion":
        return f.sort((a, b) => b.inversion30d - a.inversion30d);
      case "cpl":
        return f.sort((a, b) => nulosAlFinal(a.cpl, b.cpl));
      case "rubro":
        return f.sort((a, b) => nulosAlFinal(a.deltaRubroPct, b.deltaRubroPct));
      case "propio":
        return f.sort((a, b) => nulosAlFinal(a.deltaPropioPct, b.deltaPropioPct));
      case "parada":
        return f.sort((a, b) => b.plataParadaPorDia - a.plataParadaPorDia);
      default:
        return f;
    }
  }, [data, orden]);

  const copiar = () => {
    // TSV: pegado en una planilla cae en columnas solo. Es el formato que el
    // equipo necesita para mandarle algo a un cliente sin rehacerlo a mano.
    const cab = ["Cliente", "Rubro", "Inversión 30d", "Leads", "CPL", "vs rubro", "vs mes previo", "Formato", "Parado/día", "Próxima acción"];
    const cuerpo = filas.map((f) =>
      [
        f.nombre,
        f.rubro ?? "",
        f.inversion30d,
        f.leads30d,
        f.cpl ?? "",
        f.deltaRubroPct != null ? `${f.deltaRubroPct}%` : "",
        f.deltaPropioPct != null ? `${f.deltaPropioPct}%` : "",
        f.formatoDominante ? `${f.formatoDominante} ${f.formatoDominantePct}%` : "",
        f.plataParadaPorDia || "",
        f.proximaAccion.texto,
      ].join("\t"),
    );
    void navigator.clipboard.writeText([cab.join("\t"), ...cuerpo].join("\n")).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  };

  const Th = ({ col, children, align = "left" }: { col?: Orden; children: React.ReactNode; align?: "left" | "right" }) => (
    <th
      className={`px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground ${align === "right" ? "text-right" : "text-left"} ${col ? "cursor-pointer hover:text-foreground" : ""}`}
      onClick={col ? () => setOrden(col) : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {col && orden === col && <ArrowDownUp className="h-3 w-3" />}
      </span>
    </th>
  );

  if (isLoading) return <Card className="p-4"><p className="text-xs text-muted-foreground">Cargando la cartera…</p></Card>;
  if (error) return <Card className="p-4"><p className="text-xs" style={{ color: "var(--estado-critico)" }}>No se pudo cargar la cartera.</p></Card>;
  if (filas.length === 0) return <Card className="p-4"><p className="text-xs text-muted-foreground">No hay clientes activos.</p></Card>;

  const paradaTotal = filas.reduce((a, f) => a + f.plataParadaPorDia, 0);

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Cartera cruzada</h3>
        <span className="text-xs text-muted-foreground">
          {data?.desde} → {data?.hasta} · {filas.length} clientes
        </span>
        {paradaTotal > 0 && (
          <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--estado-critico)" }}>
            {money(paradaTotal)}/día parados
          </span>
        )}
        <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={copiar}>
          {copiado ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>

      {/* Scroll propio: la tabla es ancha y el panel no puede scrollear en horizontal. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Cliente</Th>
              <Th>Rubro</Th>
              <Th col="inversion" align="right">Inv. 30d</Th>
              <Th align="right">Leads</Th>
              <Th col="cpl" align="right">CPL</Th>
              <Th col="rubro" align="right">vs rubro</Th>
              <Th col="propio" align="right">vs mes previo</Th>
              <Th>Formato</Th>
              <Th col="parada" align="right">Parado/día</Th>
              <Th col="urgencia">Próxima acción</Th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clientId} className="border-b border-border/50 hover:bg-accent/30">
                <td className="px-2 py-1.5">
                  <Link to={`/c/${f.slug}/dashboard`} className="no-underline text-inherit hover:underline">
                    {f.nombre}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">{f.rubro ?? "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{f.inversion30d ? money(f.inversion30d) : "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{f.leads30d || "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{f.cpl != null ? money(f.cpl) : "—"}</td>
                <td className="px-2 py-1.5 text-right">
                  <Delta pct={f.deltaRubroPct} referencia={f.cplRubro != null ? `Rubro: ${money(f.cplRubro)}` : null} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Delta pct={f.deltaPropioPct} referencia={f.cplPrevio != null ? `Mes previo: ${money(f.cplPrevio)}` : null} />
                </td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">
                  {f.formatoDominante ? `${f.formatoDominante} ${f.formatoDominantePct}%` : "—"}
                </td>
                <td
                  className="px-2 py-1.5 text-right tabular-nums"
                  style={f.plataParadaPorDia ? { color: "var(--estado-critico)", fontWeight: 600 } : undefined}
                >
                  {f.plataParadaPorDia ? money(f.plataParadaPorDia) : "—"}
                </td>
                <td className="px-2 py-1.5 text-xs" style={{ color: TONO[f.proximaAccion.tono] }}>
                  {f.proximaAccion.texto}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        El día en curso no se cuenta: los datos de hoy están a medio sincronizar y deformarían las dos ventanas.
      </p>
    </Card>
  );
}
