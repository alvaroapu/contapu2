import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Mail, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generateAuthorDOCX } from './LiquidacionDOCX';
import type { Liquidation, LiquidationItem } from '@/hooks/useLiquidations';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  liquidation: Liquidation;
  allItems: LiquidationItem[];
}

interface AuthorEmail {
  author: string;
  email: string | null;
  status: 'pending' | 'sending' | 'sent' | 'error';
  error?: string;
  total: number;
  bookCount: number;
}

function formatEur(val: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €';
}

const DEFAULT_INTRO = (year: number) =>
  `Estimado/a {autor},\n\nLe enviamos el informe de liquidación correspondiente al año ${year}.\n\nEs importante tener en cuenta la operativa de ventas en librerías a través de distribuidoras, por lo que pasamos a detallarla:\n\n1. Las distribuidoras cuentan con un depósito de ejemplares que desde la editorial les hacemos llegar.\n2. Las distribuidoras mandan ejemplares en depósito a librerías y a grandes superficies; el depósito dura de 3 a 6 meses, por lo que hasta transcurridos estos plazos, las distribuidoras desconocen las ventas de los libros.`;

const DEFAULT_OUTRO = () =>
  `Para que la editorial pueda realizar el pago, lo más conveniente, para agilizar el proceso de cobro, es que como autor/a realice una factura por PayPal a icidre@apuleyoediciones.com. IMPORTANTE QUE SEA FACTURA Y NO UNA PETICIÓN DE PAGO.\n\nRecomendamos la primera opción, para evitar trámites.\n\nOs facilitamos un vídeo para usarlo como guía en caso de tener ciertas dificultades con la factura:\nhttps://youtu.be/eVC-zxlDuLE?si=Hx10Vj7v34z1160r\n\nUn cordial saludo,\nApuleyo Ediciones`;

