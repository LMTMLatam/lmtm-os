-- Moneda de cada cuenta de anuncios (7/10).
--
-- ads_insights guarda el gasto en la moneda de la cuenta, y el panel lo
-- mostraba y sumaba como pesos: las dos cuentas de GALA tienen un costo por
-- clic de 0,15 y 0,28, que solo tiene sentido en dólares. Meta y Google
-- informan la moneda en cada lectura de saldo (balance-monitor.ts); el
-- vigilante financiero la guarda acá. NULL = todavía no leída.
--
-- Aditiva: una columna nueva, nullable.
ALTER TABLE "ads_account_mappings" ADD COLUMN IF NOT EXISTS "currency" text;
