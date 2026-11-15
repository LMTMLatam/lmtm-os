// Prueba la selección de tareas del motor propio con SOLO LECTURA. npx tsx scripts/probar-motor.ts "Carlos (Competitor)" "Luna (CMO)"
import { createDb, agents } from "@paperclipai/db";
import { inArray } from "drizzle-orm";
import { estadoMotor, pendientes } from "../src/agentes/motor.js";

const db = createDb(process.env.DATABASE_URL_RO!);
const nombres = process.argv.slice(2);
const ag = await db.select({ id: agents.id, name: agents.name }).from(agents).where(inArray(agents.name, nombres));
console.log("agentes:", ag.map((a) => a.name).join(", "));
const t = Date.now();
const p = await pendientes(db, ag.map((a) => a.id));
console.log("pendientes en", Date.now() - t, "ms:");
for (const x of p) console.log(" ", ag.find((a) => a.id === x.agentId)?.name, "|", x.identifier, x.status, x.priority, "|", x.title.slice(0, 80));
const e = await estadoMotor(db);
console.log("estado:", e.length, "agentes claude_local;", e.filter((x) => x.enMotorPropio).length, "en el motor propio");
process.exit(0);
