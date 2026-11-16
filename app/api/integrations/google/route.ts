import { env } from "cloudflare:workers";
import { assertCrmMutation, getPanigaleCrmUser } from "../../../../lib/server/panigale-auth.mjs";
import { crmContext } from "../../../../lib/server/crm.mjs";
import { beginGoogleConnection, googleFlowCookie, revokeGoogleConnection } from "../../../../lib/server/google-integrations.mjs";

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"cache-control":"no-store"}});
const manager=async(tenantId:string,unitId:string,userId:string)=>{
  const row=await env.CRM_DB.prepare("SELECT m.role,a.unit_role FROM crm_memberships m LEFT JOIN crm_unit_access a ON a.tenant_id=m.tenant_id AND a.user_id=m.user_id AND a.unit_id=? WHERE m.tenant_id=? AND m.user_id=?").bind(unitId,tenantId,userId).first();
  return row?.role==="superadmin"||row?.unit_role==="manager";
};

export async function GET(request:Request){
  try{
    const user=await getPanigaleCrmUser(request,env);if(!user)return json({error:"Sign in to continue."},401);
    const url=new URL(request.url),tenantId=url.searchParams.get("tenantId")||"",unitId=url.searchParams.get("unitId")||"";
    const context=await crmContext(env.CRM_DB,user.id,tenantId);if(!context.tenant)return json({error:"CRM workspace is unavailable."},403);
    const units=unitId?[unitId]:context.unitIds;if(units.some((id:string)=>!context.unitIds.includes(id)))return json({error:"You do not have access to this business unit."},403);
    const rows=units.length?await env.CRM_DB.prepare(`SELECT c.id,c.unit_id,c.connection_scope,c.owner_user_id,c.connected_by_user_id,c.email,c.granted_scopes,c.status,c.retention_days,c.connected_at,c.disconnected_at,
      COALESCE((SELECT SUM(j.imported_count) FROM crm_email_sync_jobs j WHERE j.connection_id=c.id),0) AS scanned_count,
      (SELECT j.status FROM crm_email_sync_jobs j WHERE j.connection_id=c.id ORDER BY j.created_at DESC LIMIT 1) AS last_sync_status,
      (SELECT j.last_error_code FROM crm_email_sync_jobs j WHERE j.connection_id=c.id ORDER BY j.created_at DESC LIMIT 1) AS last_sync_error
      FROM crm_google_connections c WHERE c.tenant_id=? AND c.unit_id IN (${units.map(()=>"?").join(",")}) AND (c.connection_scope='shared' OR c.owner_user_id=?) ORDER BY c.unit_id,c.connection_scope,c.email`).bind(context.tenantId,...units,user.id).all():{results:[]};
    const items=await Promise.all((rows.results||[]).map(async(row:any)=>{const canManageRetention=await manager(context.tenantId,String(row.unit_id),user.id);return {...row,canManageRetention,canDisconnect:row.connection_scope==="personal"?row.owner_user_id===user.id:canManageRetention};}));
    return json({items,googleConfigured:Boolean(env.GOOGLE_OAUTH_CLIENT_ID&&env.GOOGLE_OAUTH_CLIENT_SECRET&&env.CRM_INTEGRATION_ENCRYPTION_KEY)});
  }catch(error){if(error instanceof Response)return error;console.error("crm_google_connections_read_failed",{name:error instanceof Error?error.name:"unknown"});return json({error:"Unable to load Google connections."},500);}
}

export async function POST(request:Request){
  try{
    await assertCrmMutation(request,env);const user=await getPanigaleCrmUser(request,env);if(!user)return json({error:"Sign in to continue."},401);
    const input=await request.json() as {tenantId?:unknown;unitId?:unknown;scope?:unknown};
    const tenantId=typeof input.tenantId==="string"?input.tenantId.slice(0,100):"",unitId=typeof input.unitId==="string"?input.unitId.slice(0,100):"",scope=input.scope==="shared"?"shared":"personal";
    const context=await crmContext(env.CRM_DB,user.id,tenantId);if(!context.tenant||!context.unitIds.includes(unitId))return json({error:"You do not have access to this business unit."},403);
    if(scope==="shared"&&!await manager(context.tenantId,unitId,user.id))return json({error:"A business unit manager must connect a shared mailbox."},403);
    const result=await beginGoogleConnection(env.CRM_DB,env,{user,tenantId:context.tenantId,unitId,scope});
    return Response.json({authorizationUrl:result.url},{status:200,headers:{"cache-control":"no-store","set-cookie":googleFlowCookie(request,env,result.flowId)}});
  }catch(error){if(error instanceof Response)return json({error:await error.text()},error.status);console.error("crm_google_connect_start_failed",{name:error instanceof Error?error.name:"unknown"});return json({error:"Unable to start Google authorization."},500);}
}

