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

  const { data, error } = await supabase.rpc("execute_readonly_query", {
    query_text: sql,
  });

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

const SYSTEM_PROMPT = `Eres un asistente de datos para la editorial Apuleyo Ediciones. Tienes acceso a una base de datos PostgreSQL con las siguientes tablas:

## Tablas principales:

### books
- id (uuid), isbn (text), ean (text), title (text), author (text), pvp (numeric), publication_date (date), status (text: 'active'/'inactive'), maidhisa_ref (text), author_email (text), created_at, updated_at

### distributors
- id (uuid), code (text: 'maidhisa', 'azeta', 'almacen', 'online', 'colegios'), name (text), is_active (boolean)

### sales_movements
- id (uuid), book_id (uuid → books), distributor_id (uuid → distributors), year (int), month (int), type (text: 'venta', 'devolucion', 'envio'), quantity (int), notes (text), import_batch_id (uuid)

### liquidations
- id (uuid), year (int), status (text: 'draft'/'finalized'), distributor_royalty_pct (numeric), online_royalty_pct (numeric), school_royalty_pct (numeric), created_at, finalized_at, paid (boolean)

### liquidation_items
- id (uuid), liquidation_id (uuid → liquidations), book_id (uuid → books), distributor_units (int), online_units (int), school_units (int), distributor_amount (numeric), online_amount (numeric), school_amount (numeric), total_amount (numeric)

### liquidation_author_payments
- id (uuid), liquidation_id (uuid → liquidations), author (text), paid (boolean), paid_at (timestamptz)

## Canales de distribución:
- Distribuidoras: distributors con code IN ('maidhisa', 'azeta')
- Online/Almacén: distributors con code IN ('almacen', 'online')
- Colegios: distributors con code = 'colegios'

## Función disponible para búsqueda insensible a acentos:
- normalize_text(input text) → text (quita acentos y pasa a minúsculas)

## Reglas:
- Usa normalize_text() para comparar títulos y autores (ej: WHERE normalize_text(b.title) ILIKE '%' || normalize_text('búsqueda') || '%')
- Ventas netas = ventas - devoluciones
- Responde siempre en español
- Sé conciso pero informativo
- Cuando muestres datos, usa formato de tabla markdown si hay varias filas
- Si no encuentras datos, dilo claramente
- SOLO genera consultas SELECT, nunca modifiques datos
- Limita las consultas a 50 filas máximo con LIMIT

Cuando necesites consultar la base de datos, usa la herramienta query_database.`;

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
