import { env } from "cloudflare:workers";
import { getPanigaleCrmUser } from "../../../../../../lib/server/panigale-auth.mjs";
import { crmContext } from "../../../../../../lib/server/crm.mjs";

type RouteContext={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:RouteContext) {
  try {
    const user=await getPanigaleCrmUser(request,env);if(!user)return Response.json({error:"Sign in to continue."},{status:401});
    const [{id},url]=await Promise.all([params,Promise.resolve(new URL(request.url))]);
    const tenantId=url.searchParams.get("tenantId")||"",context=await crmContext(env.CRM_DB,user.id,tenantId);
    const row=await env.CRM_DB.prepare("SELECT * FROM crm_documents WHERE id=? AND tenant_id=? AND status='active'").bind(id,context.tenantId).first();
    if(!row)return Response.json({error:"Document not found."},{status:404});
    if(!context.unitIds.includes(String(row.unit_id)))return Response.json({error:"You do not have access to this document."},{status:403});
    const object=await env.CRM_DOCUMENTS.get(String(row.storage_key));if(!object)return Response.json({error:"Document file is missing."},{status:404});
    await env.CRM_DB.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.documents.downloaded','document',?,?)").bind(crypto.randomUUID(),context.tenantId,row.unit_id,user.id,id,JSON.stringify({documentGroupId:row.document_group_id,version:row.version_number})).run();
    const headers=new Headers({"content-type":String(row.content_type),"content-length":String(row.size_bytes),"content-disposition":`attachment; filename="${String(row.filename).replace(/["\\\r\n]/g,"_")}"`,"cache-control":"private, no-store","x-content-type-options":"nosniff"});
    return new Response(object.body,{headers});
  }catch(error){if(error instanceof Response)return error;return Response.json({error:"Unable to retrieve this document."},{status:500});}
}
