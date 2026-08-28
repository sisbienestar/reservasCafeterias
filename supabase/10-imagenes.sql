-- reservasCafeterias · imagen en módulos y proveedores
-- ===========================================================================
--
-- Se ejecuta DESPUÉS de 09-admin-general.sql.
--
-- Las cafeterías ya tenían `cafeteria.imagen` desde el prototipo, y su tarjeta
-- la pinta con las iniciales de reserva si el archivo falta o no carga. Los
-- módulos y los proveedores no la tenían: sus tarjetas solo sabían enseñar
-- letras.
--
-- La ruta va en la BASE y no en un mapa dentro del código a propósito. Es la
-- misma decisión que en cafeterías, y ahora pesa más porque hay panel: cambiar
-- la foto de un proveedor no debería costar un despliegue.

ALTER TABLE modulo    ADD COLUMN IF NOT EXISTS imagen TEXT NOT NULL DEFAULT '';
ALTER TABLE proveedor ADD COLUMN IF NOT EXISTS imagen TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN modulo.imagen IS
  'Solo el nombre del archivo, como «pedidos.jpeg». La carpeta la pone la aplicación. Vacío = la tarjeta usa las iniciales.';

COMMENT ON COLUMN proveedor.imagen IS
  'Solo el nombre del archivo, como «nutresa.png». La carpeta la pone la aplicación. Vacío = la tarjeta usa las iniciales.';

/*
 * No se siembra ninguna ruta.
 *
 * Una ruta apuntando a un archivo que no está haría que cada tarjeta pidiera
 * una imagen inexistente, recibiera un 404 y recayera en las iniciales: el
 * mismo resultado visual que dejarlo vacío, pero con un viaje de red por
 * tarjeta y un error en la consola. Vacío es más honesto y más barato.
 *
 * Se rellena desde el panel según se vayan teniendo los archivos.
 */
