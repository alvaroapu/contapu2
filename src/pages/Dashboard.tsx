import { useState } from 'react';
import { BookOpen, BarChart3, TrendingUp, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PageBreadcrumb } from '@/components/PageBreadcrumb';
import { useDashboardSummary, useMonthlySales, useTopBooks, useTopAuthors } from '@/hooks/useDashboard';
import { formatCurrency } from '@/lib/format';
import { getYears, MONTHS } from '@/lib/constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

const YEARS = getYears();

export default function Dashboard() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: summary, isLoading: sumLoading } = useDashboardSummary(year);
  const { data: monthly, isLoading: monthlyLoading } = useMonthlySales(year);
  const { data: topBooks } = useTopBooks(year);
  const { data: topAuthors } = useTopAuthors(year);

  const chartData = MONTHS.map((m, i) => {
    const row = monthly?.find(r => r.month === i + 1);
    return {
      name: m.substring(0, 3),
      Distribuidoras: row?.distributor_sales ?? 0,
      Online: row?.online_sales ?? 0,
      Colegios: row?.school_sales ?? 0,
      Ventas: (row?.distributor_sales ?? 0) + (row?.online_sales ?? 0) + (row?.school_sales ?? 0),
      Devoluciones: (row?.distributor_returns ?? 0) + (row?.online_returns ?? 0) + (row?.school_returns ?? 0),
    };
  });

  return (
    <div>
      <PageBreadcrumb items={[{ label: 'Dashboard' }]} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Select value={year.toString()} onValueChange={v => setYear(parseInt(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {sumLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Card>
              <CardContent className="pt-4 flex items-center gap-3">
                <BookOpen className="h-8 w-8 text-primary" />
                <div><p className="text-sm text-muted-foreground">Libros en catálogo</p><p className="text-2xl font-bold">{summary?.active_books ?? 0}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 flex items-center gap-3">
                <BarChart3 className="h-8 w-8 text-accent" />
                <div><p className="text-sm text-muted-foreground">Títulos con ventas</p><p className="text-2xl font-bold">{summary?.books_with_sales ?? 0}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-green-600" />
                <div><p className="text-sm text-muted-foreground">Uds. vendidas</p><p className="text-2xl font-bold">{summary?.total_units_sold ?? 0}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-yellow-600" />
                <div><p className="text-sm text-muted-foreground">Royalties estimados</p><p className="text-2xl font-bold">{formatCurrency(Number(summary?.estimated_royalties ?? 0))}</p></div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Ventas mensuales por canal</CardTitle></CardHeader>
          <CardContent>
            {monthlyLoading ? <Skeleton className="h-64" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <RTooltip />
                  <Legend />
                  <Bar dataKey="Distribuidoras" stackId="a" fill="hsl(216, 28%, 14%)" />
                  <Bar dataKey="Online" stackId="a" fill="hsl(12, 80%, 58%)" />
                  <Bar dataKey="Colegios" stackId="a" fill="hsl(220, 9%, 46%)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Evolución mensual</CardTitle></CardHeader>
          <CardContent>
            {monthlyLoading ? <Skeleton className="h-64" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <RTooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Ventas" stroke="hsl(216, 28%, 14%)" strokeWidth={2} />
                  <Line type="monotone" dataKey="Devoluciones" stroke="hsl(12, 80%, 58%)" strokeWidth={2} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom tables */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 libros más vendidos</CardTitle></CardHeader>
          <CardContent>
            {!topBooks?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos de ventas para este año.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>#</TableHead><TableHead>Título</TableHead><TableHead>Autor</TableHead><TableHead className="text-right">Uds.</TableHead><TableHead>Canal</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {topBooks.map((b, i) => (
                    <TableRow key={b.book_id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{b.title}</TableCell>
                      <TableCell>{b.author}</TableCell>
                      <TableCell className="text-right">{b.net_sales}</TableCell>
                      <TableCell><span className="text-xs">{b.main_channel}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Top 5 autores</CardTitle></CardHeader>
          <CardContent>
            {!topAuthors?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos de ventas para este año.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>#</TableHead><TableHead>Autor</TableHead><TableHead className="text-right">Libros</TableHead><TableHead className="text-right">Uds.</TableHead><TableHead className="text-right">Royalties</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {topAuthors.map((a, i) => (
                    <TableRow key={a.author}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{a.author}</TableCell>
                      <TableCell className="text-right">{a.num_books}</TableCell>
                      <TableCell className="text-right">{a.total_units}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(a.estimated_royalties))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
