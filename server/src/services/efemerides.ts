// LMTM-OS: marketing key dates (Argentina-focused). Used by the operational
// auditor and the opportunities engine to anticipate content.

export interface Efemeride { md: string; name: string }

// md = "MM-DD". Keep it pragmatic; operators can extend later.
export const EFEMERIDES: Efemeride[] = [
  { md: "01-01", name: "Año Nuevo" },
  { md: "02-14", name: "San Valentín / Día de los Enamorados" },
  { md: "03-08", name: "Día de la Mujer" },
  { md: "03-21", name: "Inicio del otoño / Día de la Felicidad" },
  { md: "04-01", name: "Día de la Educación / temporada" },
  { md: "05-01", name: "Día del Trabajador" },
  { md: "05-25", name: "Revolución de Mayo" },
  { md: "06-20", name: "Día de la Bandera" },
  { md: "06-21", name: "Día del Padre (3er domingo, aprox.)" },
  { md: "07-09", name: "Día de la Independencia" },
  { md: "07-20", name: "Día del Amigo" },
  { md: "08-17", name: "Día del Niño (aprox.)" },
  { md: "09-21", name: "Día del Estudiante / Primavera" },
  { md: "10-12", name: "Día de la Diversidad Cultural" },
  { md: "10-19", name: "Día de la Madre (3er domingo, aprox.)" },
  { md: "11-01", name: "Temporada / Black Friday (fin de mes)" },
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
