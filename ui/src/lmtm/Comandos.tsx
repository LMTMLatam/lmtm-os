// LMTM: el menú de comandos (Ctrl+K), rediseño 20/11. Se escribe un cliente, una
// sección o una acción y se salta ahí. Referencia: el menú de Linear (cada acción
// muestra su atajo al lado, así se aprende usándolo).

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@/lib/router";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { clientsApi } from "../api/clients";
import { queryKeys } from "../lib/queryKeys";
import { useTheme } from "../context/ThemeContext";
import { AGENCIA, OTRAS, PRINCIPALES, SECCIONES_CLIENTE } from "./secciones";

/** Puro. El cliente abierto en la ruta (/clientes/:slug/...), o null. */
export function clienteDeRuta(pathname: string): string | null {
  const m = /^\/clientes\/([^/]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

export function Comandos({ abierto, onCambio, esAdmin }: { abierto: boolean; onCambio: (v: boolean) => void; esAdmin: boolean }) {
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const { theme } = useTheme();
  const clientes = useQuery({ queryKey: queryKeys.clients.list("active"), queryFn: () => clientsApi.list("active"), staleTime: 5 * 60_000, enabled: abierto });

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onCambio(!abierto);
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierto, onCambio]);

  const ir = (to: string) => {
    onCambio(false);
    navegar(to);
  };
  const slug = clienteDeRuta(pathname);
  const actual = slug ? clientes.data?.clients.find((c) => c.slug === slug) : undefined;
  const lista = [...(clientes.data?.clients ?? [])].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const secciones = [
    ...PRINCIPALES.flatMap((p) => [p, ...(p.hijas ?? []).filter((h) => h.to !== p.to)]),
    ...AGENCIA.filter((s) => esAdmin || !s.soloAdmin),
    ...OTRAS.filter((s) => esAdmin || !s.soloAdmin),
  ];

  return (
    <Dialog open={abierto} onOpenChange={onCambio}>
      <DialogContent
        showCloseButton={false}
        className="lmtm top-[12vh] max-w-[680px] translate-y-0 overflow-hidden rounded-[22px] border-l-linea-2 bg-l-sup p-0 shadow-[0_40px_120px_rgba(240,92,245,.25)] md:top-[12vh] md:translate-y-0 sm:max-w-[680px]"
        data-tema={theme === "dark" ? "oscuro" : "claro"}
      >
        <DialogTitle className="sr-only">Menú de comandos</DialogTitle>
        <Command className="bg-transparent text-l-tinta [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-l-tinta-3">
          <CommandInput placeholder="Buscar cliente, sección o acción" className="h-14 text-[16px]" />
          <CommandList className="max-h-[60vh] px-2 pb-2">
            <CommandEmpty className="py-8 text-center text-[14px] text-l-tinta-3">No hay nada con ese nombre.</CommandEmpty>
            {actual && (
              <CommandGroup heading={actual.name.trim()}>
                <Fila valor={`${actual.name} pedir agente`} onSelect={() => ir(`/clientes/${actual.slug}/agentes`)} atajo="Pedir">
                  Pedirle algo a un agente para {actual.name.trim()}
                </Fila>
                {SECCIONES_CLIENTE.map((s) => (
                  <Fila key={s.id} valor={`${actual.name} ${s.grupo} ${s.label}`} onSelect={() => ir(`/clientes/${actual.slug}/${s.id}`)} atajo={s.grupo}>
                    {s.label}
                  </Fila>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Clientes">
              {clientes.isLoading && <p className="px-3 py-2 text-[13px] text-l-tinta-3">Cargando clientes…</p>}
              {lista.map((c) => (
                <Fila key={c.id} valor={`cliente ${c.name}`} onSelect={() => ir(`/clientes/${c.slug}`)}>
                  {c.name.trim()}
                </Fila>
              ))}
            </CommandGroup>
            <CommandGroup heading="Secciones">
              {secciones.map((s) => (
                <Fila key={s.to} valor={`seccion ${s.label}`} onSelect={() => ir(s.to)}>
                  {s.label}
                </Fila>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="flex flex-wrap gap-4 border-t border-l-linea px-4 py-2.5 text-[12px] text-l-tinta-3">
            <span><Tecla>↑</Tecla> <Tecla>↓</Tecla> moverse</span>
            <span><Tecla>Enter</Tecla> abrir</span>
            <span><Tecla>Ctrl K</Tecla> desde cualquier pantalla</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function Fila({ children, valor, onSelect, atajo }: { children: React.ReactNode; valor: string; onSelect: () => void; atajo?: string }) {
  return (
    <CommandItem
      value={valor}
      onSelect={onSelect}
      className="min-h-11 cursor-pointer rounded-[12px] px-3 text-[14px] text-l-tinta data-[selected=true]:bg-[image:var(--l-marca-grad)] data-[selected=true]:font-semibold data-[selected=true]:text-l-marca-tinta"
    >
      <span className="flex-1 truncate">{children}</span>
      {atajo && <span className="text-[12px] opacity-70">{atajo}</span>}
    </CommandItem>
  );
}

export function Tecla({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-[6px] border border-l-linea-2 px-1.5 py-px font-sans text-[12px]">{children}</kbd>;
}
