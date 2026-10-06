// LMTM: qué decisiones se ven de entrada en Hoy y cuáles van plegadas.
//
// El primer ensayo del motor contra producción abría 90 decisiones: unas 80
// sin plata medida (datos que faltan por cliente y pedidos esperando a una
// persona). Ya van debajo de las de plata, pero 80 filas en el celular son un
// cementerio desde el día 1: nadie llega al final y lo de abajo deja de verse.
// Se ve todo lo que tiene plata y unas pocas sin plata; el resto queda en UNA
// línea que dice cuántas son y de qué, con un botón para abrirlas. Nada se
// esconde sin contarlo.

/** Cuántas sin plata se muestran de entrada, además de todas las que tienen plata. */
export const SIN_PLATA_A_LA_VISTA = 5;

/** De qué es cada grupo, dicho desde el lado de quien lee. Por prefijo del tipo. */
const FAMILIA: Record<string, string> = {
  cola: "esperando a una persona",
  cobertura: "de datos que no estamos viendo",
  cadena: "de la cadena de publicación",
  pauta: "de pauta",
  saldo: "de saldo",
};

export interface Plegado<T> {
  visibles: T[];
  plegadas: T[];
  /** Las plegadas contadas por familia, de la más numerosa a la menos. */
  porFamilia: Array<{ familia: string; cantidad: number }>;
}

/** Recibe las decisiones ya ordenadas por plata (como las manda el server) y no las reordena. */
export function plegarSinPlata<T extends { arsPorDia: number | null; tipo: string }>(decisiones: T[], aLaVista = SIN_PLATA_A_LA_VISTA): Plegado<T> {
  const visibles: T[] = [];
  const plegadas: T[] = [];
  let sinPlataVistas = 0;
  for (const d of decisiones) {
    if (d.arsPorDia != null) visibles.push(d);
    else if (sinPlataVistas < aLaVista) {
      visibles.push(d);
      sinPlataVistas++;
    } else plegadas.push(d);
  }
  const cuenta = new Map<string, number>();
  for (const d of plegadas) {
    const familia = FAMILIA[d.tipo.split(":")[0]] ?? "de otros temas";
    cuenta.set(familia, (cuenta.get(familia) ?? 0) + 1);
  }
  const porFamilia = [...cuenta.entries()].map(([familia, cantidad]) => ({ familia, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
  return { visibles, plegadas, porFamilia };
}

/** "42 esperando a una persona y 33 de datos que no estamos viendo". */
export function frasePlegadas(porFamilia: Plegado<unknown>["porFamilia"]): string {
  const partes = porFamilia.map((f) => `${f.cantidad} ${f.familia}`);
  return partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}
