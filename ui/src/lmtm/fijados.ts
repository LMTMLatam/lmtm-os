// LMTM: los clientes fijados en el riel (rediseño 20/11). Es una comodidad de cada
// persona: vive en su navegador, y si el navegador no deja guardar, el riel anda sin fijados.

import { useSyncExternalStore } from "react";

export interface Fijado { slug: string; nombre: string }

const CLAVE = "lmtm.fijados";
/** El riel tiene lugar para pocos: más que esto es otra lista de clientes. */
export const MAX_FIJADOS = 8;

/** Puro. Saca el cliente si estaba; si no, lo suma al final (sin pasar el tope). */
export function alternar(lista: Fijado[], c: Fijado): Fijado[] {
  if (lista.some((f) => f.slug === c.slug)) return lista.filter((f) => f.slug !== c.slug);
  return [...lista, c].slice(-MAX_FIJADOS);
}

function leer(): Fijado[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((f): f is Fijado => typeof f?.slug === "string" && typeof f?.nombre === "string") : [];
  } catch {
    return [];
  }
}

let actual: Fijado[] | null = null;
const oyentes = new Set<() => void>();

function guardar(lista: Fijado[]) {
  actual = lista;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento: queda en memoria hasta recargar */
  }
  oyentes.forEach((o) => o());
}

export function useFijados() {
  const lista = useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => (actual ??= leer()),
  );
  return {
    lista,
    fijado: (slug: string) => lista.some((f) => f.slug === slug),
    alternar: (c: Fijado) => guardar(alternar(lista, c)),
  };
}
