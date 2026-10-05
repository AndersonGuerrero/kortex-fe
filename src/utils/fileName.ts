/**
 * Devuelve el nombre de archivo del último segmento de la ruta de `url`,
 * ignorando el query string y el fragmento. Acepta URLs absolutas (p. ej.
 * firmadas de R2, cuyos parámetros codifican `/` como `%2F`) y relativas.
 * Devuelve `undefined` si la ruta no termina en un nombre de archivo.
 */
export function fileNameFromUrl(url: string): string | undefined {
  if (!url) return undefined;
  const { pathname } = new URL(url, 'http://localhost');
  const lastSegment = pathname.split('/').pop();
  return lastSegment ? decodeURIComponent(lastSegment) : undefined;
}
