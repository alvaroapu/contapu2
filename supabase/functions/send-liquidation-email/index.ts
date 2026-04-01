import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Convert a DOCX file to PDF using the Gotenberg service.
 */
async function convertDocxToPdf(docxBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const gotenbergUrl = Deno.env.get("GOTENBERG_URL") ||
    "https://apuleyo-gotenberg.opxlub.easypanel.host/forms/libreoffice/convert";
  const gotenbergUser = Deno.env.get("GOTENBERG_API_BASIC_AUTH_USERNAME") || "apuleyo";
  const gotenbergPass = Deno.env.get("GOTENBERG_API_BASIC_AUTH_PASSWORD") || "";

  const form = new FormData();
  form.append(
    "files",
    new Blob([docxBuffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    "document.docx",
  );

  const headers: Record<string, string> = {};
  if (gotenbergUser && gotenbergPass) {
    headers["Authorization"] = "Basic " + btoa(`${gotenbergUser}:${gotenbergPass}`);
  }

  const res = await fetch(gotenbergUrl, {
    method: "POST",
    headers,
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gotenberg conversion failed (${res.status}): ${errText}`);
  }

  return res.arrayBuffer();
}

/**
 * Encode an ArrayBuffer to a base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      author,
      authorEmail,
      liquidationYear,
      summaryHtml,
      docxUrl,
      subject,
      introText,
      outroText,
      fromEmail: customFromEmail,
      testOnly,
    } = await req.json();

    // --- Convert DOCX to PDF via Gotenberg ---
    let pdfBuffer: Uint8Array | null = null;
    const sanitizedAuthor = (author || "test")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_\-]/g, "_")
      .replace(/_+/g, "_");
    const pdfFileName = `Liquidacion_${liquidationYear}_${sanitizedAuthor}.pdf`;

    if (docxUrl) {
      const docxRes = await fetch(docxUrl);
      if (!docxRes.ok) {
        throw new Error(`Failed to fetch DOCX from storage: ${docxRes.status}`);
      }
      const docxArrayBuffer = await docxRes.arrayBuffer();
      const pdfArrayBuffer = await convertDocxToPdf(docxArrayBuffer);
      pdfBuffer = new Uint8Array(pdfArrayBuffer);
    }

    // Test mode: return the PDF without sending email
    if (testOnly) {
      if (!pdfBuffer) {
        return new Response(
          JSON.stringify({ error: "No DOCX URL provided for test conversion" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const pdfBase64 = arrayBufferToBase64(pdfBuffer.buffer);
      return new Response(
        JSON.stringify({ success: true, pdfBase64, pdfFileName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!author || !authorEmail || !liquidationYear || !summaryHtml) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const fromEmail = customFromEmail || smtpUser;

    if (!smtpUser || !smtpPass) {
      return new Response(
        JSON.stringify({ error: "SMTP credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Convert intro/outro newlines to <br> for HTML
    const introHtml = (introText || `Estimado/a ${author},\n\nLe enviamos el informe de liquidación correspondiente al año ${liquidationYear}.`)
      .replace(/\n/g, "<br>");
    const outroHtml = (outroText || "")
      .replace(/\n/g, "<br>");

    const emailBody = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 700px; margin: 0 auto; padding: 20px;">
  <div style="margin-bottom: 20px;">${introHtml}</div>

  <h3 style="color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 5px;">Resumen de ventas</h3>
  ${summaryHtml}

  ${pdfBuffer ? `<p style="margin-top: 20px; color: #666; font-size: 13px;">📎 Se adjunta el informe completo en formato PDF.</p>` : ""}

  ${outroHtml ? `<div style="margin-top: 20px;">${outroHtml}</div>` : ""}

  <hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 12px; color: #999;">Este email ha sido enviado automáticamente. Por favor, no responda a este mensaje.</p>
</body>
</html>`;

    const emailSubject = subject || `Liquidación ${liquidationYear} - Apuleyo Ediciones`;

    // Build attachments array for denomailer
    const attachments: Array<{ filename: string; content: Uint8Array; contentType: string; encoding: string }> = [];
    if (pdfBuffer) {
      attachments.push({
        filename: pdfFileName,
        content: pdfBuffer,
        contentType: "application/pdf",
        encoding: "binary",
      });
    }

    // Send via SMTP (IONOS)
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.ionos.es",
        port: 587,
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPass,
        },
      },
    });

    await client.send({
      from: fromEmail!,
      to: authorEmail,
      subject: emailSubject,
      html: emailBody,
      attachments,
    });

    await client.close();

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
