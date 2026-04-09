import { useState, useEffect, useRef } from 'react';
import { normalizeSearch } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Mail, CheckCircle2, XCircle, AlertCircle, FileDown, Search, Send } from 'lucide-react';
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

interface LogEntry {
  timestamp: string;
  author: string;
  email: string;
  status: 'sent' | 'error' | 'skipped';
  reason?: string;
  error?: string;
  batch: number;
}

function formatEur(val: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €';
}

const DEFAULT_INTRO = (year: number) =>
  `Estimado/a {autor},\n\nLe enviamos el informe de liquidación correspondiente al año ${year}.\n\nEs importante tener en cuenta la operativa de ventas en librerías a través de distribuidoras, por lo que pasamos a detallarla:\n\n1. Las distribuidoras cuentan con un depósito de ejemplares que desde la editorial les hacemos llegar.\n2. Las distribuidoras mandan ejemplares en depósito a librerías y a grandes superficies; el depósito dura de 3 a 6 meses, por lo que hasta transcurridos estos plazos, las distribuidoras desconocen las ventas de los libros.`;

const DEFAULT_OUTRO = () =>
  `Para que la editorial pueda realizar el pago, lo más conveniente, para agilizar el proceso de cobro, es que como autor/a nos conteste a este correo indicando su número de cuenta.\n\nLa editorial le realizará una autofactura, como rendimientos del trabajo, para que usted, como autor/a, NO tenga que darse de alta como autónomo/a.\n\nUn cordial saludo,\nApuleyo Ediciones`;

