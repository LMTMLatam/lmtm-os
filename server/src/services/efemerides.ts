// LMTM-OS: marketing key dates (Argentina-focused). Used by the operational
// auditor and the opportunities engine to anticipate content.

export interface Efemeride { md: string; name: string; rubros?: string[]; angulo?: string }

// md = "MM-DD". Keep it pragmatic; operators can extend later.
export const EFEMERIDES: Efemeride[] = [
  { md: "01-01", name: "Año Nuevo" },
  { md: "02-14", name: "San Valentín / Día de los Enamorados", rubros: ["retail-consumo", "turismo-hoteleria", "entretenimiento-eventos"], angulo: "experiencias en pareja" },
  { md: "03-08", name: "Día de la Mujer" },
  { md: "03-21", name: "Inicio del otoño / Día de la Felicidad" },
  { md: "04-01", name: "Día de la Educación / temporada" },
  { md: "05-01", name: "Día del Trabajador" },
  { md: "05-25", name: "Revolución de Mayo" },
  { md: "06-20", name: "Día de la Bandera" },
  { md: "06-21", name: "Día del Padre (3er domingo, aprox.)" },
  { md: "07-09", name: "Día de la Independencia" },
  { md: "07-20", name: "Día del Amigo" },
  { md: "08-16", name: "Día del Niño (3er domingo agosto)", rubros: ["retail-consumo", "entretenimiento-eventos"], angulo: "regalos, promos, familia" },
  { md: "08-17", name: "Feriado San Martín — finde largo", rubros: ["turismo-hoteleria"], angulo: "escapadas y reservas" },
  { md: "09-02", name: "Día de la Industria", rubros: ["industria-b2b", "insumo-industrial", "construccion-materiales"], angulo: "orgullo de planta, historia, B2B" },
  { md: "09-26", name: "Día del Corredor Inmobiliario", rubros: ["inmobiliaria", "desarrollador"], angulo: "humanizar al equipo comercial" },
  { md: "09-21", name: "Día del Estudiante / Primavera" },
  { md: "10-12", name: "Día de la Diversidad Cultural" },
  { md: "10-18", name: "Día de la Madre AR (3er domingo octubre)", rubros: ["retail-consumo", "entretenimiento-eventos", "turismo-hoteleria"], angulo: "frases icónicas de madres argentinas, regalos y experiencias" },
  { md: "11-02", name: "CyberMonday AR (aprox. 2-4/11)", rubros: ["retail-consumo", "tecnologia", "finanzas-servicios"], angulo: "ofertas online, urgencia" },
  { md: "11-20", name: "Día de la Soberanía — finde largo", rubros: ["turismo-hoteleria"], angulo: "escapadas" },
  { md: "11-29", name: "Black Friday / Cyber Monday" },
  { md: "12-08", name: "Inmaculada Concepción / inicio temporada navideña" },
  { md: "12-24", name: "Nochebuena" },
  { md: "12-25", name: "Navidad" },
  { md: "12-31", name: "Fin de año" },
];

/** Efemérides within the next `days` days from `from`. */
export function upcomingEfemerides(from: Date, days = 14): Array<{ name: string; date: string; inDays: number }> {
  const out: Array<{ name: string; date: string; inDays: number }> = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(from.getTime() + i * 86400000);
    const md = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    for (const e of EFEMERIDES) {
      if (e.md === md) out.push({ name: e.name, date: d.toISOString().slice(0, 10), inDays: i });
    }
  }
  return out;
}

/** Efemérides próximas filtradas por rubro del cliente (pedido 18/7): las
 *  etiquetadas con rubros solo aplican a esos; las genéricas, a todos. */
export function efemeridesProximasPorRubro(industry: string | null | undefined, days = 21): Array<{ name: string; date: string; inDays: number; angulo?: string }> {
  const rubro = (industry ?? "").toLowerCase();
  const base = upcomingEfemerides(new Date(), days);
  return base.filter((u) => {
    const def = EFEMERIDES.find((e) => e.name === u.name);
    if (!def?.rubros?.length) return true;
    return def.rubros.some((r) => rubro.includes(r) || r.includes(rubro));
  }).map((u) => ({ ...u, angulo: EFEMERIDES.find((e) => e.name === u.name)?.angulo }));
}
