import type { ReactNode } from "react";
import { Link } from "@/lib/router";

/**
 * Una fila de algo que hay que hacer.
 *
 * POR QUÉ EXISTE
 * El panel tenía varias listas de "cosas pendientes" —la cola humana, las
 * alertas de cliente, las aprobaciones— y cada una se había escrito por
 * separado. Compartían la anatomía (punto de estado, título, segunda línea con
 * el motivo, datos chicos a la derecha, todo clickeable) pero no el código, así
 * que divergían en silencio: distinta altura de fila, distinto tamaño de letra
 * para el mismo dato, el monto en un lado en una y en el otro en la otra.
 *
 * Para quien lo usa el costo no es estético: cuando dos listas que muestran lo
 * mismo se ven distinto, hay que volver a aprender a leer cada una.
 *
 * NO lo usa la tabla de cartera, a propósito: una fila de `<table>` no es una
 * fila de lista. Forzar la misma abstracción sobre los dos medios habría pedido
 * un componente que no sirve bien para ninguno.
 */

export type TonoFila = "critico" | "alerta" | "ok" | "info" | "ninguno";

const COLOR_TONO: Record<Exclude<TonoFila, "ninguno">, string> = {
  critico: "var(--estado-critico)",
  alerta: "var(--estado-alerta)",
  ok: "var(--estado-ok)",
  info: "var(--estado-info)",
};

/** Un dato chico a la derecha: días esperando, nombre del cliente, etc. */
export interface MetaFila {
  texto: string;
  /** Tooltip. Un `12d` sin tooltip no dice qué mide. */
  titulo?: string;
  /** Lo destacado va en color y seminegrita: se usa para plata. */
  tono?: TonoFila;
  /** Oculta el dato en pantallas chicas, donde no entra. */
  soloEscritorio?: boolean;
}

export interface AccionFilaProps {
  to: string;
  titulo: string;
  /** El punto de color a la izquierda. "ninguno" lo saca. */
  tono?: TonoFila;
  /** Segunda línea: por qué está trabado, qué dijo el agente. */
  motivo?: string | null;
  /** Datos chicos a la derecha, en el orden en que importan. */
  meta?: MetaFila[];
  /** Para casos que necesitan algo propio a la derecha del título. */
  extra?: ReactNode;
}

export function AccionFila({ to, titulo, tono = "ninguno", motivo, meta = [], extra }: AccionFilaProps) {
  return (
    <Link
      to={to}
      className="block rounded px-1 py-2 text-sm text-inherit no-underline transition-colors hover:bg-accent/40"
    >
      <div className="flex items-center gap-2">
        {tono !== "ninguno" && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: COLOR_TONO[tono] }} />
        )}
        <span className="flex-1 truncate">{titulo}</span>
        {extra}
        {meta.map((m, i) => (
          <span
            key={`${m.texto}-${i}`}
            title={m.titulo}
            className={`shrink-0 text-[10px] tabular-nums ${
              m.tono && m.tono !== "ninguno" ? "font-semibold" : "text-muted-foreground"
            } ${m.soloEscritorio ? "hidden sm:inline" : ""}`}
            style={m.tono && m.tono !== "ninguno" ? { color: COLOR_TONO[m.tono] } : undefined}
          >
            {m.texto}
          </span>
        ))}
      </div>
      {/* El motivo va en segunda línea y recortado a una: sin esto la fila dice
          "Reconectar página Meta" y no dice de qué cuenta; con el texto entero
          una sola fila se come la lista. */}
      {motivo && <p className="mt-0.5 line-clamp-1 pl-0.5 text-[11px] text-muted-foreground">{motivo}</p>}
    </Link>
  );
}

/** El contenedor de una lista de acciones: separadores y márgenes, una vez. */
export function AccionLista({ children }: { children: ReactNode }) {
  return <div className="-mx-1 divide-y divide-border/60">{children}</div>;
}
