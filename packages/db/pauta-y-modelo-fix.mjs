// LMTM-OS: deja a los 14 agentes con las palancas de presupuesto Y con el
// modelo nuevo. Lo tiene que correr alguien con acceso a la DB de Railway.
//
//   DATABASE_URL=... node packages/db/pauta-y-modelo-fix.mjs            (ensayo)
//   DATABASE_URL=... node packages/db/pauta-y-modelo-fix.mjs --aplicar  (escribe)
//
// POR QUÉ HACE FALTA ESTE SCRIPT
// Las tools nuevas (`lmtmSetBudget`, `lmtmShiftBudget`) existen en el server,
// pero cada agente tiene una ALLOWLIST en `adapter_config.env.PAPERCLIP_MCP_TOOLS`:
// lo que no está ahí, el agente no lo ve. Ya pasó antes — una capacidad nueva
// queda invisible para la flota y parece que "no funciona".
//
// Y el modelo de cada agente sale de `adapter_config.model`, no del default del
// código, así que registrar MiniMax-M3.1-Flash-Preview en las listas no alcanza
// para que lo usen.
//
// EL ENSAYO ES EL DEFAULT a propósito: esto escribe sobre los 14 agentes de
// producción. Primero se mira qué va a cambiar.

import postgres from "postgres";

const APLICAR = process.argv.includes("--aplicar");

const TOOLS_NUEVAS = ["lmtmSetBudget", "lmtmShiftBudget"];
const MODELO_NUEVO = "MiniMax-M3.1-Flash-Preview";

// Sólo se le cambia el modelo a quien hoy corre con uno de estos. Un agente que
// alguien puso a mano en otro modelo tuvo una razón, y este script no la sabe.
const MODELOS_A_MIGRAR = new Set(["MiniMax-M3", "MiniMax-M2", ""]);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1 });

try {
  const agentes = await sql`
    select id, name, adapter_type, adapter_config
    from agents
    where adapter_type in ('minimax_local', 'minimax_cloud')
    order by name
  `;

  if (agentes.length === 0) {
    console.log("No hay agentes con adapter minimax. Nada que hacer.");
    process.exit(0);
  }

  console.log(`${agentes.length} agentes con adapter minimax.\n`);
  let conCambios = 0;

  for (const a of agentes) {
    const cfg = a.adapter_config ?? {};
    const env = cfg.env ?? {};
    const cambios = [];

    // 1) Allowlist de tools.
    const actuales = String(env.PAPERCLIP_MCP_TOOLS ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    // Si el agente NO tiene allowlist, ve todas las tools: agregarle una lista
    // ahora sería RESTRINGIRLO, justo lo contrario de lo que queremos.
    const tieneAllowlist = actuales.length > 0;
    const faltan = tieneAllowlist ? TOOLS_NUEVAS.filter((t) => !actuales.includes(t)) : [];
    if (faltan.length > 0) cambios.push(`+tools: ${faltan.join(", ")}`);

    // 2) Modelo.
    const modeloActual = String(cfg.model ?? "");
    const migraModelo = MODELOS_A_MIGRAR.has(modeloActual) && modeloActual !== MODELO_NUEVO;
    if (migraModelo) cambios.push(`modelo: ${modeloActual || "(default)"} -> ${MODELO_NUEVO}`);

    if (cambios.length === 0) {
      console.log(`  = ${a.name}: sin cambios${tieneAllowlist ? "" : " (sin allowlist: ya ve todas las tools)"}`);
      continue;
    }

    conCambios += 1;
    console.log(`  ${APLICAR ? "*" : "~"} ${a.name}: ${cambios.join(" | ")}`);

    if (!APLICAR) continue;

    const nuevoCfg = { ...cfg };
    if (faltan.length > 0) {
      nuevoCfg.env = { ...env, PAPERCLIP_MCP_TOOLS: [...actuales, ...faltan].join(",") };
    }
    if (migraModelo) nuevoCfg.model = MODELO_NUEVO;

    await sql`update agents set adapter_config = ${sql.json(nuevoCfg)} where id = ${a.id}`;
  }

  console.log(`\n${conCambios} agentes ${APLICAR ? "actualizados" : "cambiarían"}.`);
  if (!APLICAR && conCambios > 0) console.log("Volvé a correrlo con --aplicar para escribir.");
  if (APLICAR && conCambios > 0) {
    console.log("\nOJO: regenerá el backup de agentes después de esto (hermes-migrate.mjs backup).");
  }
} finally {
  await sql.end({ timeout: 5 });
}
