// LMTM: «esta página no existe», con el tema de la app (antes era el «Page not found» de paperclip, en inglés).
import { Link, useLocation } from "@/lib/router";
import { Tecla } from "../lmtm/Comandos";

export function NoExiste() {
  const { pathname } = useLocation();
  return (
    <div className="max-w-[560px] py-10">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Esta página no existe</h1>
      <p className="mt-2 text-[14px] text-l-tinta-2">
        La dirección <code className="rounded bg-l-sup px-1.5 py-0.5 text-[13px]">{pathname}</code> no lleva a ninguna pantalla. Puede ser un link viejo.
      </p>
      <p className="mt-2 text-[14px] text-l-tinta-2">
        Buscá lo que querías con <Tecla>Ctrl K</Tecla> o volvé al inicio.
      </p>
      <Link to="/hoy" className="mt-5 inline-flex min-h-11 items-center rounded-[12px] bg-[image:var(--l-marca-grad)] px-4 text-[14px] font-semibold text-l-marca-tinta">
        Ir a Hoy
      </Link>
    </div>
  );
}