export function SendEmailsDialog({ open, onOpenChange, liquidation, allItems }: Props) {
  const [authors, setAuthors] = useState<AuthorEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState('');
  const [introText, setIntroText] = useState('');
  const [outroText, setOutroText] = useState('');
  const [activeTab, setActiveTab] = useState('message');

  useEffect(() => {
    if (!open) return;
    setSubject(`Liquidación ${liquidation.year} - Apuleyo Ediciones`);
    setIntroText(DEFAULT_INTRO(liquidation.year));
    setOutroText(DEFAULT_OUTRO());
    if (allItems.length) loadAuthors();
  }, [open, allItems]);

  const loadAuthors = async () => {
    setLoading(true);
    const authorMap = new Map<string, LiquidationItem[]>();
    for (const item of allItems) {
      const list = authorMap.get(item.author) ?? [];
      list.push(item);
      authorMap.set(item.author, list);
    }

    const authorNames = [...authorMap.keys()];
    let allBooks: any[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from('books')
        .select('author, author_email')
        .in('author', authorNames.slice(from, from + 100));
      if (!data || data.length === 0) break;
      allBooks.push(...data);
      from += 100;
      if (from >= authorNames.length) break;
    }

    const emailMap = new Map<string, string | null>();
    for (const b of allBooks) {
      if (b.author_email && !emailMap.get(b.author)) {
        emailMap.set(b.author, b.author_email);
      }
    }

    const result: AuthorEmail[] = authorNames.sort().map(author => {
      const items = authorMap.get(author) ?? [];
      const total = items.reduce((s, i) => s + i.total_amount, 0);
      return {
        author,
        email: emailMap.get(author) ?? null,
        status: 'pending' as const,
        total,
        bookCount: items.length,
      };
    });

    setAuthors(result);
    setLoading(false);
  };

  const buildSummaryHtml = (author: string): string => {
    const items = allItems.filter(i => i.author === author);
    let html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<tr style="background:#1a56db;color:white;"><th style="padding:8px;text-align:left;">Título</th><th style="padding:8px;text-align:right;">Dist. Uds</th><th style="padding:8px;text-align:right;">Dist. €</th><th style="padding:8px;text-align:right;">Web Uds</th><th style="padding:8px;text-align:right;">Web €</th><th style="padding:8px;text-align:right;">Inst. Uds</th><th style="padding:8px;text-align:right;">Inst. €</th><th style="padding:8px;text-align:right;">Total €</th></tr>';
    for (const item of items) {
      const bg = item.total_amount < 0 ? '#fff3f3' : '#fff';
      html += `<tr style="background:${bg};border-bottom:1px solid #eee;">`;
      html += `<td style="padding:6px 8px;">${item.book_title}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;">${item.distributor_units}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;">${formatEur(item.distributor_amount)}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;">${item.online_units}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;">${formatEur(item.online_amount)}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;">${item.school_units}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;">${formatEur(item.school_amount)}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;font-weight:bold;">${formatEur(item.total_amount)}</td>`;
      html += '</tr>';
    }
    const total = items.reduce((s, i) => s + (i.total_amount > 0 ? i.total_amount : 0), 0);
    html += `<tr style="background:#f0f4ff;font-weight:bold;"><td style="padding:8px;" colspan="7">TOTAL A LIQUIDAR</td><td style="padding:8px;text-align:right;">${formatEur(total)}</td></tr>`;
    html += '</table>';
    return html;
  };

  const resolveText = (text: string, author: string): string => {
    return text.replace(/\{autor\}/gi, author);
  };

  const sendEmail = async (authorData: AuthorEmail, idx: number) => {
    setAuthors(prev => prev.map((a, i) => i === idx ? { ...a, status: 'sending' } : a));

    try {
      const blob = await generateAuthorDOCX(authorData.author, allItems, liquidation);
      const fileName = `${liquidation.year}/${authorData.author.replace(/\s+/g, '_')}.docx`;

      const { error: uploadError } = await supabase.storage
        .from('liquidation-docs')
        .upload(fileName, blob, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

      if (uploadError) throw new Error(`Upload error: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from('liquidation-docs').getPublicUrl(fileName);
      const docxUrl = urlData.publicUrl;

      const summaryHtml = buildSummaryHtml(authorData.author);

      const { error } = await supabase.functions.invoke('send-liquidation-email', {
        body: {
          author: authorData.author,
          authorEmail: authorData.email,
          liquidationYear: liquidation.year,
          summaryHtml,
          docxUrl,
          subject: resolveText(subject, authorData.author),
          introText: resolveText(introText, authorData.author),
          outroText: resolveText(outroText, authorData.author),
        },
      });

      if (error) throw error;

      setAuthors(prev => prev.map((a, i) => i === idx ? { ...a, status: 'sent' } : a));
    } catch (err: any) {
      setAuthors(prev => prev.map((a, i) => i === idx ? { ...a, status: 'error', error: err.message } : a));
    }
  };

  const handleSendAll = async () => {
    setSending(true);
    for (let i = 0; i < authors.length; i++) {
      const a = authors[i];
      if (!a.email || a.status === 'sent') continue;
      await sendEmail(a, i);
      await new Promise(r => setTimeout(r, 500));
    }
    setSending(false);
    toast.success('Proceso completado');
  };

  const withEmail = authors.filter(a => a.email);
  const withoutEmail = authors.filter(a => !a.email);
  const sentCount = authors.filter(a => a.status === 'sent').length;
  const errorCount = authors.filter(a => a.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Enviar liquidación {liquidation.year} por email
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando autores…
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="message">✏️ Mensaje</TabsTrigger>
              <TabsTrigger value="recipients">📧 Destinatarios ({withEmail.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="message" className="space-y-4 mt-4">
              <div>
                <Label htmlFor="subject" className="text-sm font-medium">Asunto</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="intro" className="text-sm font-medium">
                  Texto de introducción
                  <span className="text-muted-foreground font-normal ml-2">(antes de la tabla de ventas)</span>
                </Label>
                <Textarea
                  id="intro"
                  value={introText}
                  onChange={e => setIntroText(e.target.value)}
                  rows={8}
                  className="mt-1 font-mono text-sm"
                />
              </div>

              <div>
                <Label htmlFor="outro" className="text-sm font-medium">
                  Texto de cierre
                  <span className="text-muted-foreground font-normal ml-2">(después de la tabla y el botón de descarga)</span>
                </Label>
                <Textarea
                  id="outro"
                  value={outroText}
                  onChange={e => setOutroText(e.target.value)}
                  rows={8}
                  className="mt-1 font-mono text-sm"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                💡 Usa <code className="bg-muted px-1 rounded">{'{autor}'}</code> para insertar el nombre del autor automáticamente.
              </p>
            </TabsContent>

            <TabsContent value="recipients" className="mt-4 space-y-3">
              <div className="flex gap-3 text-sm flex-wrap">
                <Badge variant="default">{withEmail.length} con email</Badge>
                {withoutEmail.length > 0 && <Badge variant="secondary">{withoutEmail.length} sin email</Badge>}
                {sentCount > 0 && <Badge className="bg-green-600">{sentCount} enviados</Badge>}
                {errorCount > 0 && <Badge variant="destructive">{errorCount} con error</Badge>}
              </div>

              <div className="rounded-md border max-h-[45vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Autor</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Libros</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {authors.map((a, idx) => (
                      <TableRow key={a.author} className={!a.email ? 'bg-muted/50' : ''}>
                        <TableCell className="font-medium text-sm">{a.author}</TableCell>
                        <TableCell className="text-sm">{a.email ?? <span className="text-muted-foreground italic">Sin email</span>}</TableCell>
                        <TableCell className="text-right text-sm">{a.bookCount}</TableCell>
                        <TableCell className="text-right text-sm">{formatEur(a.total)}</TableCell>
                        <TableCell>
                          {a.status === 'pending' && a.email && <Badge variant="secondary">Pendiente</Badge>}
                          {a.status === 'sending' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                          {a.status === 'sent' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                          {a.status === 'error' && (
                            <span className="flex items-center gap-1" title={a.error}>
                              <XCircle className="h-4 w-4 text-destructive" />
                            </span>
                          )}
                          {!a.email && <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell>
                          {a.email && a.status !== 'sent' && a.status !== 'sending' && (
                            <Button variant="ghost" size="sm" onClick={() => sendEmail(a, idx)} disabled={sending}>
                              <Mail className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button onClick={handleSendAll} disabled={sending || withEmail.length === 0 || sentCount === withEmail.length}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar a {withEmail.length - sentCount} autor(es)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
