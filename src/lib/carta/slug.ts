/**
 * El nombre del negocio convertido en algo que se pueda escribir en una URL y
 * leer en voz alta: "Sabore Fast Food" → "sabore-fast-food".
 *
 * Va en su propio archivo porque lo usan el servidor (al generar el slug) y el
 * formulario del navegador (al escribirlo a mano).
 */
export function aSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // fuera tildes: café → cafe
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // todo lo demás es separador
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Un slug sirve si no está vacío y no es tan corto que choque con todo. */
export function slugValido(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug);
}
