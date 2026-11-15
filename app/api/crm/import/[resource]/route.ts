import { env } from "cloudflare:workers";
import { assertCrmMutation, getPanigaleCrmUser } from "../../../../../lib/server/panigale-auth.mjs";
import { createCrmRecord, crmContext } from "../../../../../lib/server/crm.mjs";

type RouteContext={params:Promise<{resource:string}>};
function parseCsv(source:string) {
  const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;
  for(let index=0;index<source.length;index++){
    const character=source[index];
    if(quoted){if(character==='"'&&source[index+1]==='"'){cell+='"';index++;}else if(character==='"')quoted=false;else cell+=character;continue;}
    if(character==='"'&&!cell)quoted=true;
    else if(character===","){row.push(cell.trim());cell="";}
    else if(character==="\n"){row.push(cell.trim());rows.push(row);row=[];cell="";}
    else if(character!=="\r")cell+=character;
  }
  if(quoted)throw new Response("CSV has an unclosed quoted field.",{status:400});
  if(cell.length||row.length){row.push(cell.trim());rows.push(row);}
  return rows.filter(values=>values.some(value=>value.length));
}
const fields:Record<string,string[]>= {
  contacts:["name","company_id","job_title","email","phone","source","status","owner_user_id","next_follow_up","notes"],
  leads:["title","company_id","contact_id","stage","source","qualification","value","value_minor","currency","expected_close","next_step","owner_user_id","loss_reason","notes"],
};
export async function POST(request:Request,{params}:RouteContext) {
  try {
    await assertCrmMutation(request,env);
    const user=await getPanigaleCrmUser(request,env);if(!user)return Response.json({error:"Sign in to continue."},{status:401});
    const {resource}=await params;if(!fields[resource])return Response.json({error:"CSV import supports contacts and opportunities."},{status:404});
    const url=new URL(request.url),tenantId=url.searchParams.get("tenantId")||"",unitId=url.searchParams.get("unitId")||"",context=await crmContext(env.CRM_DB,user.id,tenantId);
    if(!context.unitIds.includes(unitId))return Response.json({error:"You do not have access to this business unit."},{status:403});
    const form=await request.formData(),file=form.get("file");if(!(file instanceof File))return Response.json({error:"Choose a CSV file."},{status:400});
    if(file.size>2*1024*1024)return Response.json({error:"CSV must be 2 MB or smaller."},{status:413});
    const parsed=parseCsv(await file.text());if(parsed.length<2)return Response.json({error:"CSV must include a header and at least one record."},{status:400});
    if(parsed.length>251)return Response.json({error:"Import up to 250 records at a time."},{status:413});
    const headers=parsed[0].map(value=>value.trim().toLowerCase().replace(/[\s-]+/g,"_").replace(/[^a-z0-9_]/g,""));
    if(!headers.includes(resource==="contacts"?"name":"title"))return Response.json({error:`CSV requires a ${resource==="contacts"?"name":"title"} column.`},{status:400});
    const allowed=fields[resource],imported:number[]=[],errors:{line:number;message:string}[]=[];
    for(let index=1;index<parsed.length;index++){
      const raw=parsed[index],input:Record<string,unknown>={unitId};
      headers.forEach((header,column)=>{if(allowed.includes(header)&&raw[column]?.trim())input[header]=raw[column].trim();});
      try{await createCrmRecord(env.CRM_DB,context,user,resource,input);imported.push(index+1);}
      catch(error){const message=error instanceof Response?await error.text():"Unable to import this row.";errors.push({line:index+1,message:message.slice(0,180)});}
    }
    return Response.json({imported:imported.length,skipped:errors.length,errors:errors.slice(0,50)},{status:201,headers:{"cache-control":"no-store"}});
  }catch(error){if(error instanceof Response)return error;return Response.json({error:"Unable to import this CSV file."},{status:500});}
}
