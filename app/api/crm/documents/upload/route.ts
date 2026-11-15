import { env } from "cloudflare:workers";
import { assertCrmMutation, getPanigaleCrmUser } from "../../../../../lib/server/panigale-auth.mjs";
import { crmContext } from "../../../../../lib/server/crm.mjs";

const MAX_FILE_BYTES=15*1024*1024;
const TYPES=new Set(["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","text/csv","text/plain","image/png","image/jpeg"]);
export async function POST(request:Request) {
  try {
    await assertCrmMutation(request,env);
    const user=await getPanigaleCrmUser(request,env);if(!user)return Response.json({error:"Sign in to continue."},{status:401});
    const form=await request.formData(),tenantId=String(form.get("tenantId")||""),unitId=String(form.get("unitId")||""),context=await crmContext(env.CRM_DB,user.id,tenantId);
    if(!context.unitIds.includes(unitId))return Response.json({error:"You do not have access to this business unit."},{status:403});
    const file=form.get("file");if(!(file instanceof File)||!file.size||file.size>MAX_FILE_BYTES)return Response.json({error:"Choose a file up to 15 MB."},{status:400});
    const type=TYPES.has(file.type)?file.type:"application/octet-stream";if(type==="application/octet-stream")return Response.json({error:"This file type is not supported."},{status:415});
    const id=crypto.randomUUID(),key=`${tenantId}/${unitId}/${id}`,filename=file.name.replace(/[\\/\0\r\n]/g,"_").slice(0,240)||"document";
    await env.CRM_DOCUMENTS.put(key,file.stream(),{httpMetadata:{contentType:type,contentDisposition:`attachment; filename="${filename.replace(/"/g,"_")}"`}});
    try {
      await env.CRM_DB.prepare("INSERT INTO crm_documents(id,tenant_id,unit_id,company_id,contact_id,project_id,proposal_id,filename,storage_key,content_type,size_bytes,version_label,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id,tenantId,unitId,String(form.get("company_id")||"")||null,String(form.get("contact_id")||"")||null,String(form.get("project_id")||"")||null,String(form.get("proposal_id")||"")||null,filename,key,type,file.size,String(form.get("version_label")||"").slice(0,100)||null,user.id).run();
      await env.CRM_DB.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.documents.uploaded','document',?,?)").bind(crypto.randomUUID(),tenantId,unitId,user.id,id,JSON.stringify({filename,size:file.size})).run();
    } catch(error) { await env.CRM_DOCUMENTS.delete(key);throw error; }
    return Response.json({id,filename,size_bytes:file.size},{status:201,headers:{"cache-control":"no-store"}});
  } catch(error) { if(error instanceof Response)return error;return Response.json({error:"Unable to upload this document."},{status:500}); }
}
