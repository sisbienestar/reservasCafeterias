/**
 * El pie institucional.
 *
 * Estaba en las tres páginas del original y se me quedó fuera al pasar a
 * React. No es adorno: en una herramienta interna, decir de quién es y a qué
 * dependencia pertenece es la única atribución que hay.
 *
 * Llevó un enlace a la administración de reservas mientras esa portada era
 * pública: era la única puerta que había y se ofrecía a todo el mundo, porque
 * esconderla a quien no había entrado la habría hecho inalcanzable. Al pasar
 * `/reservas` a exigir sesión, la pantalla ya sabe quién mira, y el enlace se
 * fue a su sitio —junto al título, como en pedidos—. Aquí solo queda la
 * atribución, que es lo que este pie siempre debió ser.
 */

export function Pie() {
  return (
    <footer className="pie">
      <div className="contenedor">
        <p>Bienestar Universitario · Universidad Industrial de Santander</p>
      </div>
    </footer>
  );
}
