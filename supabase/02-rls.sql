-- reservasCafeterias · seguridad a nivel de fila
-- ===========================================================================
--
-- LEE ESTO ANTES DE AÑADIR UNA POLÍTICA.
--
-- Supabase publica una API REST automática sobre estas mismas tablas, y la
-- clave `anon` que la abre viaja dentro del JavaScript del navegador: es
-- pública por diseño. Eso quiere decir que cualquiera puede escribir
--
--     curl https://<proyecto>.supabase.co/rest/v1/reserva -H "apikey: <anon>"
--
-- y lo único que decide si sale un JSON con los móviles de todo el campus o
-- una lista vacía es lo que hay en este archivo. RLS no es una capa extra
-- aquí: es LA cerradura.
--
-- Por eso la postura es cerrar del todo. Se activa RLS en todas las tablas y
-- NO se declara ni una sola política permisiva. En Postgres, una tabla con
-- RLS activo y sin políticas no devuelve ni acepta nada: la puerta REST queda
-- tapiada para `anon` y para `authenticated` por igual.
--
-- La única vía de entrada es entonces `api/index.ts`, que corre en Vercel con
-- la clave de servicio —que se salta RLS y NUNCA llega al navegador— y que
-- antes de tocar un dato valida la sesión y mira el rol del perfil. Todas las
-- reglas de negocio viven en un sitio, que es justo lo que pedía CONTRATO.md.
--
-- La consecuencia práctica: si algún día alguien quiere consultar Supabase
-- directamente desde el frontend, NO basta con llamar a supabase.from(...).
-- Hay que escribir aquí la política que lo permita, y pensarla. Ese roce es
-- deliberado.

ALTER TABLE cafeteria       ENABLE ROW LEVEL SECURITY;
ALTER TABLE carta_opcion    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserva         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserva_asiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserva_cambio  ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfil          ENABLE ROW LEVEL SECURITY;

-- FORCE incluye al dueño de la tabla en la comprobación. Sin esto, RLS no se
-- aplica a quien creó las tablas, y una conexión con ese rol —una migración,
-- una consola abierta— tendría paso franco sin que nadie lo hubiera decidido.
ALTER TABLE cafeteria       FORCE ROW LEVEL SECURITY;
ALTER TABLE carta_opcion    FORCE ROW LEVEL SECURITY;
ALTER TABLE reserva         FORCE ROW LEVEL SECURITY;
ALTER TABLE reserva_asiento FORCE ROW LEVEL SECURITY;
ALTER TABLE reserva_cambio  FORCE ROW LEVEL SECURITY;
ALTER TABLE perfil          FORCE ROW LEVEL SECURITY;

-- Y por si alguna vez se añadiera una política por error, se retiran también
-- los permisos de tabla a los dos roles que la API REST usa. Son dos candados
-- independientes: hacen falta los dos para pasar, así que fallar uno no basta.
REVOKE ALL ON cafeteria, carta_opcion, reserva, reserva_asiento,
              reserva_cambio, perfil
  FROM anon, authenticated;

-- Las tablas del módulo de pedidos NO están en las listas de arriba: nacieron
-- después y se cierran en su propio archivo, 05-pedidos.sql, al final. Si
-- añades una tabla, ciérrala donde la creas — una tabla nueva sin RLS es una
-- tabla pública, y aquí ya no se vería que falta.

-- Las funciones de 03-funciones.sql tampoco se exponen por REST: se invocan
-- desde la API con la clave de servicio. `crear_reserva` sin comprobar el rol
-- de quien llama sería un agujero exactamente igual de grande.
