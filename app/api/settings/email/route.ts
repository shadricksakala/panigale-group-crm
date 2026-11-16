import { env } from "cloudflare:workers";
import { assertCrmMutation,getPanigaleCrmUser } from "../../../../lib/server/panigale-auth.mjs";
import { crmContext } from "../../../../lib/server/crm.mjs";
import { getVerifiedCrmMailSender } from "../../../../lib/server/mail-delivery.mjs";

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"cache-control":"no-store"}});
async function canManage(tenantId:string,unitId:string,userId:string){const row=await env.CRM_DB.prepare("SELECT m.role,a.unit_role FROM crm_memberships m LEFT JOIN crm_unit_access a ON a.tenant_id=m.tenant_id AND a.user_id=m.user_id AND a.unit_id=? WHERE m.tenant_id=? AND m.user_id=?").bind(unitId,tenantId,userId).first();return row?.role==="superadmin"||row?.unit_role==="manager";}

export async function GET(request:Request){
  try{
    const user=await getPanigaleCrmUser(request,env);if(!user)return json({error:"Sign in to continue."},401);
    const url=new URL(request.url),context=await crmContext(env.CRM_DB,user.id,url.searchParams.get("tenantId")||""),unitId=url.searchParams.get("unitId")||"";
    if(!context.tenant||!context.unitIds.includes(unitId))return json({error:"Choose a business unit you can access."},403);
    const settings=await env.CRM_DB.prepare("SELECT receipt_auto_enabled,receipt_subject,receipt_body,inbound_route_enabled,inbound_fallback_user_id FROM crm_email_unit_settings WHERE tenant_id=? AND unit_id=?").bind(context.tenantId,unitId).first();
    const manage=await canManage(context.tenantId,unitId,user.id);
    const members=manage?await env.CRM_DB.prepare("SELECT u.id,u.name,u.email FROM crm_users u JOIN crm_unit_access a ON a.user_id=u.id AND a.tenant_id=? AND a.unit_id=? WHERE u.status='active' ORDER BY u.name,u.email").bind(context.tenantId,unitId).all():{results:[]};
    const deliveryConfigured=env.CRM_EMAIL_SEND_ENABLED==="true"&&Boolean(env.CRM_MAILER),senderEmail=deliveryConfigured?await getVerifiedCrmMailSender(env.CRM_MAILER,context.tenantId,unitId):null;
    return json({receiptAutoEnabled:Number(settings?.receipt_auto_enabled||0)===1,receiptSubject:settings?.receipt_subject||"We received your message",receiptBody:settings?.receipt_body||"Thank you for contacting us. We have received your message and will direct it to the right person.",inboundRouteEnabled:Number(settings?.inbound_route_enabled||0)===1,inboundFallbackUserId:settings?.inbound_fallback_user_id||"",routingMembers:members.results||[],canManage:manage,emailDeliveryReady:Boolean(senderEmail),senderEmail});
  }catch(error){if(error instanceof Response)return error;return json({error:"Unable to load email settings."},500);}
}

export async function PUT(request:Request){
  try{
    await assertCrmMutation(request,env);const user=await getPanigaleCrmUser(request,env);if(!user)return json({error:"Sign in to continue."},401);
    const input=await request.json() as {tenantId?:unknown;unitId?:unknown;receiptAutoEnabled?:unknown;receiptSubject?:unknown;receiptBody?:unknown;inboundRouteEnabled?:unknown;inboundFallbackUserId?:unknown};
    const tenantId=typeof input.tenantId==="string"?input.tenantId.slice(0,100):"",unitId=typeof input.unitId==="string"?input.unitId.slice(0,100):"",context=await crmContext(env.CRM_DB,user.id,tenantId);
    if(!context.tenant||!context.unitIds.includes(unitId))return json({error:"Choose a business unit you can access."},403);
    if(!await canManage(context.tenantId,unitId,user.id))return json({error:"A unit manager must configure email settings."},403);
    if(typeof input.receiptAutoEnabled!=="boolean"||typeof input.inboundRouteEnabled!=="boolean")return json({error:"Choose whether automatic receipts and inbound routing are enabled."},400);
    let senderEmail:string|null=null;if(input.receiptAutoEnabled){if(env.CRM_EMAIL_SEND_ENABLED!=="true"||!env.CRM_MAILER)return json({error:"Automatic receipts require the company mail gateway to be enabled."},503);senderEmail=await getVerifiedCrmMailSender(env.CRM_MAILER,context.tenantId,unitId);if(!senderEmail)return json({error:"Automatic receipts require a verified sender for this business unit."},503);}
    const subject=typeof input.receiptSubject==="string"?input.receiptSubject.trim().slice(0,250):"",body=typeof input.receiptBody==="string"?input.receiptBody.trim().slice(0,4000):"";
    if(subject.length<2||!body)return json({error:"Add an email subject and message."},400);
    const fallback=typeof input.inboundFallbackUserId==="string"?input.inboundFallbackUserId.slice(0,100):"";
    if(input.inboundRouteEnabled){
      if(!fallback)return json({error:"Choose a fallback teammate for messages without a matching CRM owner."},400);
      const assigned=await env.CRM_DB.prepare("SELECT 1 ok FROM crm_unit_access a JOIN crm_users u ON u.id=a.user_id AND u.status='active' WHERE a.tenant_id=? AND a.unit_id=? AND a.user_id=?").bind(context.tenantId,unitId,fallback).first();
      if(!assigned)return json({error:"The fallback teammate must have active access to this business unit."},400);
    }
    await env.CRM_DB.prepare(`INSERT INTO crm_email_unit_settings(tenant_id,unit_id,receipt_auto_enabled,receipt_subject,receipt_body,inbound_route_enabled,inbound_fallback_user_id,updated_by_user_id)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,unit_id) DO UPDATE SET receipt_auto_enabled=excluded.receipt_auto_enabled,receipt_subject=excluded.receipt_subject,receipt_body=excluded.receipt_body,inbound_route_enabled=excluded.inbound_route_enabled,inbound_fallback_user_id=excluded.inbound_fallback_user_id,updated_by_user_id=excluded.updated_by_user_id,updated_at=CURRENT_TIMESTAMP`)
      .bind(context.tenantId,unitId,input.receiptAutoEnabled?1:0,subject,body,input.inboundRouteEnabled?1:0,input.inboundRouteEnabled?fallback:null,user.id).run();
    await env.CRM_DB.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.email.settings_configured','email_settings',?,?)").bind(crypto.randomUUID(),context.tenantId,unitId,user.id,unitId,JSON.stringify({receiptsEnabled:input.receiptAutoEnabled,inboundRouteEnabled:input.inboundRouteEnabled,fallbackUserId:input.inboundRouteEnabled?fallback:null,...(senderEmail?{senderEmail}:{})})).run();
    return json({receiptAutoEnabled:input.receiptAutoEnabled,receiptSubject:subject,receiptBody:body,inboundRouteEnabled:input.inboundRouteEnabled,inboundFallbackUserId:input.inboundRouteEnabled?fallback:"",emailDeliveryReady:Boolean(senderEmail),senderEmail});
  }catch(error){if(error instanceof Response)return error;return json({error:"Unable to save email settings."},500);}
}
