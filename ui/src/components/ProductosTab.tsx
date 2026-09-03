// LMTM-OS: sección Productos del cliente + avatar de marca (pedido 14/8).
//
// Lo carga el equipo a mano. Es la referencia visual que los agentes usan para
// generar placas, carruseles y videos — sin esto el modelo inventa el producto.
//
// Las imágenes viven en Drive (super redes/<cliente>/PRODUCTOS) y NO son
// públicas: se muestran vía el proxy /api/drive-img/:fileId.

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { MarcaCard, type Marca } from "./MarcaCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Trash2, Upload, Loader2, ImageOff } from "lucide-react";

interface Producto {
  id: string; name: string; description: string | null;
  imageUrl: string | null; driveFileId: string | null; active: boolean;
}
interface Respuesta {
  client: { id: string; slug: string; name: string; avatarUrl: string | null };
  marca: Marca | null;
  productos: Producto[];
}

/** El link de Drive no se puede usar como <img src>; se pasa por el proxy. */
function srcDe(driveFileId: string | null, imageUrl: string | null): string | null {
  if (driveFileId) return `/api/drive-img/${driveFileId}`;
  const m = imageUrl?.match(/\/file\/d\/([A-Za-z0-9_-]{20,})/);
  if (m) return `/api/drive-img/${m[1]}`;
  return imageUrl ?? null;
}

function Foto({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const [roto, setRoto] = useState(false);
  if (!src || roto) {
    return <div className={`${className} flex items-center justify-center bg-muted`}><ImageOff className="h-4 w-4 text-muted-foreground/40" /></div>;
  }
  return <img src={src} alt={alt} onError={() => setRoto(true)} className={`${className} object-cover`} />;
}

const aBase64 = (f: File) => new Promise<string>((ok, err) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => err(new Error("no se pudo leer el archivo"));
  r.readAsDataURL(f);
});

export function ProductosTab({ clientSlug }: { clientSlug: string }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [desc, setDesc] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  const q = useQuery({
    queryKey: ["productos", clientSlug],
    queryFn: () => api.get<Respuesta>(`/clients/${clientSlug}/productos`),
  });

  const invalidar = () => void qc.invalidateQueries({ queryKey: ["productos", clientSlug] });

  const crear = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { name: nombre, description: desc || undefined };
      if (archivo) { body.imageBase64 = await aBase64(archivo); body.fileName = archivo.name; }
      return api.post(`/clients/${clientSlug}/productos`, body);
    },
    onSuccess: () => { setNombre(""); setDesc(""); setArchivo(null); setError(null); invalidar(); },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => api.delete(`/productos/${id}`),
    onSuccess: invalidar,
  });

  const subirAvatar = useMutation({
    mutationFn: async (f: File) => api.put(`/clients/${clientSlug}/avatar`, { imageBase64: await aBase64(f), fileName: f.name }),
    onSuccess: invalidar,
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  const productos = q.data?.productos ?? [];
  const avatarUrl = q.data?.client.avatarUrl ?? null;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start gap-4 flex-wrap">
          <Foto src={srcDe(null, avatarUrl)} alt="avatar" className="h-20 w-20 rounded-full border shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">Avatar de marca</h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
              Una imagen que represente el estilo visual del cliente. Los agentes la toman de referencia
              para que las placas y los videos salgan con su identidad y no genéricos.
            </p>
            <input
              ref={avatarInput} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) subirAvatar.mutate(f); }}
            />
            <Button size="sm" variant="outline" className="mt-2"
              disabled={subirAvatar.isPending}
              onClick={() => avatarInput.current?.click()}>
              {subirAvatar.isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="ml-1.5">Subiendo…</span></>
                : <><Upload className="h-3.5 w-3.5" /><span className="ml-1.5">{avatarUrl ? "Cambiar" : "Subir"} avatar</span></>}
            </Button>
          </div>
        </div>
      </Card>

      <MarcaCard clientSlug={clientSlug} marca={q.data?.marca ?? null} />

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          Productos ({productos.length})
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Nombre y foto de cada producto. Es lo que el agente usa como referencia al generar contenido.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end border-b pb-3 mb-3">
          <label className="text-xs">
            <span className="text-muted-foreground">Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Cubierta 205/55 R16"
              className="mt-1 w-full bg-background border border-border rounded-md px-2 py-1.5 text-xs" />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Descripción (opcional)</span>
            <input value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="Detalle que ayude al agente"
              className="mt-1 w-full bg-background border border-border rounded-md px-2 py-1.5 text-xs" />
          </label>
          <div className="flex items-center gap-2">
            <label className="text-xs cursor-pointer inline-flex items-center gap-1.5 border border-border rounded-md px-2 py-1.5 hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />
              {archivo ? archivo.name.slice(0, 16) : "Foto"}
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            </label>
            <Button size="sm" disabled={!nombre.trim() || crear.isPending} onClick={() => crear.mutate()}>
              {crear.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Agregar"}
            </Button>
          </div>
        </div>

        {error && <p className="text-xs text-rose-500 mb-2">{error}</p>}

        {productos.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Sin productos cargados. Mientras no haya ninguno, el agente genera contenido genérico.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {productos.map((p) => (
              <div key={p.id} className="border rounded-lg overflow-hidden group relative">
                <Foto src={srcDe(p.driveFileId, p.imageUrl)} alt={p.name} className="w-full aspect-square" />
                <div className="p-2">
                  <p className="text-xs font-medium truncate" title={p.name}>{p.name}</p>
                  {p.description && <p className="text-[10px] text-muted-foreground line-clamp-2">{p.description}</p>}
                </div>
                <button
                  onClick={() => { if (window.confirm(`¿Borrar "${p.name}"?`)) borrar.mutate(p.id); }}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-md bg-background/90 border opacity-0 group-hover:opacity-100 flex items-center justify-center hover:text-rose-500"
                  title="Borrar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
