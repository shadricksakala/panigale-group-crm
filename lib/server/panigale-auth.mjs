const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_SECONDS = 14 * 24 * 60 * 60;
let cachedJwks;
let cachedJwksAt = 0;

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value) {
  const clean = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(clean + "=".repeat((4 - clean.length % 4) % 4)), character => character.charCodeAt(0));
}

function parseJwtPart(value) {
  return JSON.parse(decoder.decode(decodeBase64Url(value)));
}

function randomToken(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return base64Url(bytes);
}

async function sha256(value) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function challenge(verifier) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
}

function baseUrl(env) {
  const configured = String(env.CRM_PUBLIC_URL || "").trim();
  if (!configured) throw new Response("CRM_PUBLIC_URL is not configured.", { status: 503 });
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Response("CRM_PUBLIC_URL must use HTTPS.", { status: 503 });
  }
  return url;
}

function issuerUrl(env) {
  const value = String(env.AUTH_ISSUER || "https://auth.panigale.tech").replace(/\/$/, "");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Response("Panigale Auth issuer must use HTTPS.", { status: 503 });
  }
  return value;
}

function cookieName(env, kind) {
  const secure = baseUrl(env).protocol === "https:";
  const suffix = kind === "flow" ? "oidc_flow" : "session";
  return secure ? `__Host-crm_${suffix}` : `crm_${suffix}`;
}

function cookieValue(request, name) {
  const entry = request.headers.get("cookie")?.split(";").map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : "";
}

function cookieHeader(env, kind, value, maxAge) {
  const secure = baseUrl(env).protocol === "https:";
  const name = cookieName(env, kind);
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

function redirectResponse(url, cookieHeaders = []) {
  const headers = new Headers({ location: url.toString(), "cache-control": "no-store" });
  for (const cookie of cookieHeaders) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function safeReturnTo(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.startsWith("/api/")) return "/crm";
  return value.slice(0, 300);
}

async function getJwks(issuer, force = false) {
  const now = Date.now();
  if (!force && cachedJwks && now - cachedJwksAt < 5 * 60 * 1000) return cachedJwks;
  const response = await fetch(`${issuer}/api/oidc/jwks`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Response("Panigale Auth signing keys are unavailable.", { status: 503 });
  const value = await response.json();
  if (!Array.isArray(value?.keys)) throw new Response("Panigale Auth signing keys are invalid.", { status: 503 });
  cachedJwks = value.keys;
  cachedJwksAt = now;
  return cachedJwks;
}

async function verifyIdToken(token, { issuer, audience, nonce }) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Response("Panigale Auth returned an invalid ID token.", { status: 401 });
  let header, claims;
  try { header = parseJwtPart(parts[0]); claims = parseJwtPart(parts[1]); }
  catch { throw new Response("Panigale Auth returned an invalid ID token.", { status: 401 }); }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Response("Panigale Auth used an unsupported signing key.", { status: 401 });
  const keys = await getJwks(issuer);
  let key = keys.find(candidate => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!key) key = (await getJwks(issuer, true)).find(candidate => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!key || (key.alg && key.alg !== "RS256") || (key.use && key.use !== "sig")) throw new Response("Panigale Auth signing key was not found.", { status: 401 });
  const publicKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signatureValid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, decodeBase64Url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const validTimes = typeof claims.exp === "number" && Number.isFinite(claims.exp) && typeof claims.iat === "number" && Number.isFinite(claims.iat) && (claims.nbf === undefined || (typeof claims.nbf === "number" && Number.isFinite(claims.nbf)));
  const validAuthorizedParty = audiences.length <= 1 ? (!claims.azp || claims.azp === audience) : claims.azp === audience;
  if (!signatureValid || claims.token_use !== "id" || claims.iss !== issuer || !audiences.includes(audience) || !validAuthorizedParty || !validTimes || claims.exp <= now || claims.iat > now + 60 || (claims.nbf || 0) > now || claims.nonce !== nonce) {
    throw new Response("Panigale Auth ID token validation failed.", { status: 401 });
  }
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 200) throw new Response("Panigale Auth identity is invalid.", { status: 401 });
  if (claims.email_verified !== true || typeof claims.email !== "string" || claims.email.length > 254) throw new Response("A verified Panigale Auth email is required.", { status: 403 });
  return { subject: claims.sub, email: claims.email.trim().toLowerCase(), name: typeof claims.name === "string" ? claims.name.slice(0, 160) : claims.email.trim() };
}

