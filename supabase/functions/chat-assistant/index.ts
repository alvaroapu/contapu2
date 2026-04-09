import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper: run a read-only query against the DB
async function queryDB(sql: string): Promise<{ data: any; error: string | null }> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Safety: only allow SELECT / WITH
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
    return { data: null, error: "Only SELECT queries are allowed" };
  }

  try {
    const { data, error } = await supabase.rpc("execute_readonly_query", {
      query_text: sql,
    });

    console.log("RPC result - data:", JSON.stringify(data)?.slice(0, 500), "error:", error);

    if (error) return { data: null, error: error.message };
    return { data: data ?? [], error: null };
  } catch (e) {
    console.error("queryDB exception:", e);
    return { data: null, error: String(e) };
  }
}

const SYSTEM_PROMPT = `Eres un asistente de datos para la editorial Apuleyo Ediciones. Responde siempre en español. Tienes acceso a una base de datos PostgreSQL.

## ESQUEMA DE LA BASE DE DATOS

### books (catálogo de libros)
- id (uuid PK), isbn (text), ean (text), title (text), author (text), pvp (numeric - precio de venta al público), publication_date (date), status (text: 'active'/'inactive'), maidhisa_ref (text), author_email (text)

### distributors (canales de distribución)
- id (uuid PK), code (text), name (text), is_active (boolean)
- Códigos existentes: 'maidhisa', 'azeta', 'almacen', 'online', 'colegios'

### sales_movements (TABLA PRINCIPAL DE VENTAS - todos los movimientos de ventas)
- id (uuid PK), book_id (uuid → books), distributor_id (uuid → distributors), year (int), month (int), type (text: 'venta', 'devolucion', 'envio'), quantity (int), notes (text)
- IMPORTANTE: Esta es la tabla donde están TODOS los datos de ventas, devoluciones y envíos, desglosados por libro, distribuidor, año y mes.

### liquidations (liquidaciones de royalties por año)
- id (uuid PK), year (int), status ('draft'/'finalized'), distributor_royalty_pct (numeric), online_royalty_pct (numeric), school_royalty_pct (numeric), paid (boolean)

### liquidation_items (detalle de cada libro en una liquidación)
- id (uuid PK), liquidation_id → liquidations, book_id → books
- distributor_units, online_units, school_units (unidades agrupadas por canal)
- distributor_amount, online_amount, school_amount, total_amount (importes calculados con royalties)
- NOTA: Los "units" aquí son totales anuales ya agrupados por canal, NO por distribuidor individual.

### liquidation_author_payments (control de pagos por autor)
- liquidation_id → liquidations, author (text), paid (boolean), paid_at (timestamptz)

## CANALES DE DISTRIBUCIÓN (muy importante)
Los distribuidores se agrupan en 3 canales:
1. **Distribuidoras** (canal distribuidor): code IN ('maidhisa', 'azeta') → Venta en librerías físicas
2. **Online** (canal online): code IN ('almacen', 'online') → Venta por internet
3. **Colegios** (canal colegios): code = 'colegios' → Venta a colegios/instituciones

Cuando el usuario pregunta por "Azeta" o "Maidhisa" se refiere al distribuidor específico, NO al canal.

## FUNCIÓN DE BÚSQUEDA
- normalize_text(input text) → quita acentos y pasa a minúsculas
- SIEMPRE usar para buscar títulos y autores:
  WHERE normalize_text(b.title) ILIKE '%' || normalize_text('texto') || '%'

## CÓMO RESPONDER A PREGUNTAS COMUNES

### "¿Cuántas ventas tiene X libro?" o "ventas de X"
→ Buscar en sales_movements, hacer JOIN con books y distributors:
SELECT b.title, d.name as distribuidor, sm.year, sm.month, sm.type, sm.quantity
FROM sales_movements sm
JOIN books b ON b.id = sm.book_id
JOIN distributors d ON d.id = sm.distributor_id
WHERE normalize_text(b.title) ILIKE '%' || normalize_text('titulo') || '%'
ORDER BY sm.year, sm.month, d.name;

### "Ventas mes a mes de X"
→ Agrupar por año, mes:
SELECT sm.year, sm.month, d.name as distribuidor, sm.type,
  SUM(sm.quantity) as unidades
FROM sales_movements sm
JOIN books b ON b.id = sm.book_id
JOIN distributors d ON d.id = sm.distributor_id
WHERE normalize_text(b.title) ILIKE '%' || normalize_text('titulo') || '%'
GROUP BY sm.year, sm.month, d.name, sm.type
ORDER BY sm.year, sm.month;

### "Ventas por Azeta" (distribuidor específico)
→ Filtrar por d.code = 'azeta'

### "Los 5 libros más vendidos"
→ Usar ventas netas (ventas - devoluciones):
SELECT b.title, b.author,
  SUM(CASE WHEN sm.type='venta' THEN sm.quantity ELSE 0 END) as ventas,
  SUM(CASE WHEN sm.type='devolucion' THEN sm.quantity ELSE 0 END) as devoluciones,
  SUM(CASE WHEN sm.type='venta' THEN sm.quantity ELSE 0 END) -
  SUM(CASE WHEN sm.type='devolucion' THEN sm.quantity ELSE 0 END) as neto
FROM sales_movements sm
JOIN books b ON b.id = sm.book_id
WHERE sm.year = 2025
GROUP BY b.title, b.author
ORDER BY neto DESC LIMIT 5;

### "Liquidación de X autor"
→ Consultar liquidation_items JOIN books:
SELECT b.title, li.distributor_units, li.online_units, li.school_units,
  li.total_amount
FROM liquidation_items li
JOIN books b ON b.id = li.book_id
JOIN liquidations l ON l.id = li.liquidation_id
WHERE normalize_text(b.author) ILIKE '%' || normalize_text('autor') || '%'
  AND l.year = 2024;

### "¿Cuántos autores están pagados?"
→ Consultar liquidation_author_payments:
SELECT COUNT(*) FILTER (WHERE paid) as pagados,
  COUNT(*) as total
FROM liquidation_author_payments
WHERE liquidation_id = '...';

## REGLAS IMPORTANTES
1. SIEMPRE usa normalize_text() para comparar títulos y autores
2. Ventas netas = ventas - devoluciones
3. Sé conciso pero informativo
4. Usa tablas markdown cuando haya varias filas
5. Si no encuentras datos, dilo claramente
6. SOLO genera consultas SELECT
7. Añade LIMIT 50 como máximo
8. Si una consulta falla, simplifica la SQL y vuelve a intentarlo
9. NO preguntes al usuario qué tabla usar - tú conoces el esquema, úsalo directamente
10. Si el usuario pregunta por ventas → ve a sales_movements
11. Si el usuario pregunta por liquidaciones/royalties → ve a liquidation_items
12. Cuando muestres meses, usa nombres: Ene, Feb, Mar, Abr, May, Jun, Jul, Ago, Sep, Oct, Nov, Dic

Cuando necesites consultar la base de datos, usa la herramienta query_database. No dudes en hacer varias consultas si es necesario.`;

