# Caste Garden Shed

Aplicacion web estatica para gestionar el material del almacen: busqueda, filtros por stock, tipos de material y estanterias.

## Uso

Abrir `index.html` o publicar la carpeta completa en GitHub Pages.

Los datos iniciales estan en `data.json`. Si Supabase no esta configurado, los cambios se guardan solo en el navegador del dispositivo.

## Base de datos

1. Crear un proyecto en Supabase.
2. Abrir el editor SQL de Supabase y ejecutar el contenido de `supabase-schema.sql`.
3. Copiar la URL del proyecto y la clave publica anon en `supabase-config.js`.
4. Publicar los cambios en GitHub Pages.

Cuando la tabla remota este vacia, la app subira automaticamente los materiales guardados en el navegador o los datos iniciales de `data.json`.

Nota: esta primera configuracion permite lectura y escritura publica desde la web. Para un almacen privado conviene anadir acceso con usuario o clave compartida.
