import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, FileText, CheckCircle, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PageBreadcrumb } from '@/components/PageBreadcrumb';
import { EditableCell } from '@/components/ventas/EditableCell';
import {
  useLiquidation, useLiquidationItems, useLiquidationAuthors,
  useFinalizeLiquidation, useDeleteLiquidation, useUpdateLiquidationItem,
  calculateLiquidationItems,
  type LiquidationItem,
} from '@/hooks/useLiquidations';
import { formatCurrency, formatDate } from '@/lib/format';
import { useDebounce } from '@/hooks/useDebounce';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { downloadAuthorDOCX, generateAuthorDOCX } from '@/components/liquidaciones/LiquidacionDOCX';
import { exportLiquidationExcel } from '@/components/liquidaciones/LiquidacionExcel';
import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';

export default function LiquidacionDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: liq, isLoading: liqLoading } = useLiquidation(id!);
  const [search, setSearch] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [onlyWithSales, setOnlyWithSales] = useState(true);
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounce(search, 300);
  const { data: items, isLoading: itemsLoading } = useLiquidationItems(id!, debouncedSearch, authorFilter, onlyWithSales, page);
  const { data: authors } = useLiquidationAuthors(id!);
  const finalize = useFinalizeLiquidation();
  const deleteMut = useDeleteLiquidation();
  const updateItem = useUpdateLiquidationItem();
  const [confirmAction, setConfirmAction] = useState<'finalize' | 'recalculate' | 'delete' | null>(null);
  const [genAllLoading, setGenAllLoading] = useState(false);

  const totalAuthors = items?.[0]?.total_authors ?? 0;
  const isDraft = liq?.status === 'draft';

  // Group items by author for display
  const grouped = useMemo(() => {
    if (!items) return [];
    const map = new Map<string, LiquidationItem[]>();
    for (const item of items) {
      const list = map.get(item.author) ?? [];
      list.push(item);
      map.set(item.author, list);
    }
    return [...map.entries()].map(([author, books]) => ({ author, books }));
  }, [items]);

  // Summary
  const summary = useMemo(() => {
    if (!items) return { authors: 0, books: 0, units: 0, total: 0 };
    
    return {
      authors: Number(totalAuthors),
      books: items.length,
      units: items.reduce((s, i) => s + i.distributor_units + i.online_units + i.school_units, 0),
      total: items.reduce((s, i) => s + i.total_amount, 0),
    };
  }, [items, totalAuthors]);

  const handleRecalculate = async () => {
    if (!liq) return;
    try {
      await calculateLiquidationItems(liq.id, {
        year: liq.year,
        distributor_royalty_pct: liq.distributor_royalty_pct,
        online_royalty_pct: liq.online_royalty_pct,
        school_royalty_pct: liq.school_royalty_pct,
      });
      qc.invalidateQueries({ queryKey: ['liquidation-items'] });
      qc.invalidateQueries({ queryKey: ['liquidation-authors'] });
      toast.success('Liquidación recalculada');
    } catch (e: any) {
      toast.error(e.message);
    }
    setConfirmAction(null);
  };

  const handleFinalize = () => {
    if (liq) finalize.mutate(liq.id);
    setConfirmAction(null);
  };

  const handleDelete = () => {
    if (liq) {
      deleteMut.mutate(liq.id);
      navigate('/liquidaciones');
    }
    setConfirmAction(null);
  };

  const handleExportExcel = async () => {
    if (!liq) return;
    // Fetch ALL items for export
    const allItems = await fetchAllLiquidationItems(liq.id);
    exportLiquidationExcel(allItems, liq);
  };

  const handleGenerateAllDOCX = async () => {
    if (!liq) return;
    setGenAllLoading(true);
    try {
      const allItems = await fetchAllLiquidationItems(liq.id);
      const authorsSet = [...new Set(allItems.map(i => i.author))].sort();
      const zip = new JSZip();
      for (const author of authorsSet) {
        const blob = await generateAuthorDOCX(author, allItems, liq);
        zip.file(`Liquidacion_${liq.year}_${author.replace(/\s+/g, '_')}.docx`, blob);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Liquidaciones_${liq.year}_DOCX.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${authorsSet.length} documentos generados`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setGenAllLoading(false);
  };

  const handleDownloadAuthorDOCX = async (author: string) => {
    if (!liq) return;
    const allItems = await fetchAllLiquidationItems(liq.id);
    downloadAuthorDOCX(author, allItems, liq);
  };

  if (liqLoading) return <div className="space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (!liq) return <p>Liquidación no encontrada</p>;

  return (
    <div>
      <PageBreadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Liquidaciones', href: '/liquidaciones' },
        { label: `Liquidación ${liq.year}` },
      ]} />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/liquidaciones')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Liquidación {liq.year}</h1>
          <Badge variant={isDraft ? 'secondary' : 'default'}
            className={isDraft ? 'bg-yellow-500 text-black' : 'bg-green-600'}>
            {isDraft ? 'Borrador' : 'Finalizada'}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <>
              <Button variant="outline" size="sm" onClick={() => setConfirmAction('recalculate')}>
                <RefreshCw className="mr-1 h-4 w-4" /> Recalcular
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmAction('finalize')}>
                <CheckCircle className="mr-1 h-4 w-4" /> Finalizar
              </Button>
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmAction('delete')}>
                <Trash2 className="mr-1 h-4 w-4" /> Eliminar
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleGenerateAllDOCX} disabled={genAllLoading}>
            {genAllLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
            Todos los informes
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="text-sm text-muted-foreground mb-4 space-x-4">
        <span>Creada: {formatDate(liq.created_at)}</span>
        {liq.finalized_at && <span>Finalizada: {formatDate(liq.finalized_at)}</span>}
        <Tooltip>
          <TooltipTrigger><span>Dist: {liq.distributor_royalty_pct}%</span></TooltipTrigger>
          <TooltipContent>Porcentaje sobre PVP para ventas por distribuidoras</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger><span>Online: {liq.online_royalty_pct}%</span></TooltipTrigger>
          <TooltipContent>Porcentaje sobre PVP para ventas online</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger><span>Colegios: {liq.school_royalty_pct}%</span></TooltipTrigger>
          <TooltipContent>Porcentaje sobre PVP para ventas a colegios/aytos.</TooltipContent>
        </Tooltip>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Autores</p><p className="text-2xl font-bold">{summary.authors}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Libros</p><p className="text-2xl font-bold">{summary.books}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Unidades</p><p className="text-2xl font-bold">{summary.units}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total a liquidar</p><p className="text-2xl font-bold">{formatCurrency(summary.total)}</p></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input placeholder="Buscar por título o autor..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <div className="w-48">
          <Select value={authorFilter} onValueChange={v => { setAuthorFilter(v === '__all__' ? '' : v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="Todos los autores" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los autores</SelectItem>
              {authors?.map((a: string) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={onlyWithSales} onCheckedChange={v => { setOnlyWithSales(v); setPage(0); }} />
          <Label className="text-sm">Solo con ventas</Label>
        </div>
      </div>

      {/* Table */}
      {itemsLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : !grouped.length ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mb-3" />
          <p>No se encontraron resultados.</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Autor</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Fecha pub.</TableHead>
                <TableHead className="text-right">Dist. Uds</TableHead>
                <TableHead className="text-right">Dist. €</TableHead>
                <TableHead className="text-right">Online Uds</TableHead>
                <TableHead className="text-right">Online €</TableHead>
                <TableHead className="text-right">Col. Uds</TableHead>
                <TableHead className="text-right">Col. €</TableHead>
                <TableHead className="text-right">Total €</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(({ author, books }) => {
                const subtotal = books.reduce(
                  (acc, i) => ({
                    dU: acc.dU + i.distributor_units, dA: acc.dA + i.distributor_amount,
                    oU: acc.oU + i.online_units, oA: acc.oA + i.online_amount,
                    sU: acc.sU + i.school_units, sA: acc.sA + i.school_amount,
                    t: acc.t + i.total_amount,
                  }),
                  { dU: 0, dA: 0, oU: 0, oA: 0, sU: 0, sA: 0, t: 0 }
                );
                return (
                  <>
                    {books.map((item, idx) => (
                      <TableRow key={item.item_id}>
                        <TableCell className="font-medium">{idx === 0 ? author : ''}</TableCell>
                        <TableCell>{item.book_title}</TableCell>
                        <TableCell>{formatDate(item.publication_date)}</TableCell>
                        <TableCell className="text-right">
                          {isDraft ? (
                            <EditableCell
                              value={item.distributor_units}
                              onSave={(v) => updateItem.mutate({
                                itemId: item.item_id, field: 'distributor_units', value: v,
                                pvp: item.pvp, currentItem: item, liquidation: liq!,
                              })}
                            />
                          ) : item.distributor_units}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(item.distributor_amount)}</TableCell>
                        <TableCell className="text-right">
                          {isDraft ? (
                            <EditableCell
                              value={item.online_units}
                              onSave={(v) => updateItem.mutate({
                                itemId: item.item_id, field: 'online_units', value: v,
                                pvp: item.pvp, currentItem: item, liquidation: liq!,
                              })}
                            />
                          ) : item.online_units}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(item.online_amount)}</TableCell>
                        <TableCell className="text-right">
                          {isDraft ? (
                            <EditableCell
                              value={item.school_units}
                              onSave={(v) => updateItem.mutate({
                                itemId: item.item_id, field: 'school_units', value: v,
                                pvp: item.pvp, currentItem: item, liquidation: liq!,
                              })}
                            />
                          ) : item.school_units}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(item.school_amount)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.total_amount)}</TableCell>
                        <TableCell>
                          {idx === 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleDownloadAuthorPDF(author)}>
                                  <Download className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Descargar PDF del autor</TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Subtotal row */}
                    <TableRow className="bg-muted/50 font-medium">
                      <TableCell>Subtotal {author}</TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right">{subtotal.dU}</TableCell>
                      <TableCell className="text-right">{formatCurrency(subtotal.dA)}</TableCell>
                      <TableCell className="text-right">{subtotal.oU}</TableCell>
                      <TableCell className="text-right">{formatCurrency(subtotal.oA)}</TableCell>
                      <TableCell className="text-right">{subtotal.sU}</TableCell>
                      <TableCell className="text-right">{formatCurrency(subtotal.sA)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(subtotal.t)}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalAuthors > 20 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="text-sm self-center">Página {page + 1} de {Math.ceil(totalAuthors / 20)}</span>
          <Button variant="outline" size="sm" disabled={(page + 1) * 20 >= totalAuthors} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
        </div>
      )}

      {/* Confirm dialogs */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'finalize' && '¿Finalizar liquidación?'}
              {confirmAction === 'recalculate' && '¿Recalcular liquidación?'}
              {confirmAction === 'delete' && '¿Eliminar liquidación?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'finalize' && 'Una vez finalizada, la liquidación no se podrá editar.'}
              {confirmAction === 'recalculate' && 'Esto sobreescribirá cualquier ajuste manual. ¿Continuar?'}
              {confirmAction === 'delete' && 'Se eliminarán todos los datos. Esta acción no se puede deshacer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmAction === 'finalize') handleFinalize();
              else if (confirmAction === 'recalculate') handleRecalculate();
              else if (confirmAction === 'delete') handleDelete();
            }}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

async function fetchAllLiquidationItems(liquidationId: string): Promise<LiquidationItem[]> {
  let all: LiquidationItem[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await (supabase as any).rpc('get_liquidation_items_page', {
      p_liquidation_id: liquidationId,
      p_search: '',
      p_author_filter: '',
      p_only_with_sales: true,
      p_limit: 500,
      p_offset: offset,
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    // Check if we got all authors
    const totalAuthors = data[0]?.total_authors ?? 0;
    const uniqueAuthors = new Set(all.map((i: LiquidationItem) => i.author)).size;
    if (uniqueAuthors >= totalAuthors) break;
    offset += 500;
  }
  return all;
}
