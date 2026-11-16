import { env } from "cloudflare:workers";
import { getPanigaleCrmUser, assertCrmMutation } from "../../../../lib/server/panigale-auth.mjs";
import { archiveCrmRecord, archiveCrmStage, createCrmRecord, createCrmStage, createCrmUnit, crmContext, grantCrmMember, readCrmResource, replaceCrmProjectMembers, revokeCrmMember, updateCrmRecord, updateCrmStage, deactivateCrmUnit } from "../../../../lib/server/crm.mjs";

type RouteContext = { params: Promise<{ resource: string }> };
const json = (data: unknown, status=200) => Response.json(data,{status,headers:{"cache-control":"no-store"}});
async function readInput(request:Request):Promise<Record<string,unknown>> {
  const value:unknown=await request.json();
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Response("A JSON object is required.",{status:400});
  return value as Record<string,unknown>;
}
async function authenticate(request:Request) {
  const user=await getPanigaleCrmUser(request,env);if(!user)throw new Response("Sign in to continue.",{status:401});
  const url=new URL(request.url),context=await crmContext(env.CRM_DB,user.id,url.searchParams.get("tenantId")||"");
  return {user,context,url};
}
function fail(error:unknown,fallback:string) {
  if(error instanceof Response)return error;
  const message=error instanceof Error?error.message:"";
  if(message.includes("UNIQUE constraint"))return json({error:"That value is already in use."},409);
  if(message.includes("FOREIGN KEY constraint"))return json({error:"A linked CRM record is no longer available."},400);
  return json({error:fallback},500);
}
export async function GET(request:Request,{params}:RouteContext) {
  let resource="unknown";
  try { const [routeParams,{context,url}]=await Promise.all([params,authenticate(request)]);resource=routeParams.resource;return json({data:await readCrmResource(env.CRM_DB,context,resource,url.searchParams.get("unitId")||"",url.searchParams.get("documentGroupId")||"")}); }
  catch(error){
    if (!(error instanceof Response)) console.error("CRM data read failed", {resource,errorName:error instanceof Error?error.name:"UnknownError",errorMessage:error instanceof Error?error.message.slice(0,240):"Unknown failure"});
    return fail(error,"Unable to load CRM data.");
  }
}
export async function POST(request:Request,{params}:RouteContext) {
  try { await assertCrmMutation(request,env);const [{resource},{user,context}]=await Promise.all([params,authenticate(request)]);const input=await readInput(request);
    if(resource==="members")return json({member:await grantCrmMember(env.CRM_DB,context,user,input)},201);
    if(resource==="units")return json({unit:await createCrmUnit(env.CRM_DB,context,user,input)},201);
    if(resource==="project_members")return json({team:await replaceCrmProjectMembers(env.CRM_DB,context,user,input)});
    if(resource==="stages")return json({stage:await createCrmStage(env.CRM_DB,context,user,input)},201);
    return json({record:await createCrmRecord(env.CRM_DB,context,user,resource,input)},201);
  }catch(error){return fail(error,"Unable to save CRM record.");}
}
export async function PATCH(request:Request,{params}:RouteContext) {
  try { await assertCrmMutation(request,env);const [{resource},{user,context}]=await Promise.all([params,authenticate(request)]);const input=await readInput(request);
    if(resource==="members")return json({member:await grantCrmMember(env.CRM_DB,context,user,input)});
    if(resource==="stages")return json({stage:await updateCrmStage(env.CRM_DB,context,user,String(input.id||""),input)});
    return json({record:await updateCrmRecord(env.CRM_DB,context,user,resource,String(input.id||""),input)});
  }catch(error){return fail(error,"Unable to update CRM record.");}
}
export async function DELETE(request:Request,{params}:RouteContext) {
  try { await assertCrmMutation(request,env);const [{resource},{user,context}]=await Promise.all([params,authenticate(request)]);const input=await readInput(request);
    if(resource==="members")return json(await revokeCrmMember(env.CRM_DB,context,user,String(input.userId||input.id||""),Array.isArray(input.unitIds)?input.unitIds:null));
    if(resource==="units")return json(await deactivateCrmUnit(env.CRM_DB,context,user,String(input.id||"")));
    if(resource==="stages")return json(await archiveCrmStage(env.CRM_DB,context,user,String(input.id||"")));
    return json(await archiveCrmRecord(env.CRM_DB,context,user,resource,String(input.id||"")));
  }catch(error){return fail(error,"Unable to update CRM record.");}
}
