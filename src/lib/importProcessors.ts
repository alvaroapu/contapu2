import * as XLSX from 'xlsx';
import { normalizeIsbn, normalizeText } from './isbnUtils';
import { supabase } from '@/integrations/supabase/client';

export interface ParsedRow {
  isbn?: string;
  ean?: string;
  reference?: string;
  title: string;
  entradas: number;
  ventas: number;
  devoluciones: number;
}

export interface MatchedEntry {
  bookId: string;
  bookTitle: string;
  isbn?: string;
  reference?: string;
  movements: { type: 'envio' | 'venta' | 'devolucion'; quantity: number }[];
}

export interface UnmatchedEntry {
  isbn?: string;
  ean?: string;
  reference?: string;
  title: string;
  entradas: number;
  ventas: number;
  devoluciones: number;
  status: 'pending' | 'assigned' | 'ignored';
  assignedBookId?: string;
}

export interface ImportMatchResult {
  matched: MatchedEntry[];
  unmatched: UnmatchedEntry[];
}

function findCol(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const idx = headers.findIndex(h => normalizeText(h).includes(normalizeText(name)));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseAzetaFile(wb: XLSX.WorkBook): ParsedRow[] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (raw.length < 2) return [];

  const headers = raw[0].map(String);
  const cIsbn = findCol(headers, 'isbn');
  const cEan = findCol(headers, 'ean');
  const cTitle = findCol(headers, 'titulo', 'title');
  const cEntradas = findCol(headers, 'entradas');
  const cVentas = findCol(headers, 'ventas clientes', 'ventas_clientes');
  const cAbonos = findCol(headers, 'abonos clientes', 'abonos_clientes');

  const rows: ParsedRow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r) continue;
    const isbn = r[cIsbn] ? String(r[cIsbn]).trim() : '';
    if (!isbn || !isbn.startsWith('978')) continue;

    rows.push({
      isbn: isbn,
      ean: cEan >= 0 && r[cEan] ? String(r[cEan]).trim() : undefined,
      title: cTitle >= 0 && r[cTitle] ? String(r[cTitle]).trim() : '',
      entradas: Math.max(0, parseInt(r[cEntradas]) || 0),
      ventas: Math.max(0, parseInt(r[cVentas]) || 0),
      devoluciones: Math.max(0, parseInt(r[cAbonos]) || 0),
    });
  }
  return rows;
}

export function parseMaidhisaFile(wb: XLSX.WorkBook): ParsedRow[] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (raw.length < 2) return [];

  const headers = raw[0].map(String);
  const cRef = findCol(headers, 'referencia', 'ref');
  const cTitle = findCol(headers, 'titulo', 'title', 'título');
  const cEjLiq = findCol(headers, 'ej a liq', 'ej_a_liq', 'ejemplares');

  const rows: ParsedRow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r) continue;
    const ref = r[cRef] ? String(r[cRef]).trim() : '';
    if (!ref || !ref.startsWith('235AE')) continue;

    const ejLiq = parseInt(r[cEjLiq]) || 0;
    rows.push({
      reference: ref,
      title: cTitle >= 0 && r[cTitle] ? String(r[cTitle]).trim() : '',
      entradas: 0,
      ventas: Math.max(0, ejLiq),
      devoluciones: Math.max(0, -ejLiq),
    });
  }
  return rows;
}

