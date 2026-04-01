import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAllMovements, useDeleteMovement, useUpdateMovement } from '@/hooks/useSalesData';
import { MONTHS } from '@/lib/constants';
import { Trash2, Pencil, Check, X } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  year: number;
}

const TYPE_LABELS: Record<string, string> = {
  envio: 'Envío',
  venta: 'Venta',
  devolucion: 'Devolución',
};

interface EditState {
  id: string;
  quantity: number;
  notes: string;
}

export function ManualMovementsDialog({ open, onOpenChange, year }: Props) {
  const { data: movements = [], isLoading } = useAllMovements(year);
  const deleteMutation = useDeleteMovement();
  const updateMutation = useUpdateMovement();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [filter, setFilter] = useState<'all' | 'manual' | 'imported'>('all');

  const filtered = movements.filter((m: any) => {
    if (filter === 'manual') return !m.import_batch_id;
    if (filter === 'imported') return !!m.import_batch_id;
    return true;
  });

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId, { onSettled: () => setDeleteId(null) });
  };

  const handleEditStart = (m: any) => {
    setEditing({ id: m.id, quantity: m.quantity, notes: m.notes ?? '' });
  };

  const handleEditSave = () => {
    if (!editing) return;
    updateMutation.mutate(
      { id: editing.id, quantity: editing.quantity, notes: editing.notes || null },
      { onSuccess: () => setEditing(null) },
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Registros de movimientos — {year}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 mb-2">
            <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>
              Todos ({movements.length})
            </Button>
            <Button variant={filter === 'manual' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('manual')}>
              Manuales ({movements.filter((m: any) => !m.import_batch_id).length})
            </Button>
            <Button variant={filter === 'imported' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('imported')}>
              Importados ({movements.filter((m: any) => !!m.import_batch_id).length})
            </Button>
          </div>

          <div className="overflow-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Libro</TableHead>
                  <TableHead>Distribuidora</TableHead>
                  <TableHead className="text-center">Mes</TableHead>
                  <TableHead className="text-center">Tipo</TableHead>
                  <TableHead className="text-center">Cantidad</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="text-center">Origen</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No hay registros para {year}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((m: any) => {
                    const isEditing = editing?.id === m.id;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="max-w-[180px] truncate text-sm">{m.books?.title}</TableCell>
                        <TableCell className="text-sm">{m.distributors?.name}</TableCell>
                        <TableCell className="text-center text-sm">{MONTHS[m.month - 1]}</TableCell>
                        <TableCell className="text-center text-sm">{TYPE_LABELS[m.type] ?? m.type}</TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input
                              type="number"
                              value={editing.quantity}
                              onChange={e => setEditing({ ...editing, quantity: Number(e.target.value) })}
                              className="w-20 h-8 text-center mx-auto"
                              min={0}
                            />
                          ) : (
                            <span className="font-medium">{m.quantity}</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[150px]">
                          {isEditing ? (
                            <Input
                              value={editing.notes}
                              onChange={e => setEditing({ ...editing, notes: e.target.value })}
                              className="h-8 text-xs"
                              placeholder="Notas..."
                            />
                          ) : (
                            <span className="truncate text-xs text-muted-foreground block">{m.notes ?? '—'}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={m.import_batch_id ? 'secondary' : 'outline'} className="text-xs">
                            {m.import_batch_id ? 'Importado' : 'Manual'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            {isEditing ? (
                              <>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700"
                                  onClick={handleEditSave} disabled={updateMutation.isPending}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8"
                                  onClick={() => setEditing(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button variant="ghost" size="icon" className="h-8 w-8"
                                  onClick={() => handleEditStart(m)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteId(m.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
