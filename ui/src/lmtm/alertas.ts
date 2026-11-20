// LMTM: las alertas de Hoy (pedido de Naza 20/11: «alertas del estilo: estamos por detrás de la competencia en muchos
// clientes del nicho… no acción humana»). Son lecturas de los datos, con su número; lo que hay que hacer va a
// Pendientes. Puro: entra lo que ya traen los endpoints, sale la lista ordenada.

import type { NicheIntel } from "../api/niches";
import type { Cartera } from "../api/informes";
import type { AnalisisContenido } from "../app/QueFunciona";

export interface Alerta {
  clave: string;
  tono: "atencion" | "bien" | "dato";
  /** El número que se lee de lejos («4 de 8», «2,3×»). */
  grande: string;
  texto: string;
  link?: string;
}

const veces = (x: number) => `${x.toFixed(1).replace(".", ",")}×`;
const MAX = 6;

export function alertasDeAgencia(e: { nichos?: NicheIntel[]; contenido?: AnalisisContenido; cartera?: Cartera }): Alerta[] {
  const out: Alerta[] = [];

  // Pauta contra el nicho: más de la mitad de los clientes con pauta muy por debajo del CTR ideal, o muy por arriba
  // del costo promedio del rubro.
  for (const n of e.nichos ?? []) {
    const ev = n.benchmark?.evidence;
    const conPauta = n.clients.filter((c) => c.ads30d && c.ads30d.spend > 0 && !c.monedaCuenta);
    if (ev?.idealCtr) {
      const medidos = conPauta.filter((c) => c.ads30d!.ctr != null);
      const bajos = medidos.filter((c) => c.ads30d!.ctr! < ev.idealCtr! * 0.6).length;
      if (medidos.length >= 3 && bajos / medidos.length >= 0.5) {
        out.push({ clave: `ctr:${n.niche}`, tono: "atencion", grande: `${bajos} de ${medidos.length}`, texto: `clientes de ${n.niche} con el CTR de Meta muy por debajo del nicho`, link: "/nichos" });
      }
    }
    if (ev?.avgCpl) {
      const medidos = conPauta.filter((c) => c.ads30d!.cpl != null && !c.ads30d!.leadsDudosos);
      const caros = medidos.filter((c) => c.ads30d!.cpl! > ev.avgCpl! * 1.3).length;
      if (medidos.length >= 3 && caros / medidos.length >= 0.5) {
        out.push({ clave: `cpl:${n.niche}`, tono: "atencion", grande: `${caros} de ${medidos.length}`, texto: `clientes de ${n.niche} pagan la consulta más cara que el promedio del rubro`, link: "/nichos" });
      }
    }
  }

  // Frecuencia contra la competencia, por nicho: publicaciones por cuenta en el mismo período.
  const c = e.contenido;
  if (c?.competencia) {
    for (const nuestro of c.nichos) {
      const comp = c.competencia.nichos.find((x) => x.nicho === nuestro.nicho);
      if (!comp || nuestro.cuentas < 2 || comp.cuentas < 2) continue;
      const ratio = nuestro.publicaciones / nuestro.cuentas / (comp.publicaciones / comp.cuentas);
      if (ratio < 0.8) out.push({ clave: `frecuencia:${nuestro.nicho}`, tono: "atencion", grande: veces(1 / ratio), texto: `más publica la competencia de ${nuestro.nicho} por cuenta`, link: "/nichos" });
      else if (ratio >= 1.5) out.push({ clave: `frecuencia:${nuestro.nicho}`, tono: "bien", grande: veces(ratio), texto: `más publicamos que la competencia en ${nuestro.nicho}, por cuenta`, link: "/nichos" });
    }
  }

  // Formato y ángulo que rinden y se usan poco.
  if (c && c.publicaciones > 0) {
    const mejor = [...c.formatos].sort((a, b) => b.indice - a.indice)[0];
    if (mejor && mejor.indice >= 1.15) {
      const parte = Math.round((mejor.publicaciones / c.publicaciones) * 100);
      if (parte < 50) out.push({ clave: "formato", tono: "dato", grande: veces(mejor.indice), texto: `rinde ${mejor.nombre.replace(/^Instagram · /, "el ")} y es solo el ${parte}% de lo que publicamos` });
    }
    const angulo = [...c.angulos].filter((a) => a.publicaciones <= 15).sort((a, b) => b.indice - a.indice)[0];
    if (angulo && angulo.indice >= 2) {
      out.push({ clave: "angulo", tono: "dato", grande: veces(angulo.indice), texto: `rinde el ángulo «${angulo.nombre}» y se usó ${angulo.publicaciones} veces en ${c.dias} días` });
    }
  }

  // La cartera esta semana contra su objetivo.
  const arriba = (e.cartera?.clientes ?? []).filter((x) => x.estado === "arriba" || x.estado === "muy_arriba").length;
  if (arriba >= 3) out.push({ clave: "objetivo", tono: "atencion", grande: String(arriba), texto: "clientes con el costo por consulta arriba de su objetivo esta semana", link: "/clientes" });

  const orden = { atencion: 0, bien: 1, dato: 2 };
  return out.sort((a, b) => orden[a.tono] - orden[b.tono]).slice(0, MAX);
}

/** Puro. Cuántos clientes bajaron, mantuvieron o subieron su costo por consulta contra la semana anterior (±10%). */
export function movimientoCartera(cartera?: Cartera) {
  let bajo = 0;
  let igual = 0;
  let subio = 0;
  for (const f of cartera?.clientes ?? []) {
    const a = f.semana.cplAnterior;
    const b = f.semana.cpl;
    if (a == null || b == null || a <= 0 || f.semana.leadsDudosos) continue;
    const cambio = (b - a) / a;
    if (cambio <= -0.1) bajo += 1;
    else if (cambio >= 0.1) subio += 1;
    else igual += 1;
  }
  return { bajo, igual, subio };
}
