const encoder = new TextEncoder();
const b64 = bytes => { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); };
const unb64 = value => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0));
const random = (size=32) => b64(crypto.getRandomValues(new Uint8Array(size)));
const hash = async value => b64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
const challenge = async value => b64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
const fail = (message,status=400) => new Response(message,{status});

export function googleRedirectUri(env) {
  const base = new URL(String(env.CRM_PUBLIC_URL || ""));
  if (base.protocol !== "https:" && !["localhost","127.0.0.1"].includes(base.hostname)) throw fail("CRM_PUBLIC_URL must use HTTPS.",503);
  return new URL("/api/integrations/google/callback",base).toString();
}

export function googleFlowCookie(request,env,value,maxAge=600) {
  const secure = new URL(String(env.CRM_PUBLIC_URL || "https://crm.panigale.tech")).protocol === "https:";
  return `${secure?"__Host-crm_google_flow":"crm_google_flow"}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure?"; Secure":""}`;
}

export function readGoogleFlowCookie(request,env) {
  const secure = new URL(String(env.CRM_PUBLIC_URL || "https://crm.panigale.tech")).protocol === "https:";
  const name = secure?"__Host-crm_google_flow":"crm_google_flow";
  const item=request.headers.get("cookie")?.split(";").map(value=>value.trim()).find(value=>value.startsWith(`${name}=`));
  return item?decodeURIComponent(item.slice(name.length+1)):"";
}

function encryptionKey(env) {
  const hex=String(env.CRM_INTEGRATION_ENCRYPTION_KEY||"");
  if(!/^[a-f0-9]{64}$/i.test(hex)) throw fail("Google integration encryption is not configured.",503);
  const raw=Uint8Array.from(hex.match(/.{2}/g),pair=>parseInt(pair,16));
  return crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}

export async function encryptIntegrationValue(env,value) {
  const key=await encryptionKey(env),iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,encoder.encode(value));
  return `${b64(iv)}.${b64(new Uint8Array(data))}`;
}

export async function decryptIntegrationValue(env,value) {
  const [encodedIv,encodedData]=String(value||"").split(".");
  if(!encodedIv||!encodedData)throw fail("Stored Google credentials are invalid.",503);
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(encodedIv)},await encryptionKey(env),unb64(encodedData));
  return new TextDecoder().decode(plain);
}

export async function beginGoogleConnection(db,env,{user,tenantId,unitId,scope}) {
  if(!["personal","shared"].includes(scope)) throw fail("Choose a personal or shared mailbox.");
  const clientId=String(env.GOOGLE_OAUTH_CLIENT_ID||"");
  if(!clientId) throw fail("Google OAuth is not configured.",503);
  const membership=await db.prepare("SELECT role FROM crm_unit_access WHERE tenant_id=? AND unit_id=? AND user_id=?").bind(tenantId,unitId,user.id).first();
  const member=await db.prepare("SELECT role FROM crm_memberships WHERE tenant_id=? AND user_id=?").bind(tenantId,user.id).first();
  if(!membership&&!member) throw fail("You do not have access to this business unit.",403);
  if(scope==="shared"&&member?.role!=="superadmin"&&membership?.unit_role!=="manager") throw fail("A unit manager must connect a shared mailbox.",403);
  const flowId=random(24),state=random(),verifier=random(48);
  await db.prepare(`INSERT INTO crm_google_oauth_flows(id,state_hash,code_verifier,tenant_id,unit_id,user_id,connection_scope,expires_at)
    VALUES(?,?,?,?,?,?,?,datetime('now','+10 minutes'))`).bind(flowId,await hash(state),verifier,tenantId,unitId,user.id,scope).run();
  const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search=new URLSearchParams({client_id:clientId,redirect_uri:googleRedirectUri(env),response_type:"code",scope:"openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events",state,code_challenge:await challenge(verifier),code_challenge_method:"S256",access_type:"offline",prompt:"consent select_account"}).toString();
  return {url:url.toString(),flowId};
}

