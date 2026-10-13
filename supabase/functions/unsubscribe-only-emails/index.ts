import { createClient } from "npm:@supabase/supabase-js@2.56.0";

const SITE = "https://onlycarsclub.com.br";
const headers = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
// No account login required: the high-entropy per-recipient token grants only opt-out.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const url = new URL(req.url);
  let token = url.searchParams.get("token") || "";
  if (req.method === "GET") {
    // Email security scanners following a link must never unsubscribe anyone.
    return new Response(null, { status: 303, headers: { ...headers,
      Location: `${SITE}/descadastro.html#token=${encodeURIComponent(token)}` } });
  }
  if (req.method !== "POST") return new Response(null, { status: 405, headers });
  if (!token) {
    try { token = (await req.json()).token || ""; } catch { /* Invalid request below. */ }
  }
  if (typeof token !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return Response.json({ error: "Link inválido. Use o link recebido no e-mail." }, { status: 400, headers });
  }
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!service || !supabaseUrl) return Response.json({ error: "Tente novamente em instantes." }, { status: 503, headers });
  const db = createClient(supabaseUrl, service, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("only_email_unsubscribe", { p_token: token });
  if (error) return Response.json({ error: "Não foi possível salvar. Tente novamente." }, { status: 503, headers });
  if (!data) return Response.json({ error: "Link inválido. Use o link recebido no e-mail." }, { status: 400, headers });
  // RFC 8058 one-click POST succeeds with an empty 200 response; repeated calls are safe.
  return new Response(null, { status: 200, headers });
});
