export function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[-\s']/g, '').trim();
}

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿¡]/g, '')
    .trim();
}
