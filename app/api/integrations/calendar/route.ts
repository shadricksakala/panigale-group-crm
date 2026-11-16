import { env } from "cloudflare:workers";
import { assertCrmMutation,getPanigaleCrmUser } from "../../../../lib/server/panigale-auth.mjs";
import { crmContext } from "../../../../lib/server/crm.mjs";
import { googleAccessToken } from "../../../../lib/server/gmail-sync.mjs";

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"cache-control":"no-store"}});
async function connectionFor(request:Request,tenantId:string,unitId:string,connectionId:string){
  const user=await getPanigaleCrmUser(request,env);if(!user)throw new Response("Sign in to continue.",{status:401});
  const context=await crmContext(env.CRM_DB,user.id,tenantId);if(!context.tenant||!context.unitIds.includes(unitId))throw new Response("You do not have access to this business unit.",{status:403});
  const connection=await env.CRM_DB.prepare("SELECT * FROM crm_google_connections WHERE tenant_id=? AND unit_id=? AND id=? AND status='active'").bind(context.tenantId,unitId,connectionId).first();
  if(!connection||connection.connection_scope==="personal"&&connection.owner_user_id!==user.id)throw new Response("Calendar connection not found.",{status:404});
  return {user,context,connection};
}
async function calendarFetch(token:string,calendarId:string,path:string,method="GET",body?:unknown):Promise<any>{
  const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${path}`,{method,headers:{authorization:`Bearer ${token}`,accept:"application/json",...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data:any=await response.json().catch(()=>({}));if(!response.ok)throw new Response(String(data.error?.message||"Google Calendar request failed."),{status:response.status===401?401:502});return data;
}

export async function GET(request:Request){
  try{
    const url=new URL(request.url),tenantId=url.searchParams.get("tenantId")||"",unitId=url.searchParams.get("unitId")||"";
    const user=await getPanigaleCrmUser(request,env);if(!user)return json({error:"Sign in to continue."},401);
    const context=await crmContext(env.CRM_DB,user.id,tenantId);if(!context.tenant||!context.unitIds.includes(unitId))return json({error:"Choose a business unit you can access."},403);
    const start=url.searchParams.get("timeMin")||new Date().toISOString(),end=url.searchParams.get("timeMax")||new Date(Date.now()+30*86400000).toISOString();
    if(!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>93*86400000)return json({error:"Choose a valid calendar range of up to 93 days."},400);
    const {results=[]}=await env.CRM_DB.prepare("SELECT * FROM crm_google_connections WHERE tenant_id=? AND unit_id=? AND status='active' AND (connection_scope='shared' OR owner_user_id=?) ORDER BY connection_scope,email").bind(context.tenantId,unitId,user.id).all();
    const calendars=await Promise.all(results.map(async(connection:any)=>{
      try{const token=await googleAccessToken(env.CRM_DB,env,connection);const data=await calendarFetch(token,String(connection.calendar_id||"primary"),`?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}`);return {connectionId:connection.id,email:connection.email,scope:connection.connection_scope,events:(data.items||[]).map((event:any)=>({id:event.id,summary:event.summary||"(No title)",description:event.description||"",location:event.location||"",start:event.start?.dateTime||event.start?.date||"",end:event.end?.dateTime||event.end?.date||"",htmlLink:event.htmlLink||"",status:event.status||"confirmed"}))};}
      catch(error){if(error instanceof Response)return {connectionId:connection.id,email:connection.email,scope:connection.connection_scope,error:error.status===401?"Reconnect this Google account.":"Calendar could not be loaded."};throw error;}
    }));
    return json({calendars});
  }catch(error){if(error instanceof Response)return json({error:await error.text()},error.status);console.error("crm_google_calendar_read_failed",{name:error instanceof Error?error.name:"unknown"});return json({error:"Unable to load Google Calendar events."},500);}
}

export async function POST(request:Request){
  try{
    await assertCrmMutation(request,env);const input=await request.json() as {tenantId?:unknown;unitId?:unknown;connectionId?:unknown;eventId?:unknown;action?:unknown;confirmed?:unknown;summary?:unknown;description?:unknown;location?:unknown;start?:unknown;end?:unknown};
    const tenantId=typeof input.tenantId==="string"?input.tenantId.slice(0,100):"",unitId=typeof input.unitId==="string"?input.unitId.slice(0,100):"",connectionId=typeof input.connectionId==="string"?input.connectionId.slice(0,100):"";
    if(input.confirmed!==true)return json({error:"Review the calendar change and confirm it before saving."},400);
    if(!["create","update"].includes(String(input.action)))return json({error:"Choose create or update."},400);
    const {user,context,connection}=await connectionFor(request,tenantId,unitId,connectionId);
    const summary=typeof input.summary==="string"?input.summary.trim().slice(0,250):"",description=typeof input.description==="string"?input.description.trim().slice(0,5000):"",location=typeof input.location==="string"?input.location.trim().slice(0,500):"";
    const start=typeof input.start==="string"?input.start:"",end=typeof input.end==="string"?input.end:"";
    if(!summary||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>31*86400000)return json({error:"Provide an event title and valid start and end times."},400);
    const token=await googleAccessToken(env.CRM_DB,env,connection),action=String(input.action),eventId=typeof input.eventId==="string"?input.eventId.slice(0,300):"";
    if(action==="update"&&!eventId)return json({error:"Choose an event to update."},400);
    const data=await calendarFetch(token,String(connection.calendar_id||"primary"),action==="update"?`/${encodeURIComponent(eventId)}`:"","PATCH",{summary,description,location,start:{dateTime:new Date(start).toISOString()},end:{dateTime:new Date(end).toISOString()}});
    await env.CRM_DB.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,'calendar_event',?,?)").bind(crypto.randomUUID(),context.tenantId,unitId,user.id,action==="create"?"crm.calendar.event_created":"crm.calendar.event_updated",String(data.id||eventId),JSON.stringify({connectionId,confirmed:true})).run();
    return json({event:{id:data.id,summary:data.summary,start:data.start?.dateTime||data.start?.date,end:data.end?.dateTime||data.end?.date,htmlLink:data.htmlLink}});
  }catch(error){if(error instanceof Response)return json({error:await error.text()},error.status);console.error("crm_google_calendar_write_failed",{name:error instanceof Error?error.name:"unknown"});return json({error:"Unable to save the calendar event."},500);}
}
