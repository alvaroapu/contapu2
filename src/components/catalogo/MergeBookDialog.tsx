import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from 'sonner';
import { Search, ArrowRight, Merge } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected book IDs from catalog selection */
  preselectedIds?: string[];
}

interface BookResult {
  id: string;
  title: string;
  isbn: string | null;
  author: string;
  pvp: number;
}

export function MergeBookDialog({ open, onOpenChange, preselectedIds = [] }: Props) {
  const [sourceBook, setSourceBook] = useState<BookResult | null>(null);
  const [targetBook, setTargetBook] = useState<BookResult | null>(null);
  const [searchSource, setSearchSource] = useState('');
  const [searchTarget, setSearchTarget] = useState('');
  const [merging, setMerging] = useState(false);
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  const qc = useQueryClient();

  const debouncedSource = useDebounce(searchSource, 300);
  const debouncedTarget = useDebounce(searchTarget, 300);

  const [sourceResults, setSourceResults] = useState<BookResult[]>([]);
  const [targetResults, setTargetResults] = useState<BookResult[]>([]);

  async function searchBooks(query: string, setter: (r: BookResult[]) => void, excludeId?: string) {
    if (query.length < 2) { setter([]); return; }
    const { data } = await supabase.from('books')
      .select('id, title, isbn, author, pvp')
      .or(`title.ilike.%${query}%,isbn.ilike.%${query}%,author.ilike.%${query}%`)
      .limit(8);
    const results = (data ?? []).filter(b => b.id !== excludeId) as BookResult[];
    setter(results);
  }

  // Load preselected books on open
  async function loadPreselected() {
    if (preselectedIds.length >= 2) {
      const { data } = await supabase.from('books')
        .select('id, title, isbn, author, pvp')
        .in('id', preselectedIds.slice(0, 2));
      if (data && data.length === 2) {
        setSourceBook(data[0] as BookResult);
        setTargetBook(data[1] as BookResult);
      }
    }
  }

  function resetState() {
    setSourceBook(null);
    setTargetBook(null);
    setSearchSource('');
    setSearchTarget('');
    setSourceResults([]);
    setTargetResults([]);
    setStep('select');
    setMerging(false);
  }

  function handleOpenChange(v: boolean) {
    resetState();
    if (v && preselectedIds.length >= 2) loadPreselected();
    onOpenChange(v);
  }

  async function handleMerge() {
    if (!sourceBook || !targetBook) return;
    setMerging(true);
    try {
      // Move all sales_movements from source to target
      const { error: mvError } = await supabase
        .from('sales_movements')
        .update({ book_id: targetBook.id } as any)
        .eq('book_id', sourceBook.id);
      if (mvError) throw mvError;

      // Move liquidation_items from source to target
      const { error: liError } = await supabase
        .from('liquidation_items')
        .update({ book_id: targetBook.id } as any)
        .eq('book_id', sourceBook.id);
      if (liError) throw liError;

      // Copy useful fields from source to target if target is missing them
      const updates: any = {};
      if (!targetBook.isbn && sourceBook.isbn) updates.isbn = sourceBook.isbn;

      // Fetch full source book for extra fields
      const { data: fullSource } = await supabase.from('books')
        .select('ean, maidhisa_ref').eq('id', sourceBook.id).single();
      const { data: fullTarget } = await supabase.from('books')
        .select('ean, maidhisa_ref').eq('id', targetBook.id).single();

      if (fullSource && fullTarget) {
        if (!fullTarget.ean && fullSource.ean) updates.ean = fullSource.ean;
        if (!fullTarget.maidhisa_ref && fullSource.maidhisa_ref) updates.maidhisa_ref = fullSource.maidhisa_ref;
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('books').update(updates).eq('id', targetBook.id);
      }

      // Delete source book
      const { error: delError } = await supabase.from('books').delete().eq('id', sourceBook.id);
      if (delError) throw delError;

      toast.success(`"${sourceBook.title}" fusionado en "${targetBook.title}"`);
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['liquidations'] });
      handleOpenChange(false);
    } catch (err: any) {
      toast.error('Error al fusionar: ' + (err.message ?? 'Error desconocido'));
    } finally {
      setMerging(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" /> Fusionar libros
          </DialogTitle>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              El libro origen será eliminado y todas sus ventas se moverán al libro destino.
            </p>

            {/* Source book */}
            <div className="space-y-1">
              <Label>Libro a eliminar (origen)</Label>
              {sourceBook ? (
                <div className="flex items-center justify-between rounded border p-2">
                  <div>
                    <div className="font-medium text-sm">{sourceBook.title}</div>
                    <div className="text-xs text-muted-foreground">{sourceBook.isbn ?? 'Sin ISBN'} · {sourceBook.author}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSourceBook(null)}>Cambiar</Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Buscar libro origen…"
                      value={searchSource}
                      onChange={e => { setSearchSource(e.target.value); searchBooks(e.target.value, setSourceResults, targetBook?.id); }}
                    />
                  </div>
                  {sourceResults.length > 0 && (
                    <ul className="max-h-40 overflow-auto rounded border bg-popover p-1">
                      {sourceResults.map(b => (
                        <li key={b.id} className="cursor-pointer rounded px-2 py-1.5 text-sm hover:bg-muted"
                          onClick={() => { setSourceBook(b); setSourceResults([]); setSearchSource(''); }}>
                          <div className="font-medium">{b.title}</div>
                          <div className="text-xs text-muted-foreground">{b.isbn ?? 'Sin ISBN'} · {b.author}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {sourceBook && targetBook && (
              <div className="flex justify-center">
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
              </div>
            )}

            {/* Target book */}
            <div className="space-y-1">
              <Label>Libro que se conserva (destino)</Label>
              {targetBook ? (
                <div className="flex items-center justify-between rounded border p-2">
                  <div>
                    <div className="font-medium text-sm">{targetBook.title}</div>
                    <div className="text-xs text-muted-foreground">{targetBook.isbn ?? 'Sin ISBN'} · {targetBook.author}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setTargetBook(null)}>Cambiar</Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Buscar libro destino…"
                      value={searchTarget}
                      onChange={e => { setSearchTarget(e.target.value); searchBooks(e.target.value, setTargetResults, sourceBook?.id); }}
                    />
                  </div>
                  {targetResults.length > 0 && (
                    <ul className="max-h-40 overflow-auto rounded border bg-popover p-1">
                      {targetResults.map(b => (
                        <li key={b.id} className="cursor-pointer rounded px-2 py-1.5 text-sm hover:bg-muted"
                          onClick={() => { setTargetBook(b); setTargetResults([]); setSearchTarget(''); }}>
                          <div className="font-medium">{b.title}</div>
                          <div className="text-xs text-muted-foreground">{b.isbn ?? 'Sin ISBN'} · {b.author}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
              <Button disabled={!sourceBook || !targetBook} onClick={() => setStep('confirm')}>
                Continuar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'confirm' && sourceBook && targetBook && (
          <div className="space-y-4">
            <div className="rounded border p-3 space-y-2 bg-muted/50">
              <div className="text-sm">
                <span className="font-medium text-destructive">Eliminar:</span> {sourceBook.title}
                <span className="text-xs text-muted-foreground ml-1">({sourceBook.isbn ?? 'Sin ISBN'})</span>
              </div>
              <div className="flex justify-center"><ArrowRight className="h-4 w-4 text-muted-foreground" /></div>
              <div className="text-sm">
                <span className="font-medium text-primary">Conservar:</span> {targetBook.title}
                <span className="text-xs text-muted-foreground ml-1">({targetBook.isbn ?? 'Sin ISBN'})</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Todas las ventas, devoluciones y datos de liquidación del libro origen se moverán al libro destino.
              Los campos vacíos del destino (ISBN, EAN, ref. Maidhisa) se completarán con los del origen si están disponibles.
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select')}>Atrás</Button>
              <Button variant="destructive" onClick={handleMerge} disabled={merging}>
                {merging ? 'Fusionando…' : 'Fusionar'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
