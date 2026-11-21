async function cargarRecursos(select) {
  const response = await fetch('/api/recursos');
  if (!response.ok) throw new Error('No se pudo consultar el catálogo de recursos.');
  const resources = await response.json();
  if (!resources.length) throw new Error('El catálogo de recursos aún está vacío.');

  for (const resource of resources) {
    select.add(new Option(resource.nombre + ' (' + resource.unidad_medida + ')', resource.id_recurso));
  }
}
