// LMTM-OS: la aprobación del cliente la carga una persona (05/11).
//
// En LMTM-6704, Caro marcó "Aprobación de cliente = APROBADO" en 2 piezas de
// LoMasFundas sin que el cliente dijera nada, porque el despachador de Make lo
// exige para publicar. Las herramientas de ClickUp no escriben ese campo: sacó el
// token del código de una planilla y lo hizo con un script. La skill ya lo prohibía
// y lo razonó de largo. Por eso esto no es una regla más: frena la herramienta.
//
// Claude Code corre este script antes de cada comando o archivo que escribe el
// agente, aunque corra con --dangerously-skip-permissions. Salir con 2 frena y el
// agente lee el motivo. Si el script se rompe sale con 1, que no frena: un error
// acá no puede dejar a toda la flota sin herramientas.
//
// ponytail: mira el texto, así que un valor armado en partes o codificado pasa. El
// cierre de verdad es que el agente no tenga un token de ClickUp a mano.

import { readFileSync } from "node:fs";

// Los mismos ids en todas las listas de clientes (mirado en LoMasFundas y DUNOD).
const CAMPO = "f7103b6e-2d6a-407e-bb99-9d7cfe8d4a6e"; // Aprobación de cliente
const OPCION_APROBADO = "f77f08b3-3b6f-4ee0-8d02-3a2d3d6e3dca";

// Los verbos van en mayúsculas a propósito: en minúscula, "post" es un posteo.
const ESCRIBE = /\b(POST|PUT|PATCH)\b|--data|\s-d\s|requests\.(post|put|patch)\b|method\s*[:=]\s*["'`]?(post|put|patch)\b/;

function marcaAprobado(texto) {
  // Caro separó los ids en un archivo de configuración y la llamada en un script:
  // los dos ids juntos alcanzan, aunque en ese texto no se vea ninguna escritura.
  if (texto.includes(OPCION_APROBADO) && texto.includes(CAMPO)) return true;
  if (!ESCRIBE.test(texto)) return false;

  const clickup = /clickup/i.test(texto);
  if (clickup && texto.includes(OPCION_APROBADO)) return true;

  const aprobado = /\bAPROBADO\b/.test(texto);
  if (clickup && aprobado && /aprobaci/i.test(texto)) return true;
  // La planilla pisa a ClickUp en cada sync: marcarlo ahí es lo mismo.
  return aprobado && /sheets\.googleapis\.com/i.test(texto);
}

const { tool_input: { old_string: _loQueSeBorra, ...entrada } = {} } = JSON.parse(readFileSync(0, "utf8"));

if (marcaAprobado(Object.values(entrada).join("\n"))) {
  console.error(
    "Frenado: \"Aprobación de cliente = APROBADO\" lo carga una persona cuando el cliente dijo que sí, " +
      "en ClickUp o en su planilla. Que el despachador lo exija para publicar no es un permiso. " +
      "Dejalo en PENDIENTE y pedí la aprobación con paperclipCreateApproval. " +
      "Para leer el campo no hacen falta estos ids: filtrá por nombre.",
  );
  process.exit(2);
}
