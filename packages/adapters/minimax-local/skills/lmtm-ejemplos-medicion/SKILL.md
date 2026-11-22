---
name: lmtm-ejemplos-medicion
displayName: Ejemplos de medición, CRM y datos
description: "Cómo se comprueba si algo está medido antes de sacar conclusiones, con tres casos reales anónimos del 22/11/2026: una web sin etiquetas, un panel de CRM que suma lo que no es y una medición de lo que se produce contra lo que se usa. Cargala antes de un diagnóstico de conversión, un análisis de CRM o un cruce de datos."
required: false
---

# Antes de concluir: ¿está medido?

«Cero» puede ser cero, o puede ser que nadie esté contando. La diferencia cambia toda la recomendación.

## Caso 1: la campaña «sin leads» (conversión)
Google gastaba decenas de miles por semana con un lead. La tarea llevaba 13 días abierta.

**Cómo se comprobó, en dos comandos:** bajar el HTML crudo de la página de destino y de la de contacto, y buscar por texto.
```
curl -sL -A "Mozilla/5.0" -o p.html https://sitio/
grep -oE "G-[A-Z0-9]{8,12}|GTM-[A-Z0-9]{5,9}|AW-[0-9]{8,12}|gtag|dataLayer|fbq" p.html | sort | uniq -c
grep -oiE "<form[^>]{0,160}>|wa\.me[^\"' ]*|tel:[^\"' ]*|mailto:[^\"' ]*" p.html
```

**Lo que salió:**
1. Ninguna etiqueta de medición en ninguna de las dos páginas.
2. La página adonde mandaban los anuncios no tenía formulario, ni WhatsApp, ni teléfono.
3. El único formulario enviaba sin página de gracias: aun con Analytics instalado, no se iba a contar solo.

**Cómo se entregó:**
- Qué se verificó y con qué método.
- **La salvedad**: el HTML crudo no muestra etiquetas que se cargan después del aviso de cookies.
- Los pasos en orden, con el fragmento exacto para contar el envío del formulario.
- **Quién puede hacerlo**: si la web no está en el hosting de la agencia, lo hace el cliente o quien le mantiene el sitio; se pide acceso.
- **Cómo se sabe que quedó**: volver a bajar el HTML y encontrar la etiqueta; mandar una consulta de prueba y verla en tiempo real.

**No se propuso pausar.** Sin medición no se decide sobre la pauta: primero se mide.

Antes de mandar algo «al webmaster del cliente», fijate si la web está en el hosting de la agencia. Si está, se hace con `proponer_cambio_web`.

## Caso 2: el panel que suma lo que no es (CRM)
El resumen del CRM decía «11 empresas pagando» y un ingreso mensual.

**Cómo se comprobó:** una segunda lectura, empresa por empresa (`GET /admin/companies`).
- Las 11 tenían la facturación salteada; 7 eran de prueba.
- Todo el uso del mes (conversaciones y respuestas) era de un solo cliente.
- Tres pruebas vencidas seguían figurando «en prueba».

**Cruce con otra fuente:** un cliente recibía decenas de consultas por semana desde la pauta y tenía cero conversaciones en el CRM. Los leads no pasaban por ahí.

Un total de un panel se abre siempre en sus partes antes de citarlo. Y lo que la lectura no alcanza a ver se dice (el tablero de cada empresa necesita un usuario de esa empresa).

## Caso 3: lo que se produce contra lo que se usa (datos)
Una sola consulta, con dos columnas: producido y usado.
- Informes escritos y publicados.
- Tareas abiertas y cuántas llevan más de 7 días quietas.
- Corridas totales, terminadas y cortadas.

**Cómo se escribió el análisis:**
1. La tabla.
2. Qué significa, en tres efectos concretos.
3. **Qué no dice el número** (no mide calidad; lo que falta en la base puede estar pasando por otra vía).
4. Tres preguntas para quien decide.

No trae recomendaciones de proceso: quien analiza los datos no sabe por qué las personas no publican los informes. Pregunta.

## Lo que se repite en los tres
- Un número llamativo se abre en sus partes antes de usarlo.
- Se busca una segunda fuente que lo confirme o lo contradiga.
- Se escribe lo que la medición no ve.
- «No se puede saber con estos datos» es una conclusión válida.
