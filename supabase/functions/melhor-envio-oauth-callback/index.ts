import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Configuração obrigatória ausente: ${name}.`);
  return value;
};

const REQUESTED_SCOPES = [
  "cart-read", "cart-write", "orders-read", "purchases-read",
  "shipping-calculate", "shipping-checkout", "shipping-generate",
  "shipping-preview", "shipping-print", "shipping-tracking",
  "ecommerce-shipping",
].join(" ");

const page = (title: string, message: string, ok: boolean, status = 200) =>
  new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0b;color:#fff;font-family:Arial,sans-serif}.card{width:min(520px,calc(100% - 40px));padding:36px;border:1px solid ${ok ? "#35d07f" : "#ff5d53"};border-radius:24px;background:#151515;text-align:center;box-sizing:border-box}.mark{width:62px;height:62px;margin:auto;display:grid;place-items:center;border-radius:50%;background:${ok ? "#35d07f" : "#ff5d53"};color:#080808;font-size:30px;font-weight:900}h1{font-size:25px}p{color:#bbb;line-height:1.6}a{display:inline-grid;place-items:center;margin-top:12px;padding:13px 20px;border-radius:12px;background:#ffd400;color:#111;font-weight:900;text-decoration:none}</style></head><body><main class="card"><div class="mark">${ok ? "✓" : "!"}</div><h1>${title}</h1><p>${message}</p><a href="https://onlycarsclub.com.br/admin.html">Voltar ao painel</a></main></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });

Deno.serve(async (request) => {
  if (request.method !== "GET") return page("Método não permitido", "Abra esta função somente pelo retorno de autorização do Melhor Envio.", false, 405);

  try {
    const url = new URL(request.url);
    const providerError = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (providerError) return page("Autorização cancelada", providerError, false, 400);

    const code = url.searchParams.get("code") || "";
    const receivedState = url.searchParams.get("state") || "";
    const expectedState = requiredEnv("MELHOR_ENVIO_OAUTH_STATE");
    if (!code) return page("Código ausente", "O Melhor Envio não enviou o código de autorização.", false, 400);
    if (!receivedState || receivedState !== expectedState) return page("Retorno inválido", "A validação de segurança da autorização falhou. Inicie o processo novamente.", false, 403);

    const baseUrl = requiredEnv("MELHOR_ENVIO_BASE_URL").replace(/\/+$/, "");
    const clientId = requiredEnv("MELHOR_ENVIO_CLIENT_ID");
    const clientSecret = requiredEnv("MELHOR_ENVIO_CLIENT_SECRET");
    const redirectUri = requiredEnv("MELHOR_ENVIO_REDIRECT_URI");

    const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Only Cars Club (contato@onlycarsclub.com.br)" },
      body: JSON.stringify({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }),
    });
    const token = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !token?.access_token) {
      console.error("Melhor Envio OAuth exchange failed:", tokenResponse.status, token);
      return page("Não foi possível conectar", "O código foi recebido, mas a troca pelo token falhou. Confira o aplicativo e a URL de retorno.", false, 502);
    }

    const expiresIn = Number(token.expires_in);
    const expiresAt = Number.isFinite(expiresIn) ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.from("melhor_envio_oauth_tokens").upsert({
      id: 1,
      access_token: String(token.access_token),
      refresh_token: token.refresh_token ? String(token.refresh_token) : null,
      token_type: token.token_type ? String(token.token_type) : "Bearer",
      expires_at: expiresAt,
      // Algumas respostas do Melhor Envio omitem `scope`, mesmo quando a
      // autorização foi concedida com os escopos enviados na URL.
      scope: token.scope ? String(token.scope) : REQUESTED_SCOPES,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw new Error(error.message);

    return page("Melhor Envio conectado", `A autorização foi atualizada no ambiente ${baseUrl.includes("sandbox") ? "Sandbox" : "de Produção"}. Você já pode voltar ao painel da Only.`, true);
  } catch (error) {
    console.error("Melhor Envio OAuth callback error:", error);
    return page("Erro ao conectar", error instanceof Error ? error.message : "Não foi possível salvar a autorização.", false, 500);
  }
});
