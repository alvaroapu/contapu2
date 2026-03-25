export const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export function getYears(): number[] {
  const cur = new Date().getFullYear();
  const years: number[] = [];
  for (let y = cur; y >= 2022; y--) years.push(y);
  return years;
}

export const DISTRIBUTOR_ORDER = ['maidhisa', 'azeta', 'almacen', 'colegios'];

export const DIST_NAMES: Record<string, string> = {
  maidhisa: 'Maidhisa',
  azeta: 'Azeta',
  almacen: 'Almacén',
  colegios: 'Colegios y Aytos.',
  idlibros: 'IDlibros',
};