export function SendEmailsDialog({ open, onOpenChange, liquidation, allItems }: Props) {
  const [authors, setAuthors] = useState<AuthorEmail[]>([]);
  const [filteredItems, setFilteredItems] = useState<LiquidationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState('');
  const [introText, setIntroText] = useState('');
  const [outroText, setOutroText] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [activeTab, setActiveTab] = useState('message');
  const [testingPdf, setTestingPdf] = useState(false);
  const [authorSearch, setAuthorSearch] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [sendLog, setSendLog] = useState<LogEntry[]>([]);
  const [sendProgress, setSendProgress] = useState('');
  const [excludedAuthors, setExcludedAuthors] = useState<Set<string>>(new Set());
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'with-email' | 'without-email'>('all');
  const [resumeFrom, setResumeFrom] = useState('');
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setSubject(`Liquidación ${liquidation.year} - Apuleyo Ediciones`);
    setIntroText(DEFAULT_INTRO(liquidation.year));
    setOutroText(DEFAULT_OUTRO());
    if (allItems.length) loadAuthors();
  }, [open, allItems]);

  const loadAuthors = async () => {
    setLoading(true);

    // Fetch active book IDs to exclude inactive books from email sending
    const activeBookIds = new Set<string>();
    let abFrom = 0;
    while (true) {
      const { data } = await supabase
        .from('books')
        .select('id')
        .eq('status', 'active')
        .range(abFrom, abFrom + 999);
      if (!data || data.length === 0) break;
      for (const b of data) activeBookIds.add(b.id);
      if (data.length < 1000) break;
      abFrom += 1000;
    }

    // Filter allItems to only active books
    const activeItems = allItems.filter(item => activeBookIds.has(item.book_id));

    const authorMap = new Map<string, LiquidationItem[]>();
    for (const item of activeItems) {
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
        .eq('status', 'active')
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

    // Restore send status from persistent log
    const { data: logData } = await (supabase as any)
      .from('email_send_log')
      .select('author, status, error_message, sent_at')
      .eq('liquidation_id', liquidation.id);

    if (logData && logData.length > 0) {
      const logMap = new Map<string, any>(logData.map((l: any) => [l.author, l]));
      for (const a of result) {
        const entry = logMap.get(a.author);
        if (entry) {
          a.status = entry.status;
          if (entry.error_message) a.error = entry.error_message;
        }
      }
      const restoredCount = logData.filter((l: any) => l.status === 'sent').length;
      if (restoredCount > 0) {
        setSendLog(logData.map((l: any) => ({
          timestamp: new Date(l.sent_at).toLocaleTimeString('es-ES'),
          author: l.author,
          email: l.email ?? '—',
          status: l.status as 'sent' | 'error' | 'skipped',
          error: l.error_message,
          reason: l.status === 'skipped' ? l.error_message : undefined,
          batch: 0,
        })));
      }
    }

    setFilteredItems(activeItems);
    setAuthors(result);
    setLoading(false);
  };

  const buildSummaryHtml = (author: string): string => {
    const items = filteredItems.filter(i => i.author === author);
    let html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<tr style="background:#1a56db;color:white;"><th style="padding:8px;text-align:left;">Título</th><th style="padding:8px;text-align:right;">Dist. Uds</th><th style="padding:8px;text-align:right;">Dist. €</th><th style="padding:8px;text-align:right;">Web Uds</th><th style="padding:8px;text-align:right;">Web €</th><th style="padding:8px;text-align:right;">Inst. Uds</th><th style="padding:8px;text-align:right;">Inst. €</th><th style="padding:8px;text-align:right;">Total €</th></tr>';
    for (const item of items) {
      const isNegative = item.total_amount < 0;
      const bg = isNegative ? '#fff3f3' : '#fff';
      const distUnits = isNegative ? 0 : item.distributor_units;
      const distAmt = isNegative ? 0 : item.distributor_amount;
      const onlineUnits = isNegative ? 0 : item.online_units;
      const onlineAmt = isNegative ? 0 : item.online_amount;
      const schoolUnits = isNegative ? 0 : item.school_units;
      const schoolAmt = isNegative ? 0 : item.school_amount;
      const totalAmt = isNegative ? 0 : item.total_amount;
      html += `<tr style="background:${bg};border-bottom:1px solid #eee;">`;
      html += `<td style="padding:6px 8px;">${item.book_title}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;">${distUnits}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;">${formatEur(distAmt)}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;">${onlineUnits}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;">${formatEur(onlineAmt)}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;">${schoolUnits}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;">${formatEur(schoolAmt)}</td>`;
      html += `<td style="padding:6px 8px;text-align:right;font-weight:bold;">${formatEur(totalAmt)}</td>`;
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

  const sendEmail = async (authorData: AuthorEmail, idx: number, batchNum?: number): Promise<boolean> => {
    setAuthors(prev => prev.map((a, i) => i === idx ? { ...a, status: 'sending' } : a));
    const now = new Date().toLocaleTimeString('es-ES');

    try {
      const blob = await generateAuthorDOCX(authorData.author, filteredItems, liquidation);
      const sanitizedName = authorData.author
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_');
      const fileName = `${liquidation.year}/${sanitizedName}.docx`;

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
          ...(fromEmail.trim() ? { fromEmail: fromEmail.trim() } : {}),
        },
      });

      if (error) throw error;

      setAuthors(prev => prev.map((a, i) => i === idx ? { ...a, status: 'sent' } : a));
      setSendLog(prev => [...prev, { timestamp: now, author: authorData.author, email: authorData.email!, status: 'sent', batch: batchNum ?? 0 }]);
      (supabase as any).from('email_send_log').upsert({
        liquidation_id: liquidation.id,
        year: liquidation.year,
        author: authorData.author,
        email: authorData.email,
        status: 'sent',
        error_message: null,
        sent_at: new Date().toISOString(),
      }, { onConflict: 'liquidation_id,author' }).then(() => {}, () => {});
      return true;
    } catch (err: any) {
      setAuthors(prev => prev.map((a, i) => i === idx ? { ...a, status: 'error', error: err.message } : a));
      setSendLog(prev => [...prev, { timestamp: now, author: authorData.author, email: authorData.email!, status: 'error', error: err.message, batch: batchNum ?? 0 }]);
      (supabase as any).from('email_send_log').upsert({
        liquidation_id: liquidation.id,
        year: liquidation.year,
        author: authorData.author,
        email: authorData.email,
        status: 'error',
        error_message: err.message,
        sent_at: new Date().toISOString(),
      }, { onConflict: 'liquidation_id,author' }).then(() => {}, () => {});
      return false;
    }
  };

  const handleSendAll = async () => {
    setSending(true);
    cancelRef.current = false;
    setSendLog([]);
    setActiveTab('log');
    const BATCH_SIZE = 10;
    const BATCH_DELAY_MS = 20000;
    const EMAIL_DELAY_MS = 500;

    const toSend = authors
      .map((a, idx) => ({ ...a, idx }))
      .filter(a => a.email && a.status !== 'sent' && a.total > 0 && !excludedAuthors.has(a.author));

    const totalBatches = Math.ceil(toSend.length / BATCH_SIZE);
    let cancelled = false;

    for (let i = 0; i < toSend.length; i += BATCH_SIZE) {
      if (cancelRef.current) { cancelled = true; break; }
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batch = toSend.slice(i, i + BATCH_SIZE);
      setSendProgress(`Lote ${batchNum}/${totalBatches} — enviando ${batch.length} emails…`);

      for (const a of batch) {
        if (cancelRef.current) { cancelled = true; break; }
        await sendEmail(a, a.idx, batchNum);
        await new Promise(r => setTimeout(r, EMAIL_DELAY_MS));
      }
      if (cancelled) break;

      if (i + BATCH_SIZE < toSend.length) {
        setSendProgress(`Lote ${batchNum}/${totalBatches} completado. Esperando ${BATCH_DELAY_MS / 1000}s antes del siguiente lote…`);
        // Interruptible wait
        for (let w = 0; w < BATCH_DELAY_MS / 500; w++) {
          if (cancelRef.current) { cancelled = true; break; }
          await new Promise(r => setTimeout(r, 500));
        }
        if (cancelled) break;
      }
    }

    if (!cancelled) {
      const noEmailAuthors = authors.filter(a => !a.email && a.total > 0);
      const negativeAuthors = authors.filter(a => a.total <= 0);
      const manualExcluded = authors.filter(a => a.email && a.total > 0 && excludedAuthors.has(a.author));
      const now = new Date().toLocaleTimeString('es-ES');

      setSendLog(prev => [
        ...prev,
        ...noEmailAuthors.map(a => ({
          timestamp: now, author: a.author, email: '—', status: 'skipped' as const, reason: 'Sin email', batch: 0,
        })),
        ...negativeAuthors.map(a => ({
          timestamp: now, author: a.author, email: a.email ?? '—', status: 'skipped' as const, reason: `Saldo ≤0 (${formatEur(a.total)})`, batch: 0,
        })),
        ...manualExcluded.map(a => ({
          timestamp: now, author: a.author, email: a.email ?? '—', status: 'skipped' as const, reason: 'Excluido manualmente', batch: 0,
        })),
      ]);
    }

    setSendProgress('');
    setSending(false);
    toast.success(cancelled ? 'Envío detenido por el usuario' : 'Proceso completado');
  };

  const handleCancelSend = () => {
    cancelRef.current = true;
    setSendProgress('Deteniendo envío…');
  };

  const handleTestPdf = async () => {
    const firstAuthor = authors[0];
    if (!firstAuthor) {
      toast.error('No hay autores disponibles para la prueba');
      return;
    }
    setTestingPdf(true);
    try {
      const blob = await generateAuthorDOCX(firstAuthor.author, filteredItems, liquidation);
      const sanitizedName = firstAuthor.author
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_');
      const fileName = `${liquidation.year}/${sanitizedName}.docx`;

      const { error: uploadError } = await supabase.storage
        .from('liquidation-docs')
        .upload(fileName, blob, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

      if (uploadError) throw new Error(`Upload error: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from('liquidation-docs').getPublicUrl(fileName);

      const { data, error } = await supabase.functions.invoke('send-liquidation-email', {
        body: {
          author: firstAuthor.author,
          liquidationYear: liquidation.year,
          docxUrl: urlData.publicUrl,
          testOnly: true,
        },
      });

      if (error) throw error;

      const pdfBytes = Uint8Array.from(atob(data.pdfBase64), c => c.charCodeAt(0));
      const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.pdfFileName;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`PDF generado correctamente para "${firstAuthor.author}"`);
    } catch (err: any) {
      toast.error(`Error en conversión PDF: ${err.message}`);
    } finally {
      setTestingPdf(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail.trim()) {
      toast.error('Introduce un email de prueba');
      return;
    }
    const firstAuthor = authors[0];
    if (!firstAuthor) {
      toast.error('No hay autores disponibles para la prueba');
      return;
    }
    setSendingTest(true);
    try {
      const blob = await generateAuthorDOCX(firstAuthor.author, filteredItems, liquidation);
      const sanitizedName = firstAuthor.author
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_');
      const fileName = `${liquidation.year}/${sanitizedName}.docx`;

      const { error: uploadError } = await supabase.storage
        .from('liquidation-docs')
        .upload(fileName, blob, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      if (uploadError) throw new Error(`Upload error: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from('liquidation-docs').getPublicUrl(fileName);
      const summaryHtml = buildSummaryHtml(firstAuthor.author);

      const { error } = await supabase.functions.invoke('send-liquidation-email', {
        body: {
          author: firstAuthor.author,
          authorEmail: testEmail.trim(),
          liquidationYear: liquidation.year,
          summaryHtml,
          docxUrl: urlData.publicUrl,
          subject: resolveText(subject, firstAuthor.author),
          introText: resolveText(introText, firstAuthor.author),
          outroText: resolveText(outroText, firstAuthor.author),
          ...(fromEmail.trim() ? { fromEmail: fromEmail.trim() } : {}),
        },
      });

      if (error) throw error;
      toast.success(`Email de prueba enviado a ${testEmail.trim()} (datos de "${firstAuthor.author}")`);
    } catch (err: any) {
      toast.error(`Error en envío de prueba: ${err.message}`);
    } finally {
      setSendingTest(false);
    }
  };

  const sendableAuthors = authors.filter(a => a.email && a.total > 0 && !excludedAuthors.has(a.author));
  const withEmail = authors.filter(a => a.email && a.total > 0);
  const withoutEmail = authors.filter(a => !a.email && a.total > 0);
  const excludedNegative = authors.filter(a => a.email && a.total <= 0);
  const manuallyExcluded = authors.filter(a => a.email && a.total > 0 && excludedAuthors.has(a.author));
  const sentCount = authors.filter(a => a.status === 'sent').length;
  const errorCount = authors.filter(a => a.status === 'error').length;

  const toggleExclude = (author: string) => {
    setExcludedAuthors(prev => {
      const next = new Set(prev);
      if (next.has(author)) next.delete(author);
      else next.add(author);
      return next;
    });
  };

  const handleMarkSentUpTo = () => {
    const normalized = normalizeSearch(resumeFrom.trim());
    if (!normalized) return;
    const targetIdx = authors.findIndex(a => normalizeSearch(a.author).includes(normalized));
    if (targetIdx === -1) {
      toast.error('No se encontró ningún autor con ese nombre');
      return;
    }
    const count = targetIdx + 1;
    setAuthors(prev => prev.map((a, i) => i <= targetIdx ? { ...a, status: 'sent' as const } : a));
    toast.success(`${count} autores marcados como enviados (hasta "${authors[targetIdx].author}")`);
    setResumeFrom('');
  };

  const toggleAllVisible = (include: boolean) => {
    const visibleAuthors = authors
      .filter(a => a.email && a.total > 0 && a.status !== 'sent')
      .filter(a => !authorSearch || normalizeSearch(a.author).includes(normalizeSearch(authorSearch)));
    setExcludedAuthors(prev => {
      const next = new Set(prev);
      for (const a of visibleAuthors) {
        if (include) next.delete(a.author);
        else next.add(a.author);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-y-auto">
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="message">✏️ Mensaje</TabsTrigger>
              <TabsTrigger value="recipients">📧 Destinatarios ({sendableAuthors.length})</TabsTrigger>
              <TabsTrigger value="log">📋 Log {sendLog.length > 0 && `(${sendLog.length})`}</TabsTrigger>
            </TabsList>

            <TabsContent value="message" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="from-email" className="text-sm font-medium">
                    Email remitente
                    <span className="text-muted-foreground font-normal ml-2">(vacío = predeterminado)</span>
                  </Label>
                  <Input
                    id="from-email"
                    type="email"
                    placeholder="noreply@tudominio.com"
                    value={fromEmail}
                    onChange={e => setFromEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="subject" className="text-sm font-medium">Asunto</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="mt-1"
                  />
                </div>
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
              <div className="flex gap-3 text-sm flex-wrap items-center">
                <Badge variant="default">{sendableAuthors.length} a enviar</Badge>
                {manuallyExcluded.length > 0 && <Badge variant="secondary">{manuallyExcluded.length} excluidos manual</Badge>}
                {withoutEmail.length > 0 && <Badge variant="secondary">{withoutEmail.length} sin email</Badge>}
                {excludedNegative.length > 0 && <Badge variant="outline" className="border-orange-400 text-orange-600">{excludedNegative.length} excluidos (≤0€)</Badge>}
                {sentCount > 0 && <Badge className="bg-green-600">{sentCount} enviados</Badge>}
                {errorCount > 0 && <Badge variant="destructive">{errorCount} con error</Badge>}
              </div>

              <div className="flex gap-2 items-center">
                <div className="flex gap-1">
                  <Button variant={recipientFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setRecipientFilter('all')}>
                    Todos ({authors.filter(a => a.total > 0).length})
                  </Button>
                  <Button variant={recipientFilter === 'with-email' ? 'default' : 'outline'} size="sm" onClick={() => setRecipientFilter('with-email')}>
                    Con email ({withEmail.length})
                  </Button>
                  <Button variant={recipientFilter === 'without-email' ? 'default' : 'outline'} size="sm" onClick={() => setRecipientFilter('without-email')}>
                    Sin email ({withoutEmail.length})
                  </Button>
                </div>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar autor..."
                    value={authorSearch}
                    onChange={e => setAuthorSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {sentCount === 0 && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="text-sm text-amber-700 shrink-0">Reanudar desde:</span>
                  <Input
                    placeholder="Nombre del último autor enviado…"
                    value={resumeFrom}
                    onChange={e => setResumeFrom(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleMarkSentUpTo()}
                    className="flex-1 h-8 text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={handleMarkSentUpTo} disabled={!resumeFrom.trim()}>
                    Marcar enviados hasta aquí
                  </Button>
                </div>
              )}

              <div className="rounded-md border max-h-[45vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                     <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={withEmail.filter(a => a.status !== 'sent').every(a => !excludedAuthors.has(a.author))}
                          onCheckedChange={(checked) => toggleAllVisible(!!checked)}
                        />
                      </TableHead>
                      <TableHead>Autor</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Libros</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {authors
                      .map((a, idx) => ({ ...a, originalIdx: idx }))
                      .filter(a => a.total > 0) // hide ≤0€ authors without email
                      .filter(a => {
                        if (recipientFilter === 'with-email') return !!a.email;
                        if (recipientFilter === 'without-email') return !a.email;
                        return true;
                      })
                      .filter(a => !authorSearch || normalizeSearch(a.author).includes(normalizeSearch(authorSearch)))
                      .map(a => {
                      const isNegativeExcluded = a.email && a.total <= 0;
                      const isManuallyExcluded = a.email && a.total > 0 && excludedAuthors.has(a.author);
                      const canSend = a.email && a.total > 0 && !excludedAuthors.has(a.author);
                      return (
                      <TableRow key={a.author} className={!a.email ? 'bg-muted/50' : isNegativeExcluded ? 'bg-orange-50 opacity-70' : isManuallyExcluded ? 'opacity-50' : ''}>
                        <TableCell>
                          {a.email && a.total > 0 && a.status !== 'sent' ? (
                            <Checkbox
                              checked={!excludedAuthors.has(a.author)}
                              onCheckedChange={() => toggleExclude(a.author)}
                            />
                          ) : null}
                        </TableCell>
                        <TableCell className="font-medium text-sm">{a.author}</TableCell>
                        <TableCell className="text-sm">{a.email ?? <span className="text-muted-foreground italic">Sin email</span>}</TableCell>
                        <TableCell className="text-right text-sm">{a.bookCount}</TableCell>
                        <TableCell className="text-right text-sm">{formatEur(a.total)}</TableCell>
                        <TableCell>
                          {isNegativeExcluded && <Badge variant="outline" className="border-orange-400 text-orange-600 text-xs">≤0€</Badge>}
                          {isManuallyExcluded && <Badge variant="outline" className="text-xs">Excluido</Badge>}
                          {a.status === 'pending' && canSend && <Badge variant="secondary">Pendiente</Badge>}
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
                          {canSend && a.status !== 'sent' && a.status !== 'sending' && (
                            <Button variant="ghost" size="sm" onClick={() => sendEmail(a, a.originalIdx, 0)} disabled={sending}>
                              <Mail className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="log" className="mt-4 space-y-3">
              {sendProgress && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-md">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {sendProgress}
                </div>
              )}

              {sendLog.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  El log de envío aparecerá aquí cuando inicies el envío masivo.
                </div>
              ) : (
                <>
                   <div className="flex gap-3 text-sm flex-wrap">
                     <Badge variant="default">{sendLog.filter(l => l.status === 'sent').length} enviados</Badge>
                     {sendLog.filter(l => l.status === 'error').length > 0 && (
                       <Badge variant="destructive">{sendLog.filter(l => l.status === 'error').length} con error</Badge>
                     )}
                     {sendLog.filter(l => l.status === 'skipped').length > 0 && (
                       <Badge variant="outline" className="border-orange-400 text-orange-600">{sendLog.filter(l => l.status === 'skipped').length} no enviados</Badge>
                     )}
                   </div>
                   <div className="rounded-md border max-h-[45vh] overflow-y-auto">
                     <Table>
                       <TableHeader>
                         <TableRow>
                           <TableHead className="w-20">Hora</TableHead>
                           <TableHead className="w-16">Lote</TableHead>
                           <TableHead>Autor</TableHead>
                           <TableHead>Email</TableHead>
                           <TableHead>Estado</TableHead>
                           <TableHead>Motivo</TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {sendLog.map((entry, idx) => (
                           <TableRow key={idx} className={entry.status === 'error' ? 'bg-destructive/10' : entry.status === 'skipped' ? 'bg-orange-50' : ''}>
                             <TableCell className="text-xs font-mono">{entry.timestamp}</TableCell>
                             <TableCell className="text-xs text-center">{entry.batch || '—'}</TableCell>
                             <TableCell className="text-sm font-medium">{entry.author}</TableCell>
                             <TableCell className="text-sm">{entry.email}</TableCell>
                             <TableCell>
                               {entry.status === 'sent' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                               {entry.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                               {entry.status === 'skipped' && <AlertCircle className="h-4 w-4 text-orange-500" />}
                             </TableCell>
                             <TableCell className="text-xs max-w-[200px] truncate" title={entry.error || entry.reason}>
                               {entry.error || entry.reason || '—'}
                             </TableCell>
                           </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
        <div className="space-y-3 w-full">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="test-email" className="text-xs text-muted-foreground">
                Enviar email de prueba (usa datos del primer autor)
              </Label>
              <Input
                id="test-email"
                type="email"
                placeholder="tu@email.com"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button variant="secondary" onClick={handleTestEmail} disabled={sendingTest || sending || authors.length === 0 || !testEmail.trim()}>
              {sendingTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Enviar prueba
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            <Button variant="secondary" onClick={handleTestPdf} disabled={testingPdf || sending || authors.length === 0}>
              {testingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              Probar PDF
            </Button>
            {sending ? (
              <Button variant="destructive" onClick={handleCancelSend}>
                <XCircle className="mr-2 h-4 w-4" />
                Parar envío
              </Button>
            ) : (
              <Button onClick={handleSendAll} disabled={sendableAuthors.length === 0 || sentCount === sendableAuthors.length}>
                Enviar a {sendableAuthors.filter(a => a.status !== 'sent').length} autor(es)
              </Button>
            )}
          </div>
        </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
