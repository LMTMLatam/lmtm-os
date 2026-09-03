// LMTM-OS: guard rails for script_update_content.
//
// Every rule here comes from something that actually broke a client's
// Sheet→ClickUp sync (audited 2026-08-25, 127 scripts). The scripts swallow
// their own errors and still report COMPLETED, so a broken one syncs nothing
// for months without anyone noticing — which is why this is enforced at the
// tool instead of being written down in a skill.
//
// The check runs against the CURRENT content of the project, so it can tell a
// legitimate rewrite from a regression: you may restructure the code freely,
// you just can't drop what the running version already had.

import vm from "node:vm";

export interface ScriptFile {
  name: string;
  type: "SERVER_JS" | "HTML" | "JSON";
  source: string;
}

/** Config constants the Sheet→ClickUp scripts depend on at runtime. */
const CONFIG_KEYS = [
  "PROJECTS_TO_SYNC",
  "COLUMNS",
  "FIELD_IDS",
  "FIELD_KINDS",
  "OPTIONS_MAP",
  "KEYS_DD",
  "KEYS_LABELS",
  "KEYS_DATE",
  "NO_BORRAR",
] as const;

function serverJs(files: ScriptFile[]): string {
  return files.filter((f) => f.type === "SERVER_JS").map((f) => f.source).join("\n");
}

/** Declared as `const|var|let NAME =` or `function NAME(`. Textual on purpose:
 *  it has to agree with what V8 sees in a plain Apps Script file, not with a
 *  full parse. */
function declares(code: string, name: string): boolean {
  for (const kw of ["const ", "var ", "let "]) {
    let from = 0;
    for (;;) {
      const i = code.indexOf(kw + name, from);
      if (i < 0) break;
      from = i + 1;
      const before = i === 0 ? "\n" : code[i - 1];
      const after = code[i + kw.length + name.length];
      if (" \t\r\n;}".includes(before) && after !== undefined && " \t\r\n=".includes(after)) return true;
    }
  }
  return code.includes(`function ${name}(`);
}

/** Referenced as NAME[...] / NAME.foo / NAME(...) somewhere in the code. */
function uses(code: string, name: string): boolean {
  return code.includes(`${name}[`) || code.includes(`${name}.`) || code.includes(`${name}(`);
}

/** Does this version write custom fields at all? */
function writesCustomFields(code: string): boolean {
  return code.includes("/field/") || code.includes("custom_fields");
}

export interface Violation {
  regla: string;
  detalle: string;
}

/**
 * @param nuevos  files about to be written
 * @param actuales files currently in the project (empty for a brand-new one)
 */
export function validarAppsScript(nuevos: ScriptFile[], actuales: ScriptFile[]): Violation[] {
  const v: Violation[] = [];
  const nuevo = serverJs(nuevos);
  const actual = serverJs(actuales);

  // 1. The manifest is mandatory — the API rejects the write without it, but
  //    failing here gives a message that says what to do.
  if (!nuevos.some((f) => f.type === "JSON" && f.name === "appsscript")) {
    v.push({
      regla: "manifest",
      detalle: "falta el archivo 'appsscript' (type JSON). script_update_content reemplaza TODOS los archivos: traelos con script_get_content y mandá también el manifest.",
    });
  }

  // 2. Everything has to parse. A script that doesn't parse dies on every run.
  for (const f of nuevos) {
    if (f.type === "SERVER_JS") {
      try {
        new vm.Script(f.source, { filename: `${f.name}.gs` });
      } catch (e) {
        v.push({ regla: "sintaxis", detalle: `${f.name}.gs no compila: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
    if (f.type === "JSON") {
      try {
        JSON.parse(f.source);
      } catch (e) {
        v.push({ regla: "sintaxis", detalle: `${f.name}.json no es JSON válido: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
  }

  // 3. Config used but never declared. This is exactly what killed the 59
  //    scripts del pipeline de video: usaban FIELD_IDS y OPTIONS_MAP sin
  //    declararlos, tiraban ReferenceError en la primera fila, y como el error
  //    queda atrapado en el try/catch la corrida terminaba COMPLETED en 2s.
  for (const k of CONFIG_KEYS) {
    if (uses(nuevo, k) && !declares(nuevo, k)) {
      v.push({
        regla: "config-sin-declarar",
        detalle: `el código usa ${k} pero no lo declara en ningún archivo → ReferenceError en la primera fila y el script no sincroniza nada (el error queda atrapado y la corrida igual figura COMPLETED).`,
      });
    }
  }

  // 4. Regression: what the running version had can't just disappear.
  for (const k of CONFIG_KEYS) {
    if (declares(actual, k) && !declares(nuevo, k)) {
      v.push({
        regla: "config-borrada",
        detalle: `la versión que está corriendo declara ${k} y la nueva no. Si querés sacarlo, sacá también el código que lo usa.`,
      });
    }
  }
  if (actual && writesCustomFields(actual) && !writesCustomFields(nuevo)) {
    v.push({
      regla: "campos-perdidos",
      detalle: "la versión que está corriendo escribe campos personalizados en ClickUp y la nueva no escribe ninguno. Así quedó Hotel San Bernardo: sincronizaba sólo el nombre de la tarea.",
    });
  }

  // 5. ClickUp endpoints that don't exist. Verificados contra la API real el
  //    25/8/26: los tres devuelven lo que dice el mensaje.
  if (/api\.clickup\.com\/api\/v2\/task\/[^"'`\n]*\/field["'`\s,)]/.test(nuevo)) {
    v.push({
      regla: "endpoint-inventado",
      detalle: "POST /task/{id}/field sin el fieldId (bulk) no existe: ClickUp responde 405 y no se escribe ningún campo. Va uno por campo: POST /task/{id}/field/{fieldId} con body {value}.",
    });
  }
  if (/custom_fields/.test(nuevo)) {
    // custom_fields sólo es válido al CREAR la tarea; dentro del PUT lo ignora.
    const putConCustom = /clickupUpdateTask_\(\s*[A-Za-z0-9_]+\s*,\s*[^)]*custom_fields/.test(nuevo)
      || /method:\s*["']put["'][^}]*custom_fields/.test(nuevo);
    if (putConCustom) {
      v.push({
        regla: "endpoint-inventado",
        detalle: "PUT /task/{id} con custom_fields responde 200 pero los IGNORA: los campos no se actualizan. Así estuvo NUMORPH. Mandalos con POST /task/{id}/field/{fieldId}.",
      });
    }
  }

  // 6. Los campos phone y email de ClickUp validan formato y rechazan con 400.
  //    En las planillas no hay un solo valor válido en esas columnas.
  return v;
}

export function mensajeDeRechazo(v: Violation[]): string {
  return [
    "script_update_content rechazado: el cambio rompería el sync Sheet→ClickUp de este cliente.",
    "",
    ...v.map((x, i) => `${i + 1}. [${x.regla}] ${x.detalle}`),
    "",
    "Estos scripts se tragan sus propios errores: una corrida rota igual termina COMPLETED, así que nadie se entera hasta que alguien audita.",
    "Traé el contenido actual con script_get_content y hacé el cambio mínimo sobre esa base, en vez de reescribir el archivo entero.",
  ].join("\n");
}