const UNIT_SEEDS = [
  ["panipay", "PaniPay", "Payments and invoicing", "https://panipay.panigale.tech"],
  ["futurecampus", "FutureCampus", "Education technology", "https://futurecampus.africa"],
  ["euroza", "Euroza Consultancy", "Strategy and advisory", "https://euroza.panigale.tech"],
  ["ebt", "EBT", "Business technology", "https://ebt.panigale.tech"],
  ["zedpreneurs", "ZedPreneurs", "Entrepreneurship and skills", "https://zedprenuers.com"],
  ["strongpoint-capital", "StrongPoint Capital", "Fund management", "https://strongpoint.panigale.tech"],
  ["ultra-fx-academy", "Ultra FX Academy", "Financial education", "https://ultrafxacademy.online"],
  ["proventus-show", "The Proventus Show", "Media and thought leadership", "https://pshow.panigale.tech"],
  ["asil", "ASIL Zambia", "Advanced AI research", "https://panigale.tech/asil/"],
];

const DEFAULT_STAGES = [
  ["discovery", "Discovery", "blue", 0, 0, 0],
  ["qualified", "Qualified", "violet", 1, 0, 0],
  ["proposal", "Proposal", "amber", 2, 0, 0],
  ["negotiation", "Negotiation", "orange", 3, 0, 0],
  ["won", "Won", "green", 4, 1, 0],
  ["lost", "Closed lost", "gray", 5, 0, 1],
];

async function bootstrapOwner(db, user) {
  const claimed = await db.prepare("SELECT value FROM crm_system_settings WHERE key='bootstrap_owner_claimed'").first();
  if (claimed) return;
  const insert = await db.prepare("INSERT OR IGNORE INTO crm_system_settings(key,value) VALUES('bootstrap_owner_claimed',?)").bind(user.id).run();
  if (!insert.meta?.changes) return;
  let tenant = await db.prepare("SELECT id FROM crm_tenants WHERE slug='panigale-group'").first();
  if (!tenant) {
    const tenantId = crypto.randomUUID();
    await db.prepare("INSERT INTO crm_tenants(id,name,slug,created_by) VALUES(?,'Panigale Group','panigale-group',?)").bind(tenantId, user.id).run();
    tenant = { id: tenantId };
  }
  await db.prepare("INSERT OR IGNORE INTO crm_memberships(tenant_id,user_id,role,granted_by) VALUES(?,?,'superadmin',?)").bind(tenant.id, user.id, user.id).run();
  for (const [slug, name, category, website] of UNIT_SEEDS) {
    const unitId = crypto.randomUUID();
    await db.prepare("INSERT OR IGNORE INTO crm_units(id,tenant_id,name,slug,category,website) VALUES(?,?,?,?,?,?)").bind(unitId, tenant.id, name, slug, category, website).run();
    const unit = await db.prepare("SELECT id FROM crm_units WHERE tenant_id=? AND slug=?").bind(tenant.id, slug).first();
    await db.prepare("INSERT OR IGNORE INTO crm_unit_access(tenant_id,unit_id,user_id,unit_role,granted_by) VALUES(?,?,?,'manager',?)").bind(tenant.id, unit.id, user.id, user.id).run();
    for (const [stageSlug, stageName, color, position, isWon, isLost] of DEFAULT_STAGES) {
      await db.prepare("INSERT OR IGNORE INTO crm_pipeline_stages(id,tenant_id,unit_id,name,slug,color,position,is_won,is_lost,active) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), tenant.id, unit.id, stageName, stageSlug, color, position, isWon, isLost, 1).run();
    }
  }
  await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,'crm.bootstrap','tenant',?,'{}')")
    .bind(crypto.randomUUID(), tenant.id, user.id, tenant.id).run();
}

