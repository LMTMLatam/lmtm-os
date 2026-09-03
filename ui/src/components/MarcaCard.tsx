// LMTM-OS: identidad de marca del cliente (18/8).
//
// Vive dentro de la pestaña Productos, que pasó a ser "Marca y productos": el
// equipo abre UN solo lugar y ve todo lo que define al cliente — cómo se ve
// (logo, colores, tipografías), cómo habla (tono, palabras que usa y que evita)
// y qué quiere decir (mensaje, público, diferencial).
//
// No es documentación: es lo que LEEN los agentes al generar. La paleta entra
// directo al prompt de las placas, y el tono al de los copys. Antes esto estaba
// desparramado en tres lados y las piezas salían genéricas.

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Palette, Check } from "lucide-react";

export interface Marca {
  logoUrl: string | null;
  colores: string[];
  tipografias: string[];
  tono: string | null;
  palabrasSi: string[];
  palabrasNo: string[];
  mensaje: string | null;
  publico: string | null;
  diferencial: string | null;
  notas: string | null;
}

const VACIA: Marca = {
  logoUrl: null, colores: [], tipografias: [], tono: null,
  palabrasSi: [], palabrasNo: [], mensaje: null, publico: null,
  diferencial: null, notas: null,
};

/** Los campos de lista se editan como texto separado por comas: pedirle al
 *  equipo que maneje chips para cargar 4 colores es fricción de más. */
const aTexto = (v: string[]) => v.join(", ");
const aLista = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

export function MarcaCard({ clientSlug, marca }: { clientSlug: string; marca: Marca | null }) {
  const qc = useQueryClient();
  const [m, setM] = useState<Marca>(marca ?? VACIA);
  const [guardado, setGuardado] = useState(false);

  // Si llega del server después del primer render (o cambia de cliente), se
  // toma ese valor: sin esto el formulario quedaba con el estado del anterior.
  useEffect(() => { setM(marca ?? VACIA); }, [marca, clientSlug]);

  const guardar = useMutation({
    mutationFn: () => api.put(`/clients/${clientSlug}/marca`, m),
    onSuccess: () => {
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
      void qc.invalidateQueries({ queryKey: ["productos", clientSlug] });
    },
  });

  const campo = (k: keyof Marca, v: string) => setM((prev) => ({ ...prev, [k]: v || null }));

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          Identidad de marca
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
          Lo que los agentes usan para que el contenido salga con la identidad del cliente.
          La paleta va directo al prompt de las placas y el tono al de los copys.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Etiqueta titulo="Colores" ayuda="En hex, separados por coma. El primero es el principal.">
          <Input value={aTexto(m.colores)} placeholder="#0B3D2E, #F2E8DC, #C8A46A"
            onChange={(e) => setM((p) => ({ ...p, colores: aLista(e.target.value) }))} />
          {m.colores.length > 0 && (
            <div className="flex gap-1 mt-1.5">
              {m.colores.map((c, i) => (
                <span key={i} className="h-5 w-5 rounded border border-border/60" style={{ background: c }} title={c} />
              ))}
            </div>
          )}
        </Etiqueta>

        <Etiqueta titulo="Tipografías" ayuda="Las que usa la marca, separadas por coma.">
          <Input value={aTexto(m.tipografias)} placeholder="Poppins, Georgia"
            onChange={(e) => setM((p) => ({ ...p, tipografias: aLista(e.target.value) }))} />
        </Etiqueta>

        <Etiqueta titulo="Logo (URL)" ayuda="Link al archivo del logo.">
          <Input value={m.logoUrl ?? ""} placeholder="https://…"
            onChange={(e) => campo("logoUrl", e.target.value)} />
        </Etiqueta>

        <Etiqueta titulo="Cómo habla" ayuda="El tono en una frase: cercano, técnico, con humor…">
          <Input value={m.tono ?? ""} placeholder="Cercano y directo, sin tecnicismos"
            onChange={(e) => campo("tono", e.target.value)} />
        </Etiqueta>

        <Etiqueta titulo="Palabras que SÍ usa" ayuda="Las propias de la marca.">
          <Input value={aTexto(m.palabrasSi)} placeholder="acompañar, a medida, artesanal"
            onChange={(e) => setM((p) => ({ ...p, palabrasSi: aLista(e.target.value) }))} />
        </Etiqueta>

        <Etiqueta titulo="Palabras que NO usa" ayuda="Las que hay que evitar sí o sí.">
          <Input value={aTexto(m.palabrasNo)} placeholder="barato, low cost, urgente"
            onChange={(e) => setM((p) => ({ ...p, palabrasNo: aLista(e.target.value) }))} />
        </Etiqueta>
      </div>

      <div className="grid gap-3">
        <Etiqueta titulo="Qué quiere comunicar" ayuda="La promesa central, en una o dos líneas.">
          <Input value={m.mensaje ?? ""} placeholder="Que mudarse no tiene por qué ser un quilombo"
            onChange={(e) => campo("mensaje", e.target.value)} />
        </Etiqueta>
        <Etiqueta titulo="A quién le habla" ayuda="El público real, no el ideal de manual.">
          <Input value={m.publico ?? ""} placeholder="Familias de Rosario que compran su primera propiedad"
            onChange={(e) => campo("publico", e.target.value)} />
        </Etiqueta>
        <Etiqueta titulo="Diferencial" ayuda="Por qué lo eligen a él y no al de al lado.">
          <Input value={m.diferencial ?? ""} placeholder="87 años de historia familiar y guardia 365 días"
            onChange={(e) => campo("diferencial", e.target.value)} />
        </Etiqueta>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={guardar.isPending} onClick={() => guardar.mutate()}>
          {guardar.isPending
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="ml-1.5">Guardando…</span></>
            : "Guardar marca"}
        </Button>
        {guardado && <span className="text-xs text-emerald-500 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Guardado</span>}
        {guardar.isError && <span className="text-xs text-rose-500">No se pudo guardar</span>}
      </div>
    </Card>
  );
}

function Etiqueta({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium">{titulo}</span>
      <span className="block text-[10px] text-muted-foreground mb-1">{ayuda}</span>
      {children}
    </label>
  );
}
