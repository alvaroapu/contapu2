function parseDateValue(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value).trim())) {
    const serial = typeof value === 'number' ? value : Number(value);
    if (!Number.isNaN(serial) && serial > 0) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      const date = new Date(excelEpoch + serial * 24 * 60 * 60 * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  const trimmed = String(value).trim();
  const esMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (esMatch) {
    const [, day, month, year] = esMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

export function formatDate(date: string | number | null | undefined): string {
  const parsed = parseDateValue(date);
  if (!parsed) return '—';

  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  out_of_print: 'Fuera de impresión',
};
