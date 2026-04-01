import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, FileText, CheckCircle, RefreshCw, Trash2, Loader2, Mail } from 'lucide-react';
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
  useLiquidation, useLiquidationItems, useLiquidationAuthors, useLiquidationTotals,
  useFinalizeLiquidation, useDeleteLiquidation, useUpdateLiquidationItem,
  calculateLiquidationItems,
  type LiquidationItem,
} from '@/hooks/useLiquidations';
import { formatCurrency, formatDate } from '@/lib/format';
import { useDebounce } from '@/hooks/useDebounce';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { downloadAuthorPDF, generateAuthorDOCX, convertDocxToPdf } from '@/components/liquidaciones/LiquidacionDOCX';
import { exportLiquidationExcel } from '@/components/liquidaciones/LiquidacionExcel';
import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { SendEmailsDialog } from '@/components/liquidaciones/SendEmailsDialog';

export default function LiquidacionDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: liq, isLoading: liqLoading } = useLiquidation(id!);
  const [search, setSearch] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [onlyWithSales, setOnlyWithSales] = useState(false);
  const [hideNegatives, setHideNegatives] = useState(false);
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounce(search, 300);
  const { data: items, isLoading: itemsLoading } = useLiquidationItems(id!, debouncedSearch, authorFilter, onlyWithSales, page);
  const { data: authors } = useLiquidationAuthors(id!);
  const { data: globalTotals } = useLiquidationTotals(id!);
  const finalize = useFinalizeLiquidation();
  const deleteMut = useDeleteLiquidation();
  const updateItem = useUpdateLiquidationItem();
  const [confirmAction, setConfirmAction] = useState<'finalize' | 'recalculate' | 'delete' | null>(null);
  const [genAllLoading, setGenAllLoading] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailItems, setEmailItems] = useState<LiquidationItem[]>([]);

  const totalAuthors = items?.[0]?.total_authors ?? 0;
  const isDraft = liq?.status === 'draft';

  // Group items by author for display
  const grouped = useMemo(() => {
    if (!items) return [];
    const filtered = hideNegatives ? items.filter(i => i.total_amount >= 0) : items;
    const map = new Map<string, LiquidationItem[]>();
    for (const item of filtered) {
      const list = map.get(item.author) ?? [];
      list.push(item);
      map.set(item.author, list);
    }
    return [...map.entries()].map(([author, books]) => ({ author, books }));
  }, [items, hideNegatives]);

  // Summary
  const summary = useMemo(() => {
    return {
      authors: globalTotals?.authors ?? 0,
      books: globalTotals?.books ?? 0,
      units: globalTotals?.units ?? 0,
      total: globalTotals?.totalPositive ?? 0,
    };
  }, [globalTotals]);

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
      qc.invalidateQueries({ queryKey: ['liquidation-totals'] });
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

  const handleGenerateAllPDF = async () => {
    if (!liq) return;
    setGenAllLoading(true);
    try {
      const allItems = await fetchAllLiquidationItems(liq.id);
      const authorsSet = [...new Set(allItems.map(i => i.author))].sort();
      const zip = new JSZip();
      const BATCH_SIZE = 10;
      const BATCH_DELAY_MS = 500;

      for (let i = 0; i < authorsSet.length; i += BATCH_SIZE) {
        const batch = authorsSet.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(async (author) => {
          const docxBlob = await generateAuthorDOCX(author, allItems, liq);
          const { pdfBlob, pdfFileName } = await convertDocxToPdf(docxBlob, author, liq.year);
          return { pdfBlob, pdfFileName };
        }));
        for (const { pdfBlob, pdfFileName } of results) {
          zip.file(pdfFileName, pdfBlob);
        }
        if (i + BATCH_SIZE < authorsSet.length) {
          await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Liquidaciones_${liq.year}_PDF.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${authorsSet.length} documentos PDF generados`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setGenAllLoading(false);
  };

  const handleDownloadAuthorPDF = async (author: string) => {
    if (!liq) return;
    try {
      const allItems = await fetchAllLiquidationItems(liq.id);
      await downloadAuthorPDF(author, allItems, liq);
    } catch (e: any) {
      toast.error(`Error al generar PDF: ${e.message}`);
    }
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
          <Button variant="outline" size="sm" onClick={handleGenerateAllPDF} disabled={genAllLoading}>
            {genAllLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
            Todos los informes
          </Button>
          <Button variant="outline" size="sm" onClick={async () => {
            const items = await fetchAllLiquidationItems(liq.id);
            setEmailItems(items);
            setEmailDialogOpen(true);
          }}>
            <Mail className="mr-1 h-4 w-4" /> Enviar emails
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
                return (
                  <>
                    {books.map((item, idx) => (
                      <TableRow key={item.item_id} className={item.total_amount < 0 ? 'bg-red-50 dark:bg-red-950/20' : ''}>
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
                              <TooltipContent>Descargar informe del autor</TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
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

      {liq && (
        <SendEmailsDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          liquidation={liq}
          allItems={emailItems}
        />
      )}
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
      p_only_with_sales: false,
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
