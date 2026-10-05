// Vitrina de lo que se construyó respondiendo a los dos audios del 4/10/26.
//
// Existe para poder MIRAR los cambios antes de subirlos a producción: todo lo
// de acá corre con datos de ejemplo, sin servidor y sin base. Es el paso previo
// a deployar, no un reemplazo.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";

function StoryShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="paperclip-story">
      <main className="paperclip-story__inner space-y-6">{children}</main>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  antes,
  children,
}: {
  eyebrow: string;
  title: string;
  antes: string;
  children: React.ReactNode;
}) {
  return (
    <section className="paperclip-story__frame overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="paperclip-story__label">{eyebrow}</div>
        <h2 className="mt-1 text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          <b>Antes:</b> {antes}
        </p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

// ── 3. La tabla de cartera cruzada ───────────────────────────────────────────

const CARTERA = [
  { nombre: "DISTRILLANTAS", rubro: "gomeria", inv: 0, leads: 0, cpl: null, dRubro: null, dPropio: null, fmt: null, parado: 31_500, accion: "Reactivar: 31.500 por día parados", tono: "critico" },
  { nombre: "MA PROPIEDADES", rubro: "inmobiliaria", inv: 184_000, leads: 0, cpl: null, dRubro: null, dPropio: null, fmt: "video 80%", parado: 0, accion: "Gasta y no trae leads: revisar conversión", tono: "critico" },
  { nombre: "AGUARA", rubro: "construccion", inv: 96_400, leads: 18, cpl: 5_356, dRubro: 34, dPropio: 41, fmt: "imagen 72%", parado: 0, accion: "Se encareció 41% contra sus propios 30 días previos", tono: "alerta" },
  { nombre: "MAERS", rubro: "industrial", inv: 142_000, leads: 51, cpl: 2_784, dRubro: 28, dPropio: 6, fmt: "carrusel 55%", parado: 0, accion: "CPL 28% arriba del rubro: revisar creatividad", tono: "alerta" },
  { nombre: "DUNOD", rubro: "retail", inv: 211_000, leads: 118, cpl: 1_788, dRubro: -31, dPropio: -12, fmt: "video 61%", parado: 0, accion: "CPL 31% mejor que el rubro: momento de escalar", tono: "oportunidad" },
  { nombre: "RENO", rubro: "amoblamientos", inv: 64_000, leads: 22, cpl: 2_909, dRubro: -4, dPropio: 2, fmt: "imagen 88%", parado: 0, accion: "88% de los avisos son del mismo formato: diversificar", tono: "alerta" },
  { nombre: "CLAMEVET", rubro: "veterinaria", inv: 0, leads: 0, cpl: null, dRubro: null, dPropio: null, fmt: null, parado: 0, accion: "Sin pauta en el período", tono: "neutro" },
];

const TONO: Record<string, string> = {
  critico: "var(--estado-critico)",
  alerta: "var(--estado-alerta)",
  oportunidad: "var(--estado-ok)",
  neutro: "var(--color-muted-foreground)",
};

function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground/50">—</span>;
  return (
    <span
      className="tabular-nums"
      style={{ color: Math.abs(pct) < 10 ? undefined : pct < 0 ? "var(--estado-ok)" : "var(--estado-alerta)" }}
    >
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

function TablaCarteraDemo() {
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Cartera cruzada</h3>
        <span className="text-xs text-muted-foreground">2026-09-05 → 2026-10-04 · 7 clientes</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--estado-critico)" }}>
          {money(31_500)}/día parados
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Cliente", "Rubro", "Inv. 30d", "Leads", "CPL", "vs rubro", "vs mes previo", "Formato", "Parado/día", "Próxima acción"].map((h, i) => (
                <th
                  key={h}
                  className={`px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground ${i >= 2 && i <= 8 ? "text-right" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CARTERA.map((f) => (
              <tr key={f.nombre} className="border-b border-border/50 hover:bg-accent/30">
                <td className="px-2 py-1.5">{f.nombre}</td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">{f.rubro}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{f.inv ? money(f.inv) : "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{f.leads || "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{f.cpl != null ? money(f.cpl) : "—"}</td>
                <td className="px-2 py-1.5 text-right"><Delta pct={f.dRubro} /></td>
                <td className="px-2 py-1.5 text-right"><Delta pct={f.dPropio} /></td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">{f.fmt ?? "—"}</td>
                <td
                  className="px-2 py-1.5 text-right tabular-nums"
                  style={f.parado ? { color: "var(--estado-critico)", fontWeight: 600 } : undefined}
                >
                  {f.parado ? money(f.parado) : "—"}
                </td>
                <td className="px-2 py-1.5 text-xs" style={{ color: TONO[f.tono] }}>{f.accion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        El día en curso no se cuenta: los datos de hoy están a medio sincronizar y deformarían las dos ventanas.
      </p>
    </Card>
  );
}

// ── 4. La ficha de decisor, vacía y cargada ──────────────────────────────────

function DecisorDemo({ cargado }: { cargado: boolean }) {
  const campos = [
    ["Quién decide", "Marcelo, dueño — decide él solo"],
    ["Qué le importa", "Leads que cierren, no volumen"],
    ["Qué lo frena", "Le fue mal con otra agencia antes"],
    ["Cómo hablarle", "Directo y con números; odia el palabrerío"],
    ["Canal", "WhatsApp"],
  ];
  return (
    <Card className="max-w-xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-lg bg-primary/15 p-1.5">
          <UserRound className="h-3.5 w-3.5 text-primary" />
        </span>
        <h3 className="text-sm font-semibold">A quién le hablamos</h3>
        <span className="ml-auto text-xs text-muted-foreground">{cargado ? "Editar" : "Cargar"}</span>
      </div>
      {cargado ? (
        <div className="space-y-2 text-sm">
          {campos.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="w-28 shrink-0 text-xs text-muted-foreground">{k}</span>
              <span className="flex-1 leading-snug">{v}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-2 text-xs text-muted-foreground">
          Sin cargar. Todo lo que los agentes escriben para este cliente —copy, planes, reportes— le habla a
          quien decide del otro lado. Mientras esto esté vacío, le hablan a nadie en particular.
        </p>
      )}
    </Card>
  );
}

// ── 5. El resumen de WhatsApp ────────────────────────────────────────────────

function DigestDemo() {
  const texto = `*Resumen de la mañana* — 6 avisos

*sin-publicar* (2)
· MAERS: 3 piezas pasaron su fecha sin publicarse
· TAMARINDO: 1 pieza vencida hace 2 días

*reporte-semanal* (1)
· Desvíos de la semana: 4 clientes por debajo de lo cotizado

*ideas-pendientes* (2)
· DUNOD: 7 ideas esperando revisión
· RENO: 3 ideas esperando revisión

*diversificacion* (1)
· RENO: 88% de los avisos son del mismo formato`;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-4">
        <p className="mb-2 text-xs font-medium" style={{ color: "var(--estado-critico)" }}>
          Interrumpe (nivel 5) — plata o cuenta caída
        </p>
        <div className="rounded-lg bg-muted/50 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {"*⚠️ Vigilante financiero — atención hoy*\n\n• DISTRILLANTAS: saldo por debajo del umbral, la pauta se frena hoy\n• DUNOD: consumo 3× lo normal en 24h\n\n_LMTM-OS · Centro de Inteligencia_"}
        </div>
      </Card>
      <Card className="p-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          No interrumpe (niveles 2-3) — va al resumen 8:00 y 18:00
        </p>
        <div className="rounded-lg bg-muted/50 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {texto}
        </div>
      </Card>
    </div>
  );
}

function Vitrina() {
  return (
    <StoryShell>
      <Section
        eyebrow="2 · El análisis no cruza nada"
        title="Cartera cruzada"
        antes="el análisis existía pero vivía dentro de la ficha de cada cliente, uno por uno. No había forma de ver los 59 juntos."
      >
        <TablaCarteraDemo />
      </Section>

      <Section
        eyebrow="3 · Manda demasiado"
        title="Qué interrumpe y qué va al resumen"
        antes="14 partes del sistema mandaban WhatsApp por su cuenta. Una caída real llegaba igual que un aviso de rutina."
      >
        <DigestDemo />
      </Section>

      <Section
        eyebrow="4 · No hay perfil de decisor"
        title="A quién le hablamos"
        antes="no existía en ningún lado. Los agentes escribían sin saber quién decide del otro lado."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <DecisorDemo cargado={false} />
          <DecisorDemo cargado />
        </div>
      </Section>

    </StoryShell>
  );
}

const meta = {
  title: "LMTM/Mejoras 5-10-26",
  parameters: {
    docs: {
      description: {
        component:
          "Lo que se construyó respondiendo a los dos audios del 4/10/26, con datos de ejemplo. " +
          "Sirve para mirarlo ANTES de subirlo a producción; no reemplaza verlo con datos reales.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Todo: Story = {
  name: "Todo lo nuevo",
  render: () => <Vitrina />,
};
