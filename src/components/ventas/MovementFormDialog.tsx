import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useDistributors } from '@/hooks/useDistributors';
import { useDebounce } from '@/hooks/useDebounce';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MONTHS } from '@/lib/constants';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  year: number;
}

export function MovementFormDialog({ open, onOpenChange, year }: Props) {
  const { data: distributors = [] } = useDistributors();
  const qc = useQueryClient();
  const [bookSearch, setBookSearch] = useState('');
  const [selectedBook, setSelectedBook] = useState<{ id: string; title: string } | null>(null);
  const [showBookList, setShowBookList] = useState(false);
  const [distributorId, setDistributorId] = useState('');
  const [month, setMonth] = useState('1');
  const [type, setType] = useState('venta');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const debouncedSearch = useDebounce(bookSearch, 300);
  const { data: bookResults = [] } = useQuery({
    queryKey: ['bookSearchMov', debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch.length < 2) return [];
      const { data } = await supabase.from('books').select('id, title, isbn')
        .or(`title.ilike.%${debouncedSearch}%,isbn.ilike.%${debouncedSearch}%`).limit(10) as any;
      return data ?? [];
    },
    enabled: debouncedSearch.length >= 2,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBook || !distributorId || !quantity) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('sales_movements').insert({
        book_id: selectedBook.id,
        distributor_id: distributorId,
        year,
        month: parseInt(month),
        type,
        quantity: parseInt(quantity),
        notes: notes || null,
      } as any);
      if (error) throw error;
      toast.success('Movimiento registrado');
      qc.invalidateQueries({ queryKey: ['sales'] });
      onOpenChange(false);
      setSelectedBook(null); setBookSearch(''); setQuantity(''); setNotes('');
    } catch (err: any) {
      toast.error(err.message ?? 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registrar movimiento</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1 relative">
            <Label>Libro *</Label>
            <Input
              value={selectedBook ? selectedBook.title : bookSearch}
              onChange={e => { setBookSearch(e.target.value); setSelectedBook(null); setShowBookList(true); }}
              onFocus={() => setShowBookList(true)}
              onBlur={() => setTimeout(() => setShowBookList(false), 200)}
              placeholder="Buscar por título o ISBN…"
              required
            />
            {showBookList && bookResults.length > 0 && !selectedBook && (
              <ul className="absolute z-50 mt-1 max-h-40 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
                {bookResults.map((b: any) => (
                  <li key={b.id} className="cursor-pointer rounded px-2 py-1 text-sm hover:bg-muted"
                    onMouseDown={() => { setSelectedBook({ id: b.id, title: b.title }); setShowBookList(false); }}>
                    {b.title} {b.isbn && <span className="text-xs text-muted-foreground ml-1">({b.isbn})</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Distribuidora *</Label>
              <Select value={distributorId} onValueChange={setDistributorId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {distributors.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Mes *</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="envio">Envío</SelectItem>
                  <SelectItem value="venta">Venta</SelectItem>
                  <SelectItem value="devolucion">Devolución</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Cantidad *</Label>
              <Input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
