import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

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
    const { author, authorEmail, liquidationYear, summaryHtml, docxUrl } =
      await req.json();

    if (!author || !authorEmail || !liquidationYear || !summaryHtml) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authToken = Deno.env.get("ACUMBAMAIL_AUTH_TOKEN");
    const fromEmail = Deno.env.get("ACUMBAMAIL_FROM_EMAIL");

    if (!authToken || !fromEmail) {
      return new Response(
        JSON.stringify({ error: "Acumbamail credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build email HTML body
    const emailBody = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 700px; margin: 0 auto; padding: 20px;">
  <p>Estimado/a <strong>${author}</strong>,</p>
  <p>Le enviamos el informe de liquidación correspondiente al año <strong>${liquidationYear}</strong>.</p>
  
  <h3 style="color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 5px;">Resumen de ventas</h3>
  ${summaryHtml}
  
  ${docxUrl ? `<p style="margin-top: 20px;"><a href="${docxUrl}" style="display: inline-block; background-color: #1a56db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">📄 Descargar informe completo (DOCX)</a></p>` : ""}
  
  <hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 12px; color: #999;">Este email ha sido enviado automáticamente. Por favor, no responda a este mensaje.</p>
</body>
</html>`;

    // Send via Acumbamail REST API
    const formData = new FormData();
    formData.append("auth_token", authToken);
    formData.append("from_email", fromEmail);
    formData.append("to_email", authorEmail);
    formData.append("subject", `Liquidación ${liquidationYear} - Apuleyo Ediciones`);
    formData.append("body", emailBody);

    const res = await fetch("https://acumbamail.com/api/1/sendOne/", {
      method: "POST",
      body: formData,
    });

    const resText = await res.text();

    if (!res.ok && res.status !== 200 && res.status !== 201) {
      console.error("Acumbamail error:", res.status, resText);
      return new Response(
        JSON.stringify({ error: `Acumbamail error: ${res.status}`, details: resText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