const tools = [
  {
    type: "function",
    function: {
      name: "query_database",
      description:
        "Execute a read-only SQL SELECT query against the database to answer the user's question. Always use this to get real data.",
      parameters: {
        type: "object",
        properties: {
          sql: {
            type: "string",
            description: "A valid PostgreSQL SELECT query. Must start with SELECT or WITH.",
          },
          explanation: {
            type: "string",
            description: "Brief explanation of what this query does (in Spanish)",
          },
        },
        required: ["sql"],
      },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build conversation with system prompt
    const aiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    // First call - may trigger tool use
    let response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
        tools,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas peticiones. Espera un momento." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos agotados." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", status, t);
      throw new Error("AI gateway error");
    }

    let result = await response.json();
    let assistantMessage = result.choices?.[0]?.message;

    // Handle tool calls (up to 3 iterations)
    let iterations = 0;
    while (assistantMessage?.tool_calls && iterations < 3) {
      iterations++;
      const toolResults: any[] = [];

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === "query_database") {
          const args = JSON.parse(toolCall.function.arguments);
          console.log("Executing query:", args.sql);
          const { data, error } = await queryDB(args.sql);

          toolResults.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(error ? { error } : { results: data, row_count: Array.isArray(data) ? data.length : 0 }),
          });
        }
      }

      // Follow up with tool results
      aiMessages.push(assistantMessage);
      aiMessages.push(...toolResults);

      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: aiMessages,
          tools,
          tool_choice: "auto",
        }),
      });

      if (!response.ok) throw new Error("AI gateway error on tool follow-up");
      result = await response.json();
      assistantMessage = result.choices?.[0]?.message;
    }

    const content = assistantMessage?.content || "No pude generar una respuesta.";

    return new Response(JSON.stringify({ reply: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("chat-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
