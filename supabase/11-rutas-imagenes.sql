-- reservasCafeterias · las rutas de imagen, solo con el nombre
-- ===========================================================================
--
-- Se ejecuta DESPUÉS de 10-imagenes.sql. Es OPCIONAL: sin él todo funciona
-- igual, porque `MedioTarjeta` acepta las dos formas. Lo que hace es dejar las
-- filas que ya existen escritas como las nuevas, para que no convivan dos
-- maneras de decir lo mismo.
--
-- Antes:  assets/img/camilo-torres.jpg
-- Ahora:  camilo-torres.jpg
--
-- La carpeta la pone la aplicación. Repetir `assets/img/` en cada fila era
-- catorce caracteres iguales en todas ellas, y cada repetición una errata
-- posible en un campo que se teclea a mano desde el panel.

UPDATE cafeteria SET imagen = replace(imagen, 'assets/img/', '') WHERE imagen LIKE 'assets/img/%';
UPDATE modulo    SET imagen = replace(imagen, 'assets/img/', '') WHERE imagen LIKE 'assets/img/%';
UPDATE proveedor SET imagen = replace(imagen, 'assets/img/', '') WHERE imagen LIKE 'assets/img/%';

COMMENT ON COLUMN cafeteria.imagen IS
  'Solo el nombre del archivo, como «camilo-torres.jpg». La carpeta la pone la aplicación. Vacío = la tarjeta usa las iniciales.';

COMMENT ON COLUMN modulo.imagen IS
  'Solo el nombre del archivo, como «pedidos.jpeg». La carpeta la pone la aplicación. Vacío = la tarjeta usa las iniciales.';

COMMENT ON COLUMN proveedor.imagen IS
  'Solo el nombre del archivo, como «nutresa.png». La carpeta la pone la aplicación. Vacío = la tarjeta usa las iniciales.';