export async function finishGoogleConnection(request,db,env,user) {
  const url=new URL(request.url),state=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"",flowId=readGoogleFlowCookie(request,env);
  if(url.searchParams.has("error")) return {redirect:"/crm?integration_error=google_denied",clearCookie:true};
  if(!flowId||!state||!code||code.length>4096) throw fail("Google connection could not be verified. Start again.",400);
  const flow=await db.prepare("SELECT * FROM crm_google_oauth_flows WHERE id=? AND state_hash=? AND expires_at>CURRENT_TIMESTAMP").bind(flowId,await hash(state)).first();
  await db.prepare("DELETE FROM crm_google_oauth_flows WHERE id=?").bind(flowId).run();
  if(!flow||flow.user_id!==user?.id) throw fail("Google connection expired or the signed-in account changed. Start again.",403);
  const clientId=String(env.GOOGLE_OAUTH_CLIENT_ID||""),clientSecret=String(env.GOOGLE_OAUTH_CLIENT_SECRET||"");
  if(!clientId||!clientSecret) throw fail("Google OAuth client credentials are not configured.",503);
  const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",accept:"application/json"},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:googleRedirectUri(env),grant_type:"authorization_code",code_verifier:flow.code_verifier}),redirect:"manual"});
  const tokens=await tokenResponse.json().catch(()=>({}));
  if(!tokenResponse.ok||typeof tokens.access_token!=="string") throw fail("Google could not complete mailbox authorization. Check the OAuth redirect URI and scopes.",502);
  const profileResponse=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{authorization:`Bearer ${tokens.access_token}`,accept:"application/json"}});
  const profile=await profileResponse.json().catch(()=>({}));
  if(!profileResponse.ok||typeof profile.sub!=="string"||typeof profile.email!=="string"||profile.email_verified!==true) throw fail("Google returned an unverified mailbox identity.",502);
  const granted=String(tokens.scope||"").split(" ").filter(Boolean);
  if(!granted.includes("https://www.googleapis.com/auth/gmail.readonly")||!granted.includes("https://www.googleapis.com/auth/calendar.events")) throw fail("Grant Gmail read and calendar event access to connect this mailbox.",403);
  const access=await encryptIntegrationValue(env,tokens.access_token);
  const refresh=typeof tokens.refresh_token==="string"?await encryptIntegrationValue(env,tokens.refresh_token):null;
  const gmailProfileResponse=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile",{headers:{authorization:`Bearer ${tokens.access_token}`,accept:"application/json"}});
  const gmailProfile=gmailProfileResponse.ok?await gmailProfileResponse.json().catch(()=>({})):{};
  const connectionId=crypto.randomUUID(),owner=flow.connection_scope==="personal"?user.id:null;
  await db.prepare(`INSERT INTO crm_google_connections(id,tenant_id,unit_id,connection_scope,owner_user_id,connected_by_user_id,google_subject,email,access_token_ciphertext,refresh_token_ciphertext,access_token_expires_at,granted_scopes,gmail_history_id,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(connectionId,flow.tenant_id,flow.unit_id,flow.connection_scope,owner,user.id,profile.sub,profile.email.trim().toLowerCase(),access,refresh,tokens.expires_in?new Date(Date.now()+Number(tokens.expires_in)*1000).toISOString():null,granted.join(" "),String(gmailProfile.historyId||""),refresh?"active":"reauth_required").run();
  if(refresh) await db.prepare("INSERT INTO crm_email_sync_jobs(id,tenant_id,unit_id,connection_id,job_kind) VALUES(?,?,?,?,'initial_history')").bind(crypto.randomUUID(),flow.tenant_id,flow.unit_id,connectionId).run();
  await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.google.connected','google_connection',?,?)").bind(crypto.randomUUID(),flow.tenant_id,flow.unit_id,user.id,connectionId,JSON.stringify({scope:flow.connection_scope,email:profile.email.trim().toLowerCase()})).run();
  return {redirect:"/crm?integration_connected=google",clearCookie:true};
}