export async function PATCH(request:Request){
  try{
    await assertCrmMutation(request,env);const user=await getPanigaleCrmUser(request,env);if(!user)return json({error:"Sign in to continue."},401);
    const input=await request.json() as {tenantId?:unknown;connectionId?:unknown;retentionDays?:unknown};
    const tenantId=typeof input.tenantId==="string"?input.tenantId.slice(0,100):"",id=typeof input.connectionId==="string"?input.connectionId.slice(0,100):"",days=Number(input.retentionDays);
    if(!id||!Number.isInteger(days)||days<0||days>3650)return json({error:"Choose a retention period from 0 to 3650 days."},400);
    const context=await crmContext(env.CRM_DB,user.id,tenantId);const row=await env.CRM_DB.prepare("SELECT unit_id FROM crm_google_connections WHERE tenant_id=? AND id=?").bind(context.tenantId,id).first();
    if(!row||!context.unitIds.includes(String(row.unit_id)))return json({error:"Connection not found."},404);
    if(!await manager(context.tenantId,String(row.unit_id),user.id))return json({error:"A unit manager must set the mailbox retention policy."},403);
    await env.CRM_DB.prepare("UPDATE crm_google_connections SET retention_days=? WHERE tenant_id=? AND id=?").bind(days,context.tenantId,id).run();
    await env.CRM_DB.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.google.retention_updated','google_connection',?,?)").bind(crypto.randomUUID(),context.tenantId,row.unit_id,user.id,id,JSON.stringify({retentionDays:days})).run();
    return json({ok:true,retentionDays:days});
  }catch(error){if(error instanceof Response)return json({error:await error.text()},error.status);console.error("crm_google_retention_update_failed",{name:error instanceof Error?error.name:"unknown"});return json({error:"Unable to update retention policy."},500);}
}

export async function DELETE(request:Request){
  try{
    await assertCrmMutation(request,env);const user=await getPanigaleCrmUser(request,env);if(!user)return json({error:"Sign in to continue."},401);
    const input=await request.json() as {tenantId?:unknown;connectionId?:unknown};
    const tenantId=typeof input.tenantId==="string"?input.tenantId.slice(0,100):"",id=typeof input.connectionId==="string"?input.connectionId.slice(0,100):"";
    const context=await crmContext(env.CRM_DB,user.id,tenantId);const row=await env.CRM_DB.prepare("SELECT * FROM crm_google_connections WHERE tenant_id=? AND id=?").bind(context.tenantId,id).first();
    if(!row||!context.unitIds.includes(String(row.unit_id)))return json({error:"Connection not found."},404);
    const allowed=row.connection_scope==="personal"?row.owner_user_id===user.id:await manager(context.tenantId,String(row.unit_id),user.id);
    if(!allowed)return json({error:"You cannot disconnect this mailbox."},403);
    const googleGrantRevoked=await revokeGoogleConnection(env,row);
    await env.CRM_DB.prepare("UPDATE crm_google_connections SET status='disconnected',access_token_ciphertext=NULL,refresh_token_ciphertext=NULL,disconnected_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=? AND status<>'disconnected'").bind(context.tenantId,id).run();
    await env.CRM_DB.prepare("UPDATE crm_email_sync_jobs SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND connection_id=? AND status IN ('queued','running')").bind(context.tenantId,id).run();
    await env.CRM_DB.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.google.disconnected','google_connection',?,?)").bind(crypto.randomUUID(),context.tenantId,row.unit_id,user.id,id,JSON.stringify({retentionDays:Number(row.retention_days),googleGrantRevoked})).run();
    return json({ok:true,googleGrantRevoked,retentionDays:Number(row.retention_days),purgeAfter:row.retention_days===0?new Date().toISOString():new Date(Date.now()+Number(row.retention_days)*86400000).toISOString()});
  }catch(error){if(error instanceof Response)return json({error:await error.text()},error.status);console.error("crm_google_disconnect_failed",{name:error instanceof Error?error.name:"unknown"});return json({error:"Unable to disconnect Google mailbox."},500);}
}
