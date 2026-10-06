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
