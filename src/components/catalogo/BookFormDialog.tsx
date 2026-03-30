import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Book, useAuthors, useSaveBook } from '@/hooks/useBooks';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  book?: Book | null;
}

const emptyForm = {
  isbn: '',
  ean: '',
  title: '',
  author: '',
  pvp: '',
  publication_date: '',
  status: 'active',
  maidhisa_ref: '',
  author_email: '',
};

export function BookFormDialog({ open, onOpenChange, book }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [authorSearch, setAuthorSearch] = useState('');
  const [showAuthorList, setShowAuthorList] = useState(false);
  const { data: authors = [] } = useAuthors();
  const save = useSaveBook();

  useEffect(() => {
    if (book) {
      setForm({
        isbn: book.isbn ?? '',
        ean: book.ean ?? '',
        title: book.title,
        author: book.author,
        pvp: String(book.pvp),
        publication_date: book.publication_date ?? '',
        status: book.status,
        maidhisa_ref: book.maidhisa_ref ?? '',
        author_email: book.author_email ?? '',
      });
      setAuthorSearch(book.author);
    } else {
      setForm(emptyForm);
      setAuthorSearch('');
    }
  }, [book, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.author || !form.pvp) {
      toast.error('Completa los campos obligatorios');
      return;
    }

    // Check ISBN uniqueness for new books
    if (form.isbn && !book) {
      const { data } = await supabase.from('books').select('id').eq('isbn', form.isbn).maybeSingle();
      if (data) {
        toast.error('Ya existe un libro con ese ISBN');
        return;
      }
    }

    save.mutate(
      {
        ...(book ? { id: book.id } : {}),
        isbn: form.isbn || null,
        ean: form.ean || null,
        title: form.title,
        author: form.author,
        pvp: parseFloat(form.pvp),
        publication_date: form.publication_date || null,
        status: form.status,
        maidhisa_ref: form.maidhisa_ref || null,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const filteredAuthors = authors.filter((a) =>
    a.toLowerCase().includes(authorSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{book ? 'Editar libro' : 'Nuevo libro'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>ISBN</Label>
              <Input value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>EAN</Label>
              <Input value={form.ean} onChange={(e) => setForm({ ...form, ean: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Título *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="space-y-1 relative">
            <Label>Autor *</Label>
            <Input
              value={authorSearch}
              onChange={(e) => {
                setAuthorSearch(e.target.value);
                setForm({ ...form, author: e.target.value });
                setShowAuthorList(true);
              }}
              onFocus={() => setShowAuthorList(true)}
              onBlur={() => setTimeout(() => setShowAuthorList(false), 200)}
              required
            />
            {showAuthorList && filteredAuthors.length > 0 && (
              <ul className="absolute z-50 mt-1 max-h-32 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
                {filteredAuthors.slice(0, 8).map((a) => (
                  <li
                    key={a}
                    className="cursor-pointer rounded px-2 py-1 text-sm hover:bg-muted"
                    onMouseDown={() => {
                      setAuthorSearch(a);
                      setForm({ ...form, author: a });
                      setShowAuthorList(false);
                    }}
                  >
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>PVP (€) *</Label>
              <Input type="number" step="0.01" min="0" value={form.pvp} onChange={(e) => setForm({ ...form, pvp: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Fecha publicación</Label>
              <Input type="date" value={form.publication_date} onChange={(e) => setForm({ ...form, publication_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                  <SelectItem value="out_of_print">Fuera de impresión</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Ref. Maidhisa</Label>
              <Input value={form.maidhisa_ref} onChange={(e) => setForm({ ...form, maidhisa_ref: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
