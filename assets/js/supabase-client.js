(function () {
  "use strict";

  const PROJECT_URL = "https://wxxgcnyolpioyiaepkvs.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_dUlxorfC7dA7uggFucMu_g_71G-nURX";
  const STORAGE_KEY = "onlycars.supabase.session";

  class SupabaseRequestError extends Error {
    constructor(message, status, details) {
      super(message);
      this.name = "SupabaseRequestError";
      this.status = status;
      this.details = details;
    }
  }

  function readStoredSession() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return stored && stored.access_token ? stored : null;
    } catch (_) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function storeSession(session) {
    if (!session || !session.access_token) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const expiresAt = session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
    const safeSession = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: expiresAt,
      token_type: session.token_type || "bearer",
      user: session.user || null
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeSession));
    return safeSession;
  }

  async function request(path, options = {}) {
    const headers = {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${options.token || PUBLISHABLE_KEY}`,
      ...options.headers
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(`${PROJECT_URL}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const raw = await response.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); } catch (_) { data = raw; }
    }
    if (!response.ok) {
      const message = data?.msg || data?.message || data?.error_description || data?.error || "Não foi possível concluir a solicitação.";
      throw new SupabaseRequestError(message, response.status, data);
    }
    return data;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function authenticatedRequest(path, options = {}) {
    const delays = [700, 1200, 2100];
    let attempt = 0;
    while (true) {
      try {
        return await request(path, options);
      } catch (error) {
        const isClockSkew = error?.message?.toLowerCase().includes("jwt issued at future");
        if (!isClockSkew || attempt >= delays.length) throw error;
        await wait(delays[attempt]);
        attempt += 1;
      }
    }
  }

  async function refreshSession(session) {
    if (!session?.refresh_token) return null;
    try {
      const refreshed = await request("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: session.refresh_token }
      });
      return storeSession(refreshed);
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
      throw error;
    }
  }

  async function getSession() {
    const session = readStoredSession();
    if (!session) return null;
    if (Number(session.expires_at || 0) <= Math.floor(Date.now() / 1000) + 60) {
      return refreshSession(session);
    }
    return session;
  }

  async function signUp({ name, email, password }) {
    const redirectTo = `${location.origin}/confirmacao-email.html`;
    const result = await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      body: { email, password, data: { name } }
    });
    if (result?.access_token) storeSession(result);
    return result;
  }

  async function signIn({ email, password }) {
    const result = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password }
    });
    return storeSession(result);
  }

  async function signOut() {
    const session = readStoredSession();
    try {
      if (session?.access_token) {
        await request("/auth/v1/logout", { method: "POST", token: session.access_token });
      }
    } finally {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  async function sendPasswordReset(email) {
    const redirectTo = `${location.origin}/redefinir-senha.html`;
    return request(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      body: { email }
    });
  }

  async function updatePassword(password) {
    const session = await getSession();
    if (!session) throw new SupabaseRequestError("Link inválido ou expirado.", 401);
    const user = await request("/auth/v1/user", {
      method: "PUT",
      token: session.access_token,
      body: { password }
    });
    storeSession({ ...session, user });
    return user;
  }

  function consumeAuthRedirect() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const redirectError = hash.get("error_description") || hash.get("error");
    if (redirectError) {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      return { error: redirectError };
    }
    const accessToken = hash.get("access_token");
    if (!accessToken) return null;
    const session = storeSession({
      access_token: accessToken,
      refresh_token: hash.get("refresh_token"),
      expires_in: Number(hash.get("expires_in") || 3600),
      token_type: hash.get("token_type") || "bearer",
      user: null
    });
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    return { session, type: hash.get("type") };
  }

  async function getUser() {
    const session = await getSession();
    if (!session) return null;
    const user = await authenticatedRequest("/auth/v1/user", { token: session.access_token });
    storeSession({ ...session, user });
    return user;
  }

  async function rest(path, options = {}) {
    const session = await getSession();
    if (!session) throw new SupabaseRequestError("Faça login para continuar.", 401);
    return authenticatedRequest(`/rest/v1/${path}`, {
      ...options,
      token: session.access_token,
      headers: { Accept: "application/json", ...options.headers }
    });
  }

  async function publicRest(path, options = {}) {
    return request(`/rest/v1/${path}`, {
      ...options,
      headers: { Accept: "application/json", ...options.headers }
    });
  }

  async function invokeFunction(name, body) {
    if (!/^[a-z0-9-]+$/.test(name)) throw new SupabaseRequestError("Função inválida.", 400);
    return request(`/functions/v1/${name}`, {
      method: "POST",
      body
    });
  }

  window.OnlySupabase = {
    getSession,
    getUser,
    signUp,
    signIn,
    signOut,
    sendPasswordReset,
    updatePassword,
    consumeAuthRedirect,
    invokeFunction,
    publicRest,
    rest,
    projectUrl: PROJECT_URL
  };
})();
