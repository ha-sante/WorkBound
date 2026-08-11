// secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, ABUSE_FRICTION_KEY
// kv: workbound_kv

import { env } from "cloudflare:workers";

const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, ABUSE_FRICTION_KEY, workbound_kv } = env;

const base64url_encode = (bytes) => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const random_token = () => base64url_encode(crypto.getRandomValues(new Uint8Array(32)));

const code_challenge_s256 = async (code_verifier) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code_verifier),
  );
  return base64url_encode(new Uint8Array(digest));
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/image_proxy") {
      return handle_image_proxy(request, url);
    }

    if (url.pathname === "/auth/google") {
      return handle_auth_google(url);
    }

    if (url.pathname === "/auth/google/callback") {
      return handle_auth_callback(url);
    }

    if (url.pathname.startsWith("/auth/session/")) {
      const id = url.pathname.slice("/auth/session/".length);
      return handle_auth_session(id);
    }

    if (url.pathname === "/auth/refresh") {
      return handle_auth_refresh(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handle_image_proxy(request, url) {
  if (url.searchParams.get("k") !== ABUSE_FRICTION_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  const target = url.searchParams.get("url");
  if (!target) {
    return new Response("Missing url", { status: 400 });
  }

  const response = await fetch(target, {
    headers: { "User-Agent": "Workbound-Mail-Proxy" },
  });

  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "image/*",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

async function handle_auth_google(url) {
  const port = url.searchParams.get("port") || "49123";

  const state = random_token();
  const code_verifier = random_token();
  const code_challenge = await code_challenge_s256(code_verifier);

  await workbound_kv.put(`state:${state}`, JSON.stringify({ port, code_verifier }), { expirationTtl: 600 });

  const SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/gmail.settings.basic",
    "https://www.googleapis.com/auth/contacts.readonly",
  ];

  const params = new URLSearchParams({
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: `${url.origin}/auth/google/callback`,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge,
    code_challenge_method: "S256",
  });

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
}

async function handle_auth_callback(url) {
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(`OAuth error: ${error}`, { status: 400 });
  }

  if (!state || !code) {
    return new Response("Missing state or code", { status: 400 });
  }

  const stateEntry = await workbound_kv.get(`state:${state}`);
  if (!stateEntry) {
    return new Response("Invalid or expired state", { status: 400 });
  }

  await workbound_kv.delete(`state:${state}`);

  let port = "49123";
  let code_verifier = "";
  try {
    const parsed = JSON.parse(stateEntry);
    port = parsed.port || port;
    code_verifier = parsed.code_verifier || code_verifier;
  } catch {}

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: `${url.origin}/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier,
    }),
  });

  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    return new Response(`Token exchange failed: ${body}`, { status: 502 });
  }

  const tokens = await tokenResp.json();

  const sessionId = random_token();
  await workbound_kv.put(`session:${sessionId}`, JSON.stringify(tokens), { expirationTtl: 60 });

  return Response.redirect(`http://127.0.0.1:${port}/callback?session=${sessionId}`, 302);
}

async function handle_auth_session(id) {
  const key = `session:${id}`;
  const entry = await workbound_kv.get(key);
  if (!entry) {
    return new Response("Session not found or expired", { status: 404 });
  }

  await workbound_kv.delete(key);

  return new Response(entry, {
    headers: { "Content-Type": "application/json" },
  });
}

async function handle_auth_refresh(request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { refresh_token } = body;
  if (!refresh_token) {
    return new Response("Missing refresh_token", { status: 400 });
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    if (resp.status === 400 && errBody.includes("invalid_grant")) {
      return new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(`Refresh failed: ${errBody}`, { status: 502 });
  }

  const tokens = await resp.json();
  return new Response(JSON.stringify(tokens), {
    headers: { "Content-Type": "application/json" },
  });
}
