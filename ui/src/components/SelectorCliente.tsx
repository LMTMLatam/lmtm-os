// LMTM-OS: saltar de un cliente a otro sin volver al menú (pedido 18/8).
//
// Antes, para pasar de BRACHETTA a Distrillantas había que ir a Clientes,
// buscar en la lista y entrar — tres clics y perder la pestaña en la que
// estabas. Con 58 clientes eso se hace muchas veces por día.
//
// Este selector va en el título del panel: se escribe para filtrar, se elige, y
// se cae en el MISMO tab del cliente nuevo. Si estabas en "Marca" de uno,
// aterrizás en "Marca" del otro.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clientsApi } from "../api/clients";
import { queryKeys } from "../lib/queryKeys";
import { Input } from "@/components/ui/input";
import { ChevronsUpDown, Search } from "lucide-react";

export function SelectorCliente({ slugActual, tab }: { slugActual: string; tab?: string }) {
  const navegar = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const caja = useRef<HTMLDivElement>(null);

  // La lista completa se cachea: son 58 filas, se pide una vez y sirve para
  // todos los saltos de la sesión.
  const q = useQuery({
    queryKey: queryKeys.clients.list("active"),
    queryFn: () => clientsApi.list("active"),
    staleTime: 5 * 60_000,
  });

  const clientes = useMemo(() => {
    const todos = q.data?.clients ?? [];
    const f = filtro.trim().toLowerCase();
    const lista = f ? todos.filter((c) => c.name.toLowerCase().includes(f)) : todos;
    return [...lista].sort((a, b) => a.name.localeCompare(b.name, "es")).slice(0, 60);
  }, [q.data, filtro]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);

  const ir = (slug: string) => {
    setAbierto(false);
    setFiltro("");
    // Se conserva el tab: saltar de cliente no debería devolverte al principio.
    navegar(tab ? `/clients/${slug}/${tab}` : `/clients/${slug}`);
  };

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="Cambiar de cliente"
        aria-label="Cambiar de cliente"
      >
        <ChevronsUpDown className="h-4 w-4" />
      </button>

      {abierto && (
        <div className="absolute z-50 mt-1 w-72 rounded-lg border bg-popover shadow-lg overflow-hidden">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && clientes[0]) ir(clientes[0].slug); }}
                placeholder="Buscar cliente…"
                className="h-8 pl-7 text-sm"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {clientes.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-4 text-center">Sin resultados</p>
            ) : clientes.map((c) => (
              <button
                key={c.slug}
                onClick={() => ir(c.slug)}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors ${
                  c.slug === slugActual ? "bg-muted/60 font-medium" : ""
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
