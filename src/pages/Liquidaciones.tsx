import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Eye, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PageBreadcrumb } from '@/components/PageBreadcrumb';
import { LiquidacionFormDialog } from '@/components/liquidaciones/LiquidacionFormDialog';
import { useLiquidationsList, useDeleteLiquidation } from '@/hooks/useLiquidations';
import { formatDate } from '@/lib/format';

export default function Liquidaciones() {
  const { data: liquidations, isLoading } = useLiquidationsList();
  const deleteMut = useDeleteLiquidation();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <div>
      <PageBreadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Liquidaciones' }]} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Liquidaciones</h1>
        <Button onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" /> Nueva liquidación</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : !liquidations?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">No hay liquidaciones creadas</p>
          <p className="text-sm">Crea la primera para calcular los royalties de tus autores.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Año</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha creación</TableHead>
              <TableHead>Fecha finalización</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {liquidations.map(l => (
              <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/liquidaciones/${l.id}`)}>
                <TableCell className="font-medium">{l.year}</TableCell>
                <TableCell>
                  <Badge variant={l.status === 'finalized' ? 'default' : 'secondary'}
                    className={l.status === 'finalized' ? 'bg-green-600' : 'bg-yellow-500 text-black'}>
                    {l.status === 'finalized' ? 'Finalizada' : 'Borrador'}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(l.created_at)}</TableCell>
                <TableCell>{formatDate(l.finalized_at)}</TableCell>
                <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" onClick={() => navigate(`/liquidaciones/${l.id}`)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  {l.status === 'draft' && (
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(l.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <LiquidacionFormDialog open={showCreate} onOpenChange={setShowCreate} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar liquidación?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminarán todos los datos de esta liquidación. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
