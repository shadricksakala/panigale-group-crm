import { env } from "cloudflare:workers";
import { getPanigaleCrmUser } from "../../../../../lib/server/panigale-auth.mjs";
import { finishGoogleConnection, googleFlowCookie } from "../../../../../lib/server/google-integrations.mjs";

export async function GET(request:Request){
  try{
    const user=await getPanigaleCrmUser(request,env);
    const result=await finishGoogleConnection(request,env.CRM_DB,env,user);
    return new Response(null,{status:302,headers:{location:new URL(result.redirect,String(env.CRM_PUBLIC_URL||"https://crm.panigale.tech")).toString(),"cache-control":"no-store","set-cookie":googleFlowCookie(request,env,"",0)}});
  }catch(error){
    if(error instanceof Response)return Response.json({error:await error.text()},{status:error.status,headers:{"cache-control":"no-store"}});
    console.error("crm_google_callback_failed",{name:error instanceof Error?error.name:"unknown"});
    return Response.json({error:"Unable to complete Google connection."},{status:503,headers:{"cache-control":"no-store"}});
  }
}