export async function beginPanigaleAuth(request, env) {
  if (!env.CRM_DB) throw new Response("CRM database is unavailable.", { status: 503 });
  const clientId = String(env.PANIGALE_AUTH_CLIENT_ID || "");
  if (!clientId) throw new Response("Panigale Auth app registration is not configured.", { status: 503 });
  const issuer = issuerUrl(env);
  const verifier = randomToken(32);
  const state = randomToken(32);
  const nonce = randomToken(32);
  const flowId = randomToken(24);
  const redirectUri = new URL("/api/auth/callback", baseUrl(env)).toString();
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  await env.CRM_DB.prepare("INSERT INTO crm_oidc_flows(id,state_hash,nonce,code_verifier,return_to,expires_at) VALUES(?,?,?,?,?,datetime('now','+5 minutes'))")
    .bind(flowId, await sha256(state), nonce, verifier, returnTo).run();
  const authorize = new URL("/api/oidc/authorize", issuer);
  authorize.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid profile email", state, nonce, code_challenge: await challenge(verifier), code_challenge_method: "S256" }).toString();
  return redirectResponse(authorize, [cookieHeader(env, "flow", flowId, 300)]);
}

export async function finishPanigaleAuth(request, env, requestId = crypto.randomUUID()) {
  let stage = "parse_callback";
  try {
  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");
  if (providerError) return redirectResponse(new URL(`/crm?auth_error=${encodeURIComponent(providerError.slice(0, 80))}`, baseUrl(env)), [cookieHeader(env, "flow", "", 0)]);
  const flowId = cookieValue(request, cookieName(env, "flow"));
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (!flowId || !state || !code || code.length > 2048) throw new Response("Sign-in could not be verified. Please try again.", { status: 400 });
  stage = "load_oidc_flow";
  const flow = await env.CRM_DB.prepare("SELECT * FROM crm_oidc_flows WHERE id=? AND state_hash=? AND expires_at>CURRENT_TIMESTAMP").bind(flowId, await sha256(state)).first();
  stage = "consume_oidc_flow";
  await env.CRM_DB.prepare("DELETE FROM crm_oidc_flows WHERE id=?").bind(flowId).run();
  if (!flow) throw new Response("Sign-in expired or could not be verified. Please try again.", { status: 400 });
  const issuer = issuerUrl(env), clientId = String(env.PANIGALE_AUTH_CLIENT_ID || "");
  const redirectUri = new URL("/api/auth/callback", baseUrl(env)).toString();
  stage = "exchange_authorization_code";
  const tokenResponse = await fetch(`${issuer}/api/oidc/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, redirect_uri: redirectUri, code, code_verifier: flow.code_verifier }),
    redirect: "manual",
  });
  if (!tokenResponse.ok) throw new Response("Panigale Auth could not complete sign-in.", { status: 401 });
  stage = "parse_token_response";
  const tokens = await tokenResponse.json();
  if (typeof tokens.id_token !== "string") throw new Response("Panigale Auth did not return an ID token.", { status: 401 });
  stage = "verify_id_token";
  const identity = await verifyIdToken(tokens.id_token, { issuer, audience: clientId, nonce: flow.nonce });
  const userId = crypto.randomUUID();
  stage = "persist_crm_identity";
  await env.CRM_DB.prepare(`INSERT INTO crm_users(id,issuer,subject,email,name) VALUES(?,?,?,?,?)
    ON CONFLICT(issuer,subject) DO UPDATE SET email=excluded.email,name=excluded.name,last_seen_at=CURRENT_TIMESTAMP`)
    .bind(userId, issuer, identity.subject, identity.email, identity.name).run();
  const user = await env.CRM_DB.prepare("SELECT id,email,name,status FROM crm_users WHERE issuer=? AND subject=?").bind(issuer, identity.subject).first();
  if (!user || user.status !== "active") throw new Response("This Panigale account cannot access the CRM.", { status: 403 });
  stage = "bootstrap_owner";
  if (env.CRM_BOOTSTRAP_OWNER_EMAIL && identity.email === String(env.CRM_BOOTSTRAP_OWNER_EMAIL).trim().toLowerCase()) await bootstrapOwner(env.CRM_DB, user);
  const sessionToken = randomToken(32);
  stage = "create_crm_session";
  await env.CRM_DB.prepare("INSERT INTO crm_sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+14 days'))").bind(await sha256(sessionToken), user.id).run();
  await env.CRM_DB.prepare("UPDATE crm_users SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id).run();
  return redirectResponse(new URL(safeReturnTo(flow.return_to), baseUrl(env)), [cookieHeader(env, "session", sessionToken, SESSION_SECONDS), cookieHeader(env, "flow", "", 0)]);
  } catch (error) {
    if (error instanceof Response) console.warn("crm_auth_callback_rejected", { requestId, stage, status: error.status });
    else console.error("crm_auth_callback_unexpected_error", { requestId, stage, name: error?.name || "Error" });
    throw error;
  }
}

export async function getPanigaleCrmUser(request, env) {
  if (!env.CRM_DB) return null;
  const sessionToken = cookieValue(request, cookieName(env, "session"));
  if (!sessionToken) return null;
  const user = await env.CRM_DB.prepare(`SELECT u.id,u.email,u.name,u.issuer,u.subject,u.status
    FROM crm_sessions s JOIN crm_users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP AND u.status='active'`).bind(await sha256(sessionToken)).first();
  if (user) await env.CRM_DB.prepare("UPDATE crm_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=?").bind(await sha256(sessionToken)).run();
  return user || null;
}

export async function endPanigaleCrmSession(request, env) {
  const name = cookieName(env, "session");
  const token = cookieValue(request, name);
  if (token && env.CRM_DB) await env.CRM_DB.prepare("DELETE FROM crm_sessions WHERE token_hash=?").bind(await sha256(token)).run();
  return new Response(null, { status: 204, headers: { "set-cookie": cookieHeader(env, "session", "", 0), "cache-control": "no-store" } });
}

export async function csrfTokenResponse(request, env) {
  const token = randomToken(24);
  const secure = baseUrl(env).protocol === "https:";
  return Response.json({ token }, { headers: {
    "cache-control": "no-store",
    "set-cookie": `${secure ? "__Host-crm_csrf" : "crm_csrf"}=${token}; Path=/; Max-Age=7200; SameSite=Lax${secure ? "; Secure" : ""}`,
  } });
}

export async function assertCrmMutation(request, env) {
  if (env.CRM_READ_ONLY_MODE === "true" && new URL(request.url).pathname !== "/api/auth/logout") {
    throw new Response("The CRM is temporarily read-only for maintenance. Please try again shortly.", { status: 503, headers: { "retry-after": "300" } });
  }
  const expectedOrigin = baseUrl(env).origin;
  const origin = request.headers.get("origin");
  if (!origin || origin !== expectedOrigin) throw new Response("Untrusted request origin.", { status: 403 });
  const secure = baseUrl(env).protocol === "https:";
  const cookie = cookieValue(request, secure ? "__Host-crm_csrf" : "crm_csrf");
  const header = request.headers.get("x-crm-csrf") || "";
  const left = encoder.encode(cookie), right = encoder.encode(header);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++) mismatch |= (left[index] || 0) ^ (right[index] || 0);
  if (!cookie || !header || mismatch) throw new Response("Security token expired. Refresh the page and try again.", { status: 403 });
}
