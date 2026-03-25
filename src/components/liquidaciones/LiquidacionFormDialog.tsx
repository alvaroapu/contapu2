import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle, Loader2 } from 'lucide-react';
import { useCreateLiquidation } from '@/hooks/useLiquidations';
import { getYears } from '@/lib/constants';

const YEARS = getYears();

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function LiquidacionFormDialog({ open, onOpenChange }: Props) {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [distPct, setDistPct] = useState('10.00');
  const [onlinePct, setOnlinePct] = useState('25.00');
  const [schoolPct, setSchoolPct] = useState('30.00');
  const create = useCreateLiquidation();

  const handleSubmit = async () => {
    await create.mutateAsync({
      year: parseInt(year),
      distributor_royalty_pct: parseFloat(distPct),
      online_royalty_pct: parseFloat(onlinePct),
      school_royalty_pct: parseFloat(schoolPct),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva liquidación</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Año</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="flex items-center gap-1">
              <Label>% Distribuidoras</Label>
              <Tooltip>
                <TooltipTrigger><HelpCircle className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent>Porcentaje sobre el PVP que se paga al autor por cada libro vendido a través de distribuidoras</TooltipContent>
              </Tooltip>
            </div>
            <Input type="number" step="0.01" value={distPct} onChange={e => setDistPct(e.target.value)} />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <Label>% Online</Label>
              <Tooltip>
                <TooltipTrigger><HelpCircle className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent>Porcentaje sobre el PVP por ventas online (Almacén)</TooltipContent>
              </Tooltip>
            </div>
            <Input type="number" step="0.01" value={onlinePct} onChange={e => setOnlinePct(e.target.value)} />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <Label>% Colegios y Aytos.</Label>
              <Tooltip>
                <TooltipTrigger><HelpCircle className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent>Porcentaje sobre el PVP por ventas a colegios y ayuntamientos</TooltipContent>
              </Tooltip>
            </div>
            <Input type="number" step="0.01" value={schoolPct} onChange={e => setSchoolPct(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear y calcular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
