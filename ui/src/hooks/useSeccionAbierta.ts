import { useCallback, useState } from "react";

/**
 * Recuerda si una sección del sidebar quedó abierta, por navegador.
 *
 * Sin esto, los grupos colapsados se vuelven a cerrar en cada recarga: alguien
 * que vive en "Más" tendría que abrirlo otra vez cada mañana, y el costo de
 * ordenar el sidebar se lo come la fricción de reabrirlo.
 *
 * Es una comodidad por visor, no estado compartido — va en localStorage a
 * propósito. Todos los accesos van en try/catch: en una ventana privada o con
 * las cookies bloqueadas el accessor mismo tira, y el sidebar tiene que
 * renderizar igual con el valor por defecto.
 */
export function useSeccionAbierta(
  clave: string,
  porDefecto: boolean,
): [boolean, (abierto: boolean) => void] {
  const [abierto, setAbierto] = useState<boolean>(() => {
    try {
      const guardado = window.localStorage.getItem(clave);
      return guardado === null ? porDefecto : guardado === "1";
    } catch {
      return porDefecto;
    }
  });

  const cambiar = useCallback(
    (siguiente: boolean) => {
      setAbierto(siguiente);
      try {
        window.localStorage.setItem(clave, siguiente ? "1" : "0");
      } catch {
        /* sin storage la sección sigue funcionando, sólo no se recuerda */
      }
    },
    [clave],
  );

  return [abierto, cambiar];
}
