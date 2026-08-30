import '../../../supabase/websocketDeNode.mjs';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await db.from('producto').select('id,proveedor_id,orden,codigo,nombre,categoria,unidad_medida').order('proveedor_id').order('orden');
fs.writeFileSync('data/pedidos-historicos/carga/catalogo-actual.json', JSON.stringify(data,null,1));
console.log('productos en la base:', data.length);
for (const p of ['cocacola','vicky','almacen-colombina']) {
  console.log('\n=== '+p+' ===');
  data.filter(x=>x.proveedor_id===p).forEach(x=>console.log('  ',String(x.orden).padStart(3), x.nombre, '·', x.unidad_medida, x.categoria?'· '+x.categoria:''));
}
