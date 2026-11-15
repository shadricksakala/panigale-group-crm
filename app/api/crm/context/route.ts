import { env } from "cloudflare:workers";
import { getPanigaleCrmUser } from "../../../../lib/server/panigale-auth.mjs";
import { crmContext } from "../../../../lib/server/crm.mjs";

export async function GET(request:Request) {
  try {
    const user=await getPanigaleCrmUser(request,env);
    if(!user)return Response.json({error:"Sign in to continue."},{status:401,headers:{"cache-control":"no-store"}});
    const context=await crmContext(env.CRM_DB,user.id,new URL(request.url).searchParams.get("tenantId")||"");
    const members=context.superadmin?await env.CRM_DB.prepare(`SELECT m.user_id,u.name,u.email,m.role,COALESCE((SELECT group_concat(a.unit_id,',') FROM crm_unit_access a WHERE a.tenant_id=m.tenant_id AND a.user_id=m.user_id),'') unit_ids,COALESCE((SELECT group_concat(x.name,', ') FROM crm_unit_access a JOIN crm_units x ON x.id=a.unit_id WHERE a.tenant_id=m.tenant_id AND a.user_id=m.user_id),'') unit_names,COALESCE((SELECT group_concat(x.name,', ') FROM crm_unit_access a JOIN crm_units x ON x.id=a.unit_id WHERE a.tenant_id=m.tenant_id AND a.user_id=m.user_id AND a.can_view_financials=1),'') financial_unit_names FROM crm_memberships m JOIN crm_users u ON u.id=m.user_id WHERE m.tenant_id=? ORDER BY u.name`).bind(context.tenantId).all():{results:[]};
    return Response.json({user:{id:user.id,name:user.name,email:user.email},memberships:context.memberships,tenant:context.tenant,role:context.role,units:context.units,members:members.results||[]},{headers:{"cache-control":"no-store"}});
  } catch(error) {
    if(error instanceof Response)return error;
    return Response.json({error:"Unable to load CRM access."},{status:500,headers:{"cache-control":"no-store"}});
  }
}
