import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      author,
      authorEmail,
      liquidationYear,
      subject,
      introText,
      outroText,
      fromEmail: customFromEmail,
    } = await req.json();

    if (!author || !authorEmail || !liquidationYear) {
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

    const defaultIntro = `Estimado/a ${author},\n\nNos ponemos en contacto con usted para informarle sobre el estado de la liquidación correspondiente al año ${liquidationYear}.\n\nEn estos momentos, nuestro equipo se encuentra en el proceso de recopilación y validación de los datos de todos los autores para asegurar que la gestión se realice de forma correcta.\n\nLe informamos de que, una vez completada esta fase de verificación, se procederá al abono de su liquidación en un plazo máximo de 90 días.\n\nAgradecemos de antemano su colaboración y paciencia durante este proceso administrativo.\n\nQuedamos a su entera disposición para cualquier duda o consulta.\n\nUn cordial saludo,\n\nApuleyo Ediciones`;

    const introHtml = (introText || defaultIntro).replace(/\n/g, "<br>");
    const outroHtml = (outroText || "").replace(/\n/g, "<br>");

    const emailBody = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 700px; margin: 0 auto; padding: 20px;">
  <div style="margin-bottom: 20px;">${introHtml}</div>

  ${outroHtml ? `<div style="margin-top: 20px;">${outroHtml}</div>` : ""}

  <hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 12px; color: #999;">Este email ha sido enviado automáticamente. Por favor, no responda a este mensaje.</p>
</body>
</html>`;

    const emailSubject = subject || `Actualizacion sobre el proceso de liquidacion ${liquidationYear} - Apuleyo Ediciones`;

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.ionos.es",
        port: 465,
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
