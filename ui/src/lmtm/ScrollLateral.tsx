// LMTM: una fila que scrollea para los costados y se nota que scrollea.
//
// La barra de secciones del cliente tenía 14 pestañas con la barra de scroll
// oculta: con mouse no había cómo llegar a las de la derecha (la ruedita es
// vertical) y en la pantalla no se veía que había más (pedido 10/11). Acá:
//  · la ruedita vertical mueve la fila para el costado (solo si hay para dónde);
//  · flechas en los bordes cuando hay más a un lado, con un degradé;
//  · la pestaña activa se trae a la vista al entrar.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Hay más contenido a cada lado. Pura. */
export function bordes(el: { scrollLeft: number; scrollWidth: number; clientWidth: number }): { izq: boolean; der: boolean } {
  const resto = el.scrollWidth - el.clientWidth - el.scrollLeft;
  return { izq: el.scrollLeft > 2, der: resto > 2 };
}

export function ScrollLateral({
  children,
  className = "",
  fondo = "var(--l-papel)",
  activoSelector = "[aria-current='page'],[aria-selected='true'],[data-activo='true']",
  etiqueta,
}: {
  children: ReactNode;
  className?: string;
  /** Color del degradé de los bordes (el fondo donde está la fila). */
  fondo?: string;
  /** Qué elemento traer a la vista al montar. */
  activoSelector?: string;
  etiqueta?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lados, setLados] = useState({ izq: false, der: false });
  const medir = useCallback(() => {
    if (ref.current) setLados(bordes(ref.current));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelector<HTMLElement>(activoSelector)?.scrollIntoView({ block: "nearest", inline: "center" });
    medir();
    // La ruedita vertical mueve la fila, solo si la fila tiene para dónde ir:
    // si no, la página sigue bajando como siempre.
    const rueda = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const { izq, der } = bordes(el);
      if ((e.deltaY > 0 && !der) || (e.deltaY < 0 && !izq)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", rueda, { passive: false });
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => {
      el.removeEventListener("wheel", rueda);
      ro.disconnect();
    };
  }, [activoSelector, medir]);

  const mover = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });

  return (
    <div className={`relative ${className}`}>
      {/* Sin barra visible: con las flechas, el degradé y la ruedita alcanza, y
          la barra gruesa de Windows tapaba media fila. */}
      <div ref={ref} onScroll={medir} className="flex overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={etiqueta}>
        {children}
      </div>
      {lados.izq && (
        <button
          type="button"
          onClick={() => mover(-1)}
          aria-label="Ver las anteriores"
          className="absolute inset-y-0 left-0 flex w-10 items-center justify-start"
          style={{ background: `linear-gradient(to right, ${fondo} 45%, transparent)` }}
        >
          <ChevronLeft className="h-4 w-4 opacity-70" aria-hidden />
        </button>
      )}
      {lados.der && (
        <button
          type="button"
          onClick={() => mover(1)}
          aria-label="Ver más"
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-end"
          style={{ background: `linear-gradient(to left, ${fondo} 45%, transparent)` }}
        >
          <ChevronRight className="h-4 w-4 opacity-70" aria-hidden />
        </button>
      )}
    </div>
  );
}