async function fetchAllBooks() {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('books')
      .select('id, isbn, ean, title, maidhisa_ref')
      .range(from, from + 999) as any;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

export async function matchAzeta(rows: ParsedRow[]): Promise<ImportMatchResult> {
  const allBooks = await fetchAllBooks();
  const isbnMap = new Map<string, any>();
  const eanMap = new Map<string, any>();
  for (const b of allBooks) {
    if (b.isbn) isbnMap.set(normalizeIsbn(b.isbn), b);
    if (b.ean) eanMap.set(String(b.ean), b);
  }

  const matched: MatchedEntry[] = [];
  const unmatched: UnmatchedEntry[] = [];

  for (const row of rows) {
    let book = row.isbn ? isbnMap.get(normalizeIsbn(row.isbn)) : null;
    if (!book && row.ean) book = eanMap.get(row.ean);

    const movements: MatchedEntry['movements'] = [];
    if (row.entradas > 0) movements.push({ type: 'envio', quantity: row.entradas });
    if (row.ventas > 0) movements.push({ type: 'venta', quantity: row.ventas });
    if (row.devoluciones > 0) movements.push({ type: 'devolucion', quantity: row.devoluciones });
    if (movements.length === 0) continue;

    if (book) {
      matched.push({ bookId: book.id, bookTitle: book.title, isbn: row.isbn, movements });
    } else {
      unmatched.push({ isbn: row.isbn, ean: row.ean, title: row.title, entradas: row.entradas, ventas: row.ventas, devoluciones: row.devoluciones, status: 'pending' });
    }
  }
  return { matched, unmatched };
}

export function parseOnlineFile(wb: XLSX.WorkBook): ParsedRow[] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (raw.length < 4) return [];

  // Find the ISBN column and VENTAS ONLINE column by scanning header rows
  // Row 1 has group headers (TÍTULO, ANUAL, months, ISBN)
  // Row 2 has sub-headers (ENVÍOS, VENTAS, etc., VENTAS ONLINE)
  let cIsbn = -1;
  let cVentasOnline = -1;
  const cTitle = 0; // Column A is always title

  // Scan row 1 (index 0) for ISBN column
  if (raw[0]) {
    for (let c = 0; c < raw[0].length; c++) {
      if (raw[0][c] && normalizeText(String(raw[0][c])).includes('isbn')) {
        cIsbn = c;
      }
    }
  }
  // Scan row 2 (index 1) for VENTAS ONLINE column
  if (raw[1]) {
    for (let c = 0; c < raw[1].length; c++) {
      if (raw[1][c] && normalizeText(String(raw[1][c])).includes('ventas online')) {
        cVentasOnline = c;
      }
    }
  }

  if (cIsbn < 0 || cVentasOnline < 0) return [];

  const rows: ParsedRow[] = [];
  // Books start at row 3 (index 2+), every ~4 rows is a book but just check for ISBN presence
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if (!r) continue;
    const isbnRaw = r[cIsbn] ? String(r[cIsbn]).trim() : '';
    if (!isbnRaw || !normalizeIsbn(isbnRaw).startsWith('978')) continue;

    const ventas = parseInt(r[cVentasOnline]) || 0;
    if (ventas === 0) continue;

    const title = r[cTitle] ? String(r[cTitle]).trim() : '';
    rows.push({
      isbn: isbnRaw,
      title,
      entradas: 0,
      ventas: Math.max(0, ventas),
      devoluciones: Math.max(0, -ventas),
    });
  }
  return rows;
}

export async function matchOnline(rows: ParsedRow[]): Promise<ImportMatchResult> {
  const allBooks = await fetchAllBooks();
  const isbnMap = new Map<string, any>();
  for (const b of allBooks) {
    if (b.isbn) isbnMap.set(normalizeIsbn(b.isbn), b);
  }

  const matched: MatchedEntry[] = [];
  const unmatched: UnmatchedEntry[] = [];

  for (const row of rows) {
    const book = row.isbn ? isbnMap.get(normalizeIsbn(row.isbn)) : null;

    const movements: MatchedEntry['movements'] = [];
    if (row.ventas > 0) movements.push({ type: 'venta', quantity: row.ventas });
    if (row.devoluciones > 0) movements.push({ type: 'devolucion', quantity: row.devoluciones });
    if (movements.length === 0) continue;

    if (book) {
      matched.push({ bookId: book.id, bookTitle: book.title, isbn: row.isbn, movements });
    } else {
      unmatched.push({ isbn: row.isbn, title: row.title, entradas: 0, ventas: row.ventas, devoluciones: row.devoluciones, status: 'pending' });
    }
  }
  return { matched, unmatched };
}

export async function matchMaidhisa(rows: ParsedRow[]): Promise<ImportMatchResult> {
  const allBooks = await fetchAllBooks();
  const refMap = new Map<string, any>();
  for (const b of allBooks) {
    if (b.maidhisa_ref) refMap.set(b.maidhisa_ref, b);
  }

  const matched: MatchedEntry[] = [];
  const unmatched: UnmatchedEntry[] = [];

  for (const row of rows) {
    let book = row.reference ? refMap.get(row.reference) : null;

    if (!book && row.title) {
      const normTitle = normalizeText(row.title);
      const exactMatches = allBooks.filter(b => normalizeText(b.title) === normTitle);
      if (exactMatches.length === 1) {
        book = exactMatches[0];
      } else if (exactMatches.length === 0) {
        const partialMatches = allBooks.filter(b => {
          const nb = normalizeText(b.title);
          return nb.includes(normTitle) || normTitle.includes(nb);
        });
        if (partialMatches.length === 1) book = partialMatches[0];
      }
      if (book && row.reference) {
        await supabase.from('books').update({ maidhisa_ref: row.reference } as any).eq('id', book.id);
      }
    }

    const movements: MatchedEntry['movements'] = [];
    if (row.ventas > 0) movements.push({ type: 'venta', quantity: row.ventas });
    if (row.devoluciones > 0) movements.push({ type: 'devolucion', quantity: row.devoluciones });
    if (movements.length === 0) continue;

    if (book) {
      matched.push({ bookId: book.id, bookTitle: book.title, reference: row.reference, movements });
    } else {
      unmatched.push({ reference: row.reference, title: row.title, entradas: 0, ventas: row.ventas, devoluciones: row.devoluciones, status: 'pending' });
    }
  }
  return { matched, unmatched };
}
