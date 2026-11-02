# Comment-gate por cliente: propuesta, NO implementado

«Comentá X y te lo mando por DM». **No se prende nada sin OK explícito de Naza, cliente por cliente:** le habla a los
clientes del cliente. Hoy no hay código, webhook ni permiso activado para esto.

La evidencia es de una sola cuenta ajena (carrusel de ~27k seguidores) y de nuestra propia cuenta chica: es una hipótesis a
medir por cliente. La palabra clave sale en el cierre; el dato a mirar es cuántos comentarios la traen y cuántos terminan
en una consulta real.

## Cómo sería

1. **En la pieza:** `cierre.palabra` en `guion.json`. El cierre dice «Comentá FICHA y te la mando por DM». Solo en
   Instagram; en Facebook, LinkedIn y YouTube el mismo reel lleva el link, porque ahí la promesa no se cumple.
2. **En el cliente:** `clients.metadata.commentGate = { palabra, entrega, destino, activo: false }`, apagado por defecto.
   `entrega` es lo que se manda, y tiene que existir de verdad antes de publicar: nada inventado.
3. **El flujo:**
   - Webhook `comments` de Instagram, con la app de Meta de LMTM.
   - Si el comentario trae la palabra (sin acentos ni mayúsculas), va una respuesta privada al que comentó: una sola, y
     dentro de los 7 días que da Meta.
   - Se responde en público un mensaje corto.
   - **Se ignoran los comentarios de la propia cuenta:** si no, se arma un loop.
   - Un tope por hora y por cliente, y registro de cada envío.
4. **El destino:**
   - Con CRM de LMTM y canal conectado: se abre la conversación ahí, etiquetada con la pieza.
   - Sin CRM: el DM queda en la bandeja de Instagram y lo sigue el equipo.

## Lo que falta verificar antes de prometerlo

- Que la app de Meta tenga `instagram_manage_comments` e `instagram_manage_messages` aprobados para estas cuentas.
- Que cada cliente tenga algo real para mandar y alguien que siga la conversación.
- Que no choque con el agente del CRM del cliente, si tiene uno prendido.

## Por cliente

Estado del CRM leído el 02/11 (`/admin/companies`). Instagram: posteos sincronizados en los últimos 180 días.
Las palabras y entregas son **propuestas para validar con cada cliente**: ninguna está confirmada.

| Cliente | Instagram | CRM | Palabra | Qué se manda | Destino |
|---|---|---|---|---|---|
| SKYGARDEN | 47 | 3 canales | FICHA | ficha del desarrollo | CRM |
| COSA PROPIEDADES | 28 | 1 canal | FICHA | ficha de la propiedad del reel | CRM |
| MUNDO INFLABLE | 57 | 1 canal | FECHA | disponibilidad y cómo reservar | CRM |
| DUNOD | 0 | 1 canal | no sirve hasta sincronizar su Instagram | | |
| SEBASTIAN RAMASCO PADILLA | 119 | sin canal | FICHA | ficha de la propiedad | conectar el canal primero, o bandeja de IG |
| MAERS | 53 | sin canal | MEDIDAS | guía de medidas o catálogo, si existe | conectar el canal primero, o bandeja de IG |
| RENO | 0 | sin canal | MEDIDA | cómo pedir presupuesto | no sirve hasta sincronizar su Instagram y conectar el canal |
| MA PROPIEDADES, IMPERIA, PRONE, GALA, BRISANOVA | 36 a 137 | no | FICHA | ficha de la propiedad | bandeja de IG |
| El Hiper de la Pelu | 72 | no | COLOR | carta de colores del producto, si existe | bandeja de IG |
| BOERO, BRACHETTA, SERRAT | 30 a 68 | no | TURNO | cómo sacar turno | bandeja de IG |
| Distrillantas | 40 | no | MEDIDA | cómo saber la medida | bandeja de IG |
| GRUPO ROIBAS | 48 | no | ESCAPADA | tarifas o paquetes vigentes | bandeja de IG |
| DOMINGO BISIO, PKT GLOBAL | 45 y 47 | no | FICHA | ficha técnica | bandeja de IG |
| TAMARINDO | 45 | no | FECHA | disponibilidad | bandeja de IG |
| HANSHI, Ikigai | 41 y 33 | no | a definir con el cliente | | bandeja de IG |

El resto de los clientes activos no tiene Instagram sincronizado: sin eso no se puede medir ni vale prometer el DM.

## Por dónde empezaría

Un solo cliente con CRM, canal conectado y una entrega ya hecha: **COSA PROPIEDADES** (formato «FICHA» con una propiedad real).
Medir un mes contra sus otros reels, con el índice contra lo normal de su cuenta. Si no mueve la aguja, no se sigue.
