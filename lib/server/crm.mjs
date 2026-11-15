const TABLES = Object.freeze({
  companies: "crm_companies", contacts: "crm_contacts", leads: "crm_leads", activities: "crm_activities",
  projects: "crm_projects", milestones: "crm_milestones", deliverables: "crm_deliverables", project_risks: "crm_project_risks",
  proposals: "crm_proposals", proposal_templates: "crm_proposal_templates", documents: "crm_documents", invoices: "crm_invoices", payments: "crm_payments",
});

const FIELDS = Object.freeze({
  companies: ["name","industry","segment","website","email","phone","address","source","status","owner_user_id","notes"],
  contacts: ["company_id","name","contact_type","job_title","email","phone","source","status","owner_user_id","next_follow_up","notes"],
  leads: ["company_id","contact_id","title","stage","source","qualification","value_minor","currency","expected_close","next_step","owner_user_id","loss_reason","notes"],
  activities: ["company_id","contact_id","lead_id","project_id","kind","title","details","priority","status","due_at","completed_at","owner_user_id"],
  projects: ["company_id","contact_id","lead_id","proposal_id","name","description","engagement_type","status","start_date","due_date","owner_user_id","progress"],
  milestones: ["project_id","title","description","status","due_date","position","completed_at"],
  deliverables: ["project_id","milestone_id","title","description","status","due_date","owner_user_id","document_id"],
  project_risks: ["project_id","title","description","severity","status","owner_user_id","due_date"],
  proposals: ["company_id","contact_id","lead_id","title","scope","amount_minor","currency","status","valid_until"],
  proposal_templates: ["name","title","scope","currency"],
  invoices: ["company_id","contact_id","proposal_id","project_id","title","external_reference","amount_minor","currency","status","due_date","paid_at"],
  payments: ["invoice_id","amount_minor","paid_at","method","reference","notes"],
});

const UNIT_SEEDS = [
  ["panipay","PaniPay","Payments and invoicing","https://panipay.panigale.tech"],
  ["futurecampus","FutureCampus","Education technology","https://futurecampus.africa"],
  ["euroza","Euroza Consultancy","Strategy and advisory","https://euroza.panigale.tech"],
  ["ebt","EBT","Business technology","https://ebt.panigale.tech"],
  ["zedpreneurs","ZedPreneurs","Entrepreneurship and skills","https://zedprenuers.com"],
  ["strongpoint-capital","StrongPoint Capital","Fund management","https://strongpoint.panigale.tech"],
  ["ultra-fx-academy","Ultra FX Academy","Financial education","https://ultrafxacademy.online"],
  ["proventus-show","The Proventus Show","Media and thought leadership","https://pshow.panigale.tech"],
  ["asil","ASIL Zambia","Advanced AI research","https://panigale.tech/asil/"],
];
const DEFAULT_STAGES = [["discovery","Discovery","blue",0,0,0],["qualified","Qualified","violet",1,0,0],["proposal","Proposal","amber",2,0,0],["negotiation","Negotiation","orange",3,0,0],["won","Won","green",4,1,0],["lost","Closed lost","gray",5,0,1]];
const clean = (value, max=6000) => typeof value === "string" ? value.trim().slice(0,max) : "";
const failure = (message,status=400) => new Response(message,{status});
function toMinorUnits(value,label) {
  const amount=typeof value==="number"?value:typeof value==="string"&&value.trim()?Number(value):Number.NaN;
  const minor=Math.round(amount*100);
  if(!Number.isFinite(amount)||!Number.isSafeInteger(minor)||minor<0)throw failure(`Invalid ${label}.`);
  return minor;
}

export async function crmContext(db,userId,tenantId="") {
  const result=await db.prepare(`SELECT t.id AS tenant_id,t.name AS tenant_name,t.slug,m.role FROM crm_memberships m JOIN crm_tenants t ON t.id=m.tenant_id WHERE m.user_id=? AND t.status='active' ORDER BY t.name`).bind(userId).all();
  const memberships=result.results||[];
  const member=tenantId?memberships.find(row=>row.tenant_id===tenantId):memberships[0];
  if(tenantId&&!member) throw failure("You do not have access to this workspace.",403);
  if(!member) return {memberships:[],tenant:null,units:[],unitIds:[],role:null,superadmin:false};
  const superadmin=member.role==="superadmin";
  const units=superadmin
    ? await db.prepare("SELECT id,name,slug,category,website,accent,1 AS can_view_financials FROM crm_units WHERE tenant_id=? AND active=1 ORDER BY name COLLATE NOCASE").bind(member.tenant_id).all()
    : await db.prepare("SELECT u.id,u.name,u.slug,u.category,u.website,u.accent,a.can_view_financials FROM crm_unit_access a JOIN crm_units u ON u.id=a.unit_id AND u.tenant_id=a.tenant_id WHERE a.tenant_id=? AND a.user_id=? AND u.active=1 ORDER BY u.name COLLATE NOCASE").bind(member.tenant_id,userId).all();
  const rows=units.results||[];
  return {tenantId:member.tenant_id,tenant:{id:member.tenant_id,name:member.tenant_name,slug:member.slug,role:member.role},memberships:memberships.map(m=>({id:m.tenant_id,name:m.tenant_name,slug:m.slug,role:m.role})),role:member.role,superadmin,units:rows,unitIds:rows.map(unit=>unit.id)};
}

function scope(context,unitId="",alias="r") {
  if(unitId&&!context.unitIds.includes(unitId)) throw failure("You do not have access to this business unit.",403);
  const ids=unitId?[unitId]:context.unitIds;
  return ids.length?{sql:`${alias}.tenant_id=? AND ${alias}.unit_id IN (${ids.map(()=>"?").join(",")})`,args:[context.tenantId,...ids]}:{sql:`${alias}.tenant_id=? AND ${alias}.unit_id IS NULL`,args:[context.tenantId]};
}
function canSeeFinancials(context,unitId) {
  return context.superadmin||Number(context.units.find(unit=>unit.id===unitId)?.can_view_financials)===1;
}
const ownerJoin="LEFT JOIN crm_users owner ON owner.id=r.owner_user_id";
const companyJoin="LEFT JOIN crm_companies company ON company.id=r.company_id AND company.tenant_id=r.tenant_id AND company.unit_id=r.unit_id";

export async function readCrmResource(db,context,resource,unitId="",recordId="") {
  if(resource==="units") return context.units;
  const where=scope(context,unitId);
  if(resource==="document_access") {
    const accessScope=scope(context,unitId,"d");
    if(!recordId)throw failure("Document group is required.");
    const {results=[]}=await db.prepare(`SELECT e.id,e.action,e.created_at,e.metadata_json,d.filename,d.version_number,actor.name actor_name FROM crm_audit_events e JOIN crm_documents d ON d.id=e.entity_id AND d.tenant_id=e.tenant_id AND d.unit_id=e.unit_id LEFT JOIN crm_users actor ON actor.id=e.actor_user_id WHERE ${accessScope.sql} AND d.document_group_id=? AND e.entity_type='document' AND e.action LIKE 'crm.documents.%' ORDER BY e.created_at DESC LIMIT 200`).bind(...accessScope.args,recordId).all();
    return results;
  }
  if(resource==="document_versions") {
    const versionScope=scope(context,unitId,"d");
    const {results=[]}=await db.prepare(`SELECT d.*,u.name unit_name,actor.name uploaded_by_name FROM crm_documents d JOIN crm_units u ON u.id=d.unit_id LEFT JOIN crm_users actor ON actor.id=d.uploaded_by WHERE ${versionScope.sql} AND d.status='active' ORDER BY d.created_at DESC,d.version_number DESC LIMIT 500`).bind(...versionScope.args).all();
    return results;
  }
  if(resource==="proposal_versions") {
    const versionScope=scope(context,unitId,"v");
    const {results=[]}=await db.prepare(`SELECT v.*,p.title proposal_title,u.name unit_name,actor.name changed_by_name FROM crm_proposal_versions v JOIN crm_proposals p ON p.id=v.proposal_id AND p.tenant_id=v.tenant_id AND p.unit_id=v.unit_id JOIN crm_units u ON u.id=v.unit_id LEFT JOIN crm_users actor ON actor.id=v.changed_by WHERE ${versionScope.sql} ORDER BY v.created_at DESC,v.version DESC LIMIT 500`).bind(...versionScope.args).all();
    for(const row of results)if(!canSeeFinancials(context,row.unit_id))row.amount_minor=null;
    return results;
  }
  if(resource==="members") {
    const unitIds=context.unitIds;
    if(!unitIds.length)return [];
    const visibleCte=context.superadmin?"":`WITH visible_units AS (SELECT id FROM crm_units WHERE tenant_id=? AND id IN (${unitIds.map(()=>"?").join(",")})) `;
    const visibleJoin=context.superadmin?"":"JOIN visible_units vu ON vu.id=a.unit_id";
    const visibleNameJoin=context.superadmin?"":"JOIN visible_units vu ON vu.id=x.id";
    const visibleFilter=context.superadmin?"":" AND EXISTS (SELECT 1 FROM crm_unit_access va JOIN visible_units vu ON vu.id=va.unit_id WHERE va.tenant_id=m.tenant_id AND va.user_id=m.user_id)";
    const {results=[]}=await db.prepare(`${visibleCte}SELECT m.user_id,u.name,u.email,m.role,m.created_at,
      COALESCE((SELECT group_concat(a.unit_id,',') FROM crm_unit_access a ${visibleJoin} WHERE a.tenant_id=m.tenant_id AND a.user_id=m.user_id),'') unit_ids,
      COALESCE((SELECT group_concat(x.name,', ') FROM crm_unit_access a JOIN crm_units x ON x.id=a.unit_id ${visibleNameJoin} WHERE a.tenant_id=m.tenant_id AND a.user_id=m.user_id),'') unit_names,
      COALESCE((SELECT group_concat(x.name,', ') FROM crm_unit_access a JOIN crm_units x ON x.id=a.unit_id ${visibleNameJoin} WHERE a.tenant_id=m.tenant_id AND a.user_id=m.user_id AND a.can_view_financials=1),'') financial_unit_names
      FROM crm_memberships m JOIN crm_users u ON u.id=m.user_id WHERE m.tenant_id=?${visibleFilter} ORDER BY u.name COLLATE NOCASE`).bind(...(context.superadmin?[context.tenantId]:[context.tenantId,...unitIds,context.tenantId])).all();
    return results;
  }
  if(resource==="project_members") {
    const projectScope=scope(context,unitId,"pm");
    const {results=[]}=await db.prepare(`SELECT pm.project_id||':'||pm.user_id AS id,pm.project_id,pm.user_id,pm.project_role,p.owner_user_id,u.name user_name,u.email user_email,p.name project_name,pm.unit_id
      FROM crm_project_members pm JOIN crm_projects p ON p.id=pm.project_id AND p.tenant_id=pm.tenant_id AND p.unit_id=pm.unit_id
      JOIN crm_users u ON u.id=pm.user_id WHERE ${projectScope.sql} ORDER BY p.name COLLATE NOCASE,u.name COLLATE NOCASE`).bind(...projectScope.args).all();
    return results;
  }
  if(resource==="stages") { const {results=[]}=await db.prepare(`SELECT r.* FROM crm_pipeline_stages r WHERE ${where.sql} ORDER BY r.position,r.name COLLATE NOCASE,r.id`).bind(...where.args).all(); return results; }
  if(resource==="dashboard"||resource==="reports") {
    const [leads,contacts,projects,tasks,invoices,proposals,trend,leadTotals,proposalTiming,deliveryTiming,collectionTiming]=await Promise.all([
      db.prepare(`SELECT r.stage,COUNT(*) count,COALESCE(SUM(r.value_minor),0) value_minor FROM crm_leads r WHERE ${where.sql} GROUP BY r.stage`).bind(...where.args).all(),
      db.prepare(`SELECT COUNT(*) count FROM crm_contacts r WHERE ${where.sql} AND r.status NOT IN ('inactive','archived')`).bind(...where.args).first(),
      db.prepare(`SELECT COUNT(*) count FROM crm_projects r WHERE ${where.sql} AND r.status IN ('planned','active','on_hold')`).bind(...where.args).first(),
      db.prepare(`SELECT r.*,u.name unit_name FROM crm_activities r JOIN crm_units u ON u.id=r.unit_id WHERE ${where.sql} AND r.status='open' ORDER BY r.due_at LIMIT 100`).bind(...where.args).all(),
      db.prepare(`SELECT r.status,COUNT(*) count,COALESCE(SUM(r.amount_minor),0) amount_minor FROM crm_invoices r WHERE ${where.sql} GROUP BY r.status`).bind(...where.args).all(),
      db.prepare(`SELECT r.status,COUNT(*) count FROM crm_proposals r WHERE ${where.sql} GROUP BY r.status`).bind(...where.args).all(),
      db.prepare(`SELECT date(r.created_at) day,COALESCE(SUM(r.value_minor),0) value FROM crm_leads r WHERE ${where.sql} AND r.created_at>=date('now','-30 days') AND NOT EXISTS (SELECT 1 FROM crm_pipeline_stages ps WHERE ps.tenant_id=r.tenant_id AND ps.unit_id=r.unit_id AND ps.slug=r.stage AND (ps.is_won=1 OR ps.is_lost=1)) GROUP BY date(r.created_at) ORDER BY day`).bind(...where.args).all(),
      db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN EXISTS (SELECT 1 FROM crm_pipeline_stages ps WHERE ps.tenant_id=r.tenant_id AND ps.unit_id=r.unit_id AND ps.slug=r.stage AND ps.is_won=1) THEN 1 ELSE 0 END) won FROM crm_leads r WHERE ${where.sql}`).bind(...where.args).first(),
      db.prepare(`SELECT AVG(julianday(r.updated_at)-julianday(r.created_at)) days FROM crm_proposals r WHERE ${where.sql} AND r.status IN ('sent','accepted','rejected')`).bind(...where.args).first(),
      db.prepare(`SELECT AVG(CASE WHEN julianday(r.updated_at)<=julianday(r.due_date) THEN 100.0 ELSE 0.0 END) pct FROM crm_projects r WHERE ${where.sql} AND r.status='completed' AND r.due_date IS NOT NULL`).bind(...where.args).first(),
      db.prepare(`SELECT AVG(julianday(p.paid_at)-julianday(r.created_at)) days FROM crm_invoices r JOIN crm_payments p ON p.tenant_id=r.tenant_id AND p.unit_id=r.unit_id AND p.invoice_id=r.id WHERE ${where.sql} AND r.status='paid'`).bind(...where.args).first(),
    ]);
    const stages=Object.fromEntries((leads.results||[]).map(row=>[row.stage,{count:Number(row.count),valueMinor:Number(row.value_minor)}]));
    const invoiceMap=Object.fromEntries((invoices.results||[]).map(row=>[row.status,{count:Number(row.count),amountMinor:Number(row.amount_minor)}]));
    const proposalMap=Object.fromEntries((proposals.results||[]).map(row=>[row.status,Number(row.count)]));
    const canSeeAll=context.superadmin||(!unitId&&context.units.every(unit=>Number(unit.can_view_financials)!==0))||(unitId&&context.units.some(unit=>unit.id===unitId&&Number(unit.can_view_financials)!==0));
    const trendRows=(trend.results||[]).map(row=>({label:new Date(`${row.day}T00:00:00`).toLocaleDateString("en-GB",{day:"numeric",month:"short"}),value:canSeeAll?Number(row.value):0}));
    if(!canSeeAll){for(const stage of Object.values(stages))stage.valueMinor=0;for(const invoice of Object.values(invoiceMap))invoice.amountMinor=0;}
    const conversionTotal=Number(leadTotals?.total||0),won=Number(leadTotals?.won||0);
    const summary={leads:stages,contacts:Number(contacts?.count||0),activeProjects:Number(projects?.count||0),dueTasks:(tasks.results||[]).filter(row=>row.due_at&&new Date(row.due_at)<=new Date(Date.now()+7*86400000)).length,invoices:invoiceMap,proposals:proposalMap,trend:trendRows,ventures:context.units.map(unit=>({name:unit.name,category:unit.category,website:unit.website}))};
    const details={...summary,openTasks:tasks.results||[],pipelineValue:canSeeAll?Object.values(stages).reduce((sum,row)=>sum+row.valueMinor,0):0,leadConversion:conversionTotal?`${Math.round(won/conversionTotal*100)}%`:"—",proposalTurnaround:proposalTiming?.days==null?"—":`${Math.max(0,Math.round(Number(proposalTiming.days)))} days`,onTimeDelivery:deliveryTiming?.pct==null?"—":`${Math.round(Number(deliveryTiming.pct))}%`,collectionDays:canSeeAll&&collectionTiming?.days!=null?`${Math.max(0,Math.round(Number(collectionTiming.days)))} days`:null};
    return resource==="dashboard"?summary:details;
  }
  const table=TABLES[resource]; if(!table) throw failure("CRM resource not found.",404);
  const joins=["JOIN crm_units u ON u.id=r.unit_id"];
  if(["companies","contacts","leads","activities","projects","proposals","invoices","deliverables","project_risks"].includes(resource)) joins.push(ownerJoin);
  if(["contacts","leads","activities","projects","proposals","invoices","documents"].includes(resource)) joins.push(companyJoin);
  let select="r.*,u.name unit_name";
  if(["companies","contacts","leads","activities","projects","proposals","invoices","deliverables","project_risks"].includes(resource)) select+=" ,owner.name owner_name";
  if(["contacts","leads","activities","projects","proposals","invoices","documents"].includes(resource)) select+=" ,company.name company_name,company.industry company_industry";
  if(["leads","activities","projects","proposals","invoices"].includes(resource)){joins.push("LEFT JOIN crm_contacts linked_contact ON linked_contact.id=r.contact_id AND linked_contact.tenant_id=r.tenant_id AND linked_contact.unit_id=r.unit_id");select+=" ,linked_contact.name contact_name";}
  if(["activities","projects","proposals"].includes(resource)){joins.push("LEFT JOIN crm_leads linked_lead ON linked_lead.id=r.lead_id AND linked_lead.tenant_id=r.tenant_id AND linked_lead.unit_id=r.unit_id");select+=" ,linked_lead.title lead_title";}
  if(["activities","invoices","documents","deliverables","project_risks"].includes(resource)){joins.push("LEFT JOIN crm_projects linked_project ON linked_project.id=r.project_id AND linked_project.tenant_id=r.tenant_id AND linked_project.unit_id=r.unit_id");select+=" ,linked_project.name project_name";}
  if(["projects","invoices","documents"].includes(resource)){joins.push("LEFT JOIN crm_proposals linked_proposal ON linked_proposal.id=r.proposal_id AND linked_proposal.tenant_id=r.tenant_id AND linked_proposal.unit_id=r.unit_id");select+=" ,linked_proposal.title proposal_title";}
  if(resource==="documents"){joins.push("LEFT JOIN crm_users owner ON owner.id=r.uploaded_by");select+=" ,owner.name owner_name";}
  if(resource==="payments"){joins.push("LEFT JOIN crm_invoices i ON i.id=r.invoice_id AND i.tenant_id=r.tenant_id AND i.unit_id=r.unit_id");select+=" ,i.title invoice_title,i.company_id";}
  const order=["milestones","deliverables","project_risks"].includes(resource)?"r.due_date ASC":resource==="payments"?"r.paid_at DESC":resource==="documents"?"r.created_at DESC":"r.updated_at DESC";
  const activeFilter=resource==="documents"?" AND r.status='active' AND NOT EXISTS (SELECT 1 FROM crm_documents newer WHERE newer.tenant_id=r.tenant_id AND newer.unit_id=r.unit_id AND newer.document_group_id=r.document_group_id AND newer.status='active' AND newer.version_number>r.version_number)":resource==="proposal_templates"?" AND r.active=1":resource==="project_risks"?" AND r.status<>'archived'":"";
  const sql=`SELECT ${select} FROM ${table} r ${joins.join(" ")} WHERE ${where.sql}${activeFilter} ORDER BY ${order} LIMIT 500`;
  const {results=[]}=await db.prepare(sql).bind(...where.args).all();
  if(resource==="invoices") for(const row of results){const total=await db.prepare("SELECT COALESCE(SUM(amount_minor),0) total FROM crm_payments WHERE tenant_id=? AND unit_id=? AND invoice_id=?").bind(row.tenant_id,row.unit_id,row.id).first();row.paid_minor=Number(total?.total||0);}
  if(resource==="payments") return results.filter(row=>context.superadmin||Number(context.units.find(unit=>unit.id===row.unit_id)?.can_view_financials)===1);
  const financialFields={leads:["value_minor"],proposals:["amount_minor"],invoices:["amount_minor","paid_minor"],payments:["amount_minor"]}[resource]||[];
  if(financialFields.length)for(const row of results){const unit=context.units.find(item=>item.id===row.unit_id);if(!context.superadmin&&Number(unit?.can_view_financials)===0)for(const field of financialFields)row[field]=null;}
  return results;
}

const STAGE_COLORS=new Set(["blue","violet","amber","orange","green","gray","red"]);
const stageFlag=value=>value===true||value===1||value==="1"||value==="true";
function requireStageManager(context){if(!context.superadmin&&context.role!=="unit_manager")throw failure("Unit manager access is required to configure the pipeline.",403);}
function stageAudit(db,context,user,action,id,metadata){return db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,'pipeline_stage',?,?)").bind(crypto.randomUUID(),context.tenantId,context.writeUnit,user.id,action,id,JSON.stringify(metadata));}

export async function createCrmStage(db,context,user,input){
  requireStageManager(context);
  const unitId=clean(input.unitId,100);if(!context.unitIds.includes(unitId))throw failure("You do not have access to this business unit.",403);
  const name=clean(input.name,80),color=clean(input.color,20)||"blue";if(name.length<2)throw failure("Stage name must be at least two characters.");if(!STAGE_COLORS.has(color))throw failure("Choose a valid stage color.");
  const slug=name.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70);if(!slug)throw failure("Stage name must contain letters or numbers.");
  const positionValue=input.position===undefined?null:Number(input.position);if(positionValue!==null&&(!Number.isSafeInteger(positionValue)||positionValue<0))throw failure("Stage position must be a non-negative whole number.");
  const isWon=stageFlag(input.is_won),isLost=stageFlag(input.is_lost);if(isWon&&isLost)throw failure("A stage cannot be both won and lost.");
  const max=await db.prepare("SELECT COALESCE(MAX(position),-1) position FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=?").bind(context.tenantId,unitId).first();
  const position=positionValue??Number(max?.position??-1)+1;
  const duplicate=await db.prepare("SELECT 1 ok FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND slug=? LIMIT 1").bind(context.tenantId,unitId,slug).first();if(duplicate)throw failure("A pipeline stage with that name already exists in this business unit.",409);
  const previousWinners=isWon?await db.prepare("SELECT id,name,slug FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND active=1 AND is_won=1").bind(context.tenantId,unitId).all():{results:[]};
  const previousLosers=isLost?await db.prepare("SELECT id,name,slug FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND active=1 AND is_lost=1").bind(context.tenantId,unitId).all():{results:[]};
  const id=crypto.randomUUID();context.writeUnit=unitId;
  const statements=[];
  if(isWon){statements.push(db.prepare("UPDATE crm_pipeline_stages SET is_won=0 WHERE tenant_id=? AND unit_id=? AND active=1").bind(context.tenantId,unitId));for(const prior of previousWinners.results||[])statements.push(stageAudit(db,context,user,"crm.pipeline_stage.updated",prior.id,{isWon:false,reassignedTo:id,name:prior.name,slug:prior.slug}));}
  if(isLost){statements.push(db.prepare("UPDATE crm_pipeline_stages SET is_lost=0 WHERE tenant_id=? AND unit_id=? AND active=1").bind(context.tenantId,unitId));for(const prior of previousLosers.results||[])statements.push(stageAudit(db,context,user,"crm.pipeline_stage.updated",prior.id,{isLost:false,reassignedTo:id,name:prior.name,slug:prior.slug}));}
  statements.push(db.prepare("INSERT INTO crm_pipeline_stages(id,tenant_id,unit_id,name,slug,color,position,is_won,is_lost) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,context.tenantId,unitId,name,slug,color,position,isWon?1:0,isLost?1:0));
  statements.push(stageAudit(db,context,user,"crm.pipeline_stage.created",id,{name,slug,color,position,isWon,isLost}));
  await db.batch(statements);return {id,tenant_id:context.tenantId,unit_id:unitId,name,slug,color,position,is_won:isWon?1:0,is_lost:isLost?1:0,active:1};
}

export async function updateCrmStage(db,context,user,id,input){
  requireStageManager(context);
  const stage=await db.prepare("SELECT * FROM crm_pipeline_stages WHERE id=? AND tenant_id=?").bind(id,context.tenantId).first();if(!stage)throw failure("Pipeline stage not found.",404);
  const unitId=String(stage.unit_id);if(!context.unitIds.includes(unitId))throw failure("You do not have access to this business unit.",403);
  const data={};if(Object.hasOwn(input,"name")){data.name=clean(input.name,80);if(data.name.length<2)throw failure("Stage name must be at least two characters.");}
  if(Object.hasOwn(input,"color")){data.color=clean(input.color,20);if(!STAGE_COLORS.has(data.color))throw failure("Choose a valid stage color.");}
  if(Object.hasOwn(input,"position")){data.position=Number(input.position);if(!Number.isSafeInteger(data.position)||data.position<0)throw failure("Stage position must be a non-negative whole number.");}
  if(Object.hasOwn(input,"is_won"))data.is_won=stageFlag(input.is_won)?1:0;
  if(Object.hasOwn(input,"is_lost"))data.is_lost=stageFlag(input.is_lost)?1:0;
  if(!Object.keys(data).length)throw failure("No stage changes were provided.");
  const isWon=Object.hasOwn(data,"is_won")?data.is_won===1:Number(stage.is_won)===1,isLost=Object.hasOwn(data,"is_lost")?data.is_lost===1:Number(stage.is_lost)===1;
  if(isWon&&isLost)throw failure("A stage cannot be both won and lost.");
  if(Object.hasOwn(data,"is_won")&&!isWon&&Number(stage.is_won)===1){const replacement=await db.prepare("SELECT 1 ok FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND active=1 AND is_won=1 AND id<>? LIMIT 1").bind(context.tenantId,unitId,id).first();if(!replacement)throw failure("Keep one active stage marked as won.");}
  if(Object.hasOwn(data,"is_lost")&&!isLost&&Number(stage.is_lost)===1){const replacement=await db.prepare("SELECT 1 ok FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND active=1 AND is_lost=1 AND id<>? LIMIT 1").bind(context.tenantId,unitId,id).first();if(!replacement)throw failure("Keep one active stage marked as lost.");}
  context.writeUnit=unitId;const statements=[];
  if(isWon&&Number(stage.is_won)!==1){const prior=await db.prepare("SELECT id,name,slug FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND active=1 AND is_won=1 AND id<>?").bind(context.tenantId,unitId,id).all();statements.push(db.prepare("UPDATE crm_pipeline_stages SET is_won=0 WHERE tenant_id=? AND unit_id=? AND active=1 AND id<>?").bind(context.tenantId,unitId,id));for(const previous of prior.results||[])statements.push(stageAudit(db,context,user,"crm.pipeline_stage.updated",previous.id,{isWon:false,reassignedTo:id,name:previous.name,slug:previous.slug}));}
  if(isLost&&Number(stage.is_lost)!==1){const prior=await db.prepare("SELECT id,name,slug FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND active=1 AND is_lost=1 AND id<>?").bind(context.tenantId,unitId,id).all();statements.push(db.prepare("UPDATE crm_pipeline_stages SET is_lost=0 WHERE tenant_id=? AND unit_id=? AND active=1 AND id<>?").bind(context.tenantId,unitId,id));for(const previous of prior.results||[])statements.push(stageAudit(db,context,user,"crm.pipeline_stage.updated",previous.id,{isLost:false,reassignedTo:id,name:previous.name,slug:previous.slug}));}
  statements.push(db.prepare(`UPDATE crm_pipeline_stages SET ${Object.keys(data).map(key=>`${key}=?`).join(",")} WHERE id=? AND tenant_id=? AND unit_id=?`).bind(...Object.values(data),id,context.tenantId,unitId));
  statements.push(stageAudit(db,context,user,"crm.pipeline_stage.updated",id,{fields:Object.keys(data),name:data.name||stage.name,slug:stage.slug}));
  await db.batch(statements);return {id,...stage,...data};
}

export async function archiveCrmStage(db,context,user,id){
  requireStageManager(context);
  const stage=await db.prepare("SELECT * FROM crm_pipeline_stages WHERE id=? AND tenant_id=? AND active=1").bind(id,context.tenantId).first();if(!stage)throw failure("Active pipeline stage not found.",404);
  const unitId=String(stage.unit_id);if(!context.unitIds.includes(unitId))throw failure("You do not have access to this business unit.",403);
  const assigned=await db.prepare("SELECT 1 ok FROM crm_leads WHERE tenant_id=? AND unit_id=? AND stage=? LIMIT 1").bind(context.tenantId,unitId,stage.slug).first();if(assigned)throw failure("Move the opportunities in this stage before archiving it.");
  const count=await db.prepare("SELECT COUNT(*) count FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND active=1").bind(context.tenantId,unitId).first();if(Number(count?.count||0)<=1)throw failure("Keep at least one active pipeline stage.");
  if(Number(stage.is_won)===1){const replacement=await db.prepare("SELECT 1 ok FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND active=1 AND is_won=1 AND id<>? LIMIT 1").bind(context.tenantId,unitId,id).first();if(!replacement)throw failure("Mark another stage as won before archiving this stage.");}
  if(Number(stage.is_lost)===1){const replacement=await db.prepare("SELECT 1 ok FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND active=1 AND is_lost=1 AND id<>? LIMIT 1").bind(context.tenantId,unitId,id).first();if(!replacement)throw failure("Mark another stage as lost before archiving this stage.");}
  context.writeUnit=unitId;await db.batch([db.prepare("UPDATE crm_pipeline_stages SET active=0 WHERE id=? AND tenant_id=? AND unit_id=?").bind(id,context.tenantId,unitId),stageAudit(db,context,user,"crm.pipeline_stage.archived",id,{name:stage.name,slug:stage.slug})]);return {id,active:0};
}

function normalize(resource,input,isCreate=true) {
  const allowed=FIELDS[resource]; if(!allowed) throw failure("CRM resource not found.",404);
  const out={}; for(const key of allowed) if(Object.hasOwn(input,key)) {
    const value=input[key];
    if(key.endsWith("_minor")||key==="progress"||key==="position") { const n=Number(value);if(value===""||value===null){out[key]=null;}else if(!Number.isSafeInteger(n)||n<0||((key==="progress")&&n>100))throw failure(`Invalid ${key.replaceAll("_"," ")}.`);else out[key]=n; }
    else if(["company_id","contact_id","lead_id","project_id","proposal_id","milestone_id","document_id","owner_user_id","completed_at","paid_at"].includes(key))out[key]=clean(value,200)||null;
    else out[key]=clean(value,["notes","details","description","scope","qualification"].includes(key)?6000:500)||null;
  }
  const required=(resource==="companies"||resource==="contacts"||resource==="projects"||resource==="proposal_templates")?"name":["leads","activities","milestones","deliverables","proposals","invoices","proposal_templates","project_risks"].includes(resource)?"title":null;
  if(resource==="activities"&&Object.hasOwn(input,"title")) out.title=clean(input.title,200);
  if((resource==="invoices"||resource==="payments")&&input.amount!==undefined)out.amount_minor=toMinorUnits(input.amount,"amount");
  if(resource==="leads"&&input.value!==undefined)out.value_minor=toMinorUnits(input.value,"opportunity value");
  if(resource==="proposals"&&input.amount!==undefined)out.amount_minor=toMinorUnits(input.amount,"proposal amount");
  if(isCreate){
    if(resource==="companies"||resource==="contacts")out.status ||= "prospect";
    if(resource==="leads")out.currency ||= "ZMW";
    if(resource==="projects")out.status ||= "planned";
    if(resource==="activities"){out.kind ||= "task";out.status ||= "open";out.priority ||= "medium";}
    if(resource==="milestones")out.status ||= "pending";
    if(resource==="deliverables")out.status ||= "not_started";
    if(resource==="project_risks"){out.status||="open";out.severity||="medium";}
    if(resource==="proposals"){out.status ||= "draft";out.currency ||= "ZMW";}
    if(resource==="invoices"){out.status ||= "draft";out.currency ||= "ZMW";}
    if(resource==="proposal_templates")out.currency ||= "ZMW";
    if(resource==="payments")out.method ||= "manual";
    if(required&&!out[required])throw failure(`${required} is required.`);
  }
  if(isCreate&&resource==="proposal_templates"&&(!out.name||!out.title))throw failure("Template name and proposal title are required.");
  const enums={companies:{status:["lead","prospect","client","partner","inactive","archived"]},contacts:{status:["lead","prospect","client","partner","inactive","archived"],contact_type:["person","organization"]},activities:{kind:["task","call","meeting","email","note","follow_up"],status:["open","completed","cancelled"],priority:["low","medium","high"]},projects:{status:["planned","active","on_hold","completed","cancelled"]},milestones:{status:["pending","in_progress","completed","blocked"]},deliverables:{status:["not_started","in_progress","in_review","completed"]},project_risks:{severity:["low","medium","high","critical"],status:["open","monitoring","mitigated","closed"]},proposals:{status:["draft","in_review","sent","accepted","rejected","expired"]},invoices:{status:["draft","sent","paid","overdue","cancelled"]}};
  for(const [key,allowedValues] of Object.entries(enums[resource]||{}))if(Object.hasOwn(out,key)&&!allowedValues.includes(out[key]))throw failure(`Invalid ${key.replaceAll("_"," ")}.`);
  for(const field of ["expected_close","due_at","due_date","valid_until","start_date","next_follow_up","paid_at","completed_at"])if(out[field]){
    const value=out[field],date=value.slice(0,10),validPattern=/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value);
    const validDay=Number.isFinite(Date.parse(`${date}T00:00:00Z`))&&new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)===date;
    if(!validPattern||!validDay||(value.length>10&&!Number.isFinite(Date.parse(value))))throw failure(`Invalid ${field.replaceAll("_"," ")}.`);
  }
  if(out.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email))throw failure("Enter a valid email address.");
  if(out.currency&&!/^[A-Z]{3}$/.test(out.currency))throw failure("Currency must be a three-letter code.");
  return out;
}

async function writeAudit(db,context,user,action,type,id,meta={}) {
  await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),context.tenantId,context.writeUnit||null,user.id,action,type,id,JSON.stringify(meta)).run();
}
async function relatedRows(db,context,unitId,data) {
  for(const [field,table] of [["company_id","crm_companies"],["contact_id","crm_contacts"],["lead_id","crm_leads"],["project_id","crm_projects"],["proposal_id","crm_proposals"],["milestone_id","crm_milestones"],["document_id","crm_documents"],["invoice_id","crm_invoices"]]) if(data[field]) {
    const exists=await db.prepare(`SELECT 1 ok FROM ${table} WHERE id=? AND tenant_id=? AND unit_id=?`).bind(data[field],context.tenantId,unitId).first();if(!exists)throw failure(`Selected ${field.replace("_id","")} is not available in this business unit.`);
  }
}
async function duplicateWarnings(db,resource,context,unitId,data) {
  if(!["companies","contacts"].includes(resource))return [];
  const table=TABLES[resource],conditions=["lower(name)=?"],bindings=[context.tenantId,unitId,clean(data.name,180).toLowerCase()];
  if(resource==="contacts"){
    if(data.email){conditions.push("lower(email)=?");bindings.push(clean(data.email,254).toLowerCase());}
    if(data.phone){conditions.push("phone=?");bindings.push(clean(data.phone,80));}
    if(data.company_id){conditions.push("company_id=? AND lower(name)=?");bindings.push(data.company_id,clean(data.name,180).toLowerCase());}
  }
  const {results=[]}=await db.prepare(`SELECT id,name,email FROM ${table} WHERE tenant_id=? AND unit_id=? AND status NOT IN ('inactive','archived') AND (${conditions.join(" OR ")}) LIMIT 4`).bind(...bindings).all();
  return results.map(row=>row.email?`${row.name} (${row.email})`:String(row.name));
}

export async function createCrmRecord(db,context,user,resource,input) {
  const table=TABLES[resource];if(!table)throw failure("CRM resource not found.",404);
  const unitId=clean(input.unitId,100);if(!context.unitIds.includes(unitId))throw failure("You do not have access to this business unit.",403);
  if(resource==="leads"&&!input.stage){const firstStage=await db.prepare("SELECT slug FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND active=1 AND is_won=0 AND is_lost=0 ORDER BY position,name COLLATE NOCASE,id LIMIT 1").bind(context.tenantId,unitId).first();if(!firstStage)throw failure("Configure an active open pipeline stage before adding opportunities.");input={...input,stage:firstStage.slug};}
  let acceptedProposal=null;
  if(resource==="projects"&&input.proposal_id){
    acceptedProposal=await db.prepare("SELECT id,title,scope,status,company_id,contact_id,lead_id FROM crm_proposals WHERE id=? AND tenant_id=? AND unit_id=?").bind(clean(input.proposal_id,100),context.tenantId,unitId).first();
    if(!acceptedProposal)throw failure("Selected proposal is not available in this business unit.");
    if(acceptedProposal.status!=="accepted")throw failure("Only an accepted proposal can start an engagement.");
    for(const field of ["company_id","contact_id","lead_id"])if(acceptedProposal[field]&&input[field]&&String(input[field])!==String(acceptedProposal[field]))throw failure("The engagement must keep the accepted proposal's client and opportunity links.");
    input={...input,company_id:input.company_id||acceptedProposal.company_id,contact_id:input.contact_id||acceptedProposal.contact_id,lead_id:input.lead_id||acceptedProposal.lead_id,name:input.name||acceptedProposal.title,description:input.description||acceptedProposal.scope||""};
  }
  const data=normalize(resource,input,true);await relatedRows(db,context,unitId,data);
  const leadStage=resource==="leads"?await db.prepare("SELECT slug,is_won,is_lost FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND slug=? AND active=1").bind(context.tenantId,unitId,data.stage).first():null;
  if(resource==="leads"&&!leadStage)throw failure("Choose an active pipeline stage in this business unit.");
  if(resource==="leads"&&(Number(leadStage.is_won)===1||Number(leadStage.is_lost)===1))throw failure("New opportunities must start in an open pipeline stage.");
  if((resource==="invoices"||resource==="payments"||(resource==="proposals"&&Object.hasOwn(data,"amount_minor"))||(resource==="leads"&&Object.hasOwn(data,"value_minor")))&&!canSeeFinancials(context,unitId))throw failure("Financial access is required for this change.",403);
  const duplicates=await duplicateWarnings(db,resource,context,unitId,data);
  if(data.owner_user_id){const assigned=await db.prepare("SELECT 1 ok FROM crm_unit_access WHERE tenant_id=? AND unit_id=? AND user_id=?").bind(context.tenantId,unitId,data.owner_user_id).first();if(!assigned)throw failure("Assign this teammate to the business unit before making them an owner.");}
  if(resource==="payments") {
    const invoice=await db.prepare("SELECT amount_minor FROM crm_invoices WHERE id=? AND tenant_id=? AND unit_id=?").bind(data.invoice_id,context.tenantId,unitId).first();if(!invoice)throw failure("Invoice not found.");
    const paid=await db.prepare("SELECT COALESCE(SUM(amount_minor),0) total FROM crm_payments WHERE tenant_id=? AND unit_id=? AND invoice_id=?").bind(context.tenantId,unitId,data.invoice_id).first();
    if(!data.amount_minor||Number(paid.total)+data.amount_minor>Number(invoice.amount_minor))throw failure("Payment must be positive and cannot exceed the remaining invoice balance.");
    data.paid_at ||= new Date().toISOString().slice(0,10);data.recorded_by=user.id;
  }
  if(["activities","milestones"].includes(resource)&&data.status==="completed")data.completed_at||=new Date().toISOString();
  if(resource==="milestones"||resource==="deliverables") { if(!data.project_id)throw failure("Project is required.");data.created_by=user.id;if(resource==="deliverables")data.updated_at=new Date().toISOString(); }
  if(resource==="documents")throw failure("Upload files through the secure document upload endpoint.",400);
  const id=crypto.randomUUID(),row={id,tenant_id:context.tenantId,unit_id:unitId,...data};
  if(!["payments"].includes(resource)){row.created_by=user.id;if(resource!=="milestones"&&resource!=="deliverables")row.updated_by=user.id;}
  const keys=Object.keys(row),insert=db.prepare(`INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map(()=>"?").join(",")})`).bind(...keys.map(key=>row[key]));
  if(acceptedProposal){
    const statements=[insert];
    const winningStage=data.lead_id?await db.prepare("SELECT slug FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND active=1 AND is_won=1").bind(context.tenantId,unitId).first():null;
    if(data.lead_id&&!winningStage)throw failure("Configure a winning pipeline stage before converting this opportunity.");
    if(data.owner_user_id)statements.push(db.prepare("INSERT OR IGNORE INTO crm_project_members(tenant_id,unit_id,project_id,user_id,project_role,added_by) VALUES(?,?,?,?,'project_owner',?)").bind(context.tenantId,unitId,id,data.owner_user_id,user.id));
    if(data.company_id)statements.push(db.prepare("UPDATE crm_companies SET status=CASE WHEN status IN ('lead','prospect') THEN 'client' ELSE status END,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=?").bind(user.id,data.company_id,context.tenantId,unitId));
    if(data.contact_id)statements.push(db.prepare("UPDATE crm_contacts SET status=CASE WHEN status IN ('lead','prospect') THEN 'client' ELSE status END,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=?").bind(user.id,data.contact_id,context.tenantId,unitId));
    if(data.lead_id)statements.push(db.prepare("UPDATE crm_leads SET stage=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=?").bind(winningStage.slug,user.id,data.lead_id,context.tenantId,unitId));
    statements.push(db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.projects.created_from_proposal','project',?,?)").bind(crypto.randomUUID(),context.tenantId,unitId,user.id,id,JSON.stringify({proposalId:acceptedProposal.id,companyId:data.company_id||null,contactId:data.contact_id||null,leadId:data.lead_id||null})));
    await db.batch(statements);
  }else if(resource==="proposals"){
    const firstVersion=db.prepare("INSERT INTO crm_proposal_versions(id,tenant_id,unit_id,proposal_id,version,title,scope,amount_minor,currency,valid_until,changed_by) VALUES(?,?,?,?,1,?,?,?,?,?,?)").bind(crypto.randomUUID(),context.tenantId,unitId,id,row.title,row.scope||null,row.amount_minor||null,row.currency,row.valid_until||null,user.id);
    await db.batch([insert,firstVersion]);
  }else{
    await insert.run();
    if(resource==="projects"&&data.owner_user_id)await db.prepare("INSERT OR IGNORE INTO crm_project_members(tenant_id,unit_id,project_id,user_id,project_role,added_by) VALUES(?,?,?,?,'project_owner',?)").bind(context.tenantId,unitId,id,data.owner_user_id,user.id).run();
  }
  if(resource==="payments") {const sum=await db.prepare("SELECT COALESCE(SUM(amount_minor),0) total FROM crm_payments WHERE tenant_id=? AND unit_id=? AND invoice_id=?").bind(context.tenantId,unitId,data.invoice_id).first();const invoiceStatus=Number(sum.total)>=Number((await db.prepare("SELECT amount_minor FROM crm_invoices WHERE id=?").bind(data.invoice_id).first()).amount_minor)?"paid":"sent";await db.prepare("UPDATE crm_invoices SET status=?,paid_at=CASE WHEN ?='paid' THEN ? ELSE paid_at END,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=?").bind(invoiceStatus,invoiceStatus,data.paid_at,user.id,data.invoice_id,context.tenantId,unitId).run();}
  if(!acceptedProposal){context.writeUnit=unitId;await writeAudit(db,context,user,`crm.${resource}.created`,resource,id,{});}
  return {id,...data,tenant_id:context.tenantId,unit_id:unitId,...(duplicates.length?{warnings:[`Possible matching record: ${duplicates.join("; ")}`]}:{})};
}

export async function updateCrmRecord(db,context,user,resource,id,input) {
  const table=TABLES[resource];if(!table||resource==="payments"||resource==="documents")throw failure("This CRM record cannot be edited here.",400);
  const existing=await db.prepare(`SELECT unit_id${resource==="leads"?",company_id,contact_id,stage,loss_reason":""} FROM ${table} WHERE id=? AND tenant_id=?`).bind(id,context.tenantId).first();if(!existing)throw failure("CRM record not found.",404);
  const unitId=String(existing.unit_id);if(!context.unitIds.includes(unitId))throw failure("You do not have access to this business unit.",403);
  const data=normalize(resource,input,false);if(!Object.keys(data).length)throw failure("No changes were provided.");await relatedRows(db,context,unitId,data);
  const leadStage=resource==="leads"&&data.stage?await db.prepare("SELECT slug,is_won,is_lost FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND slug=? AND active=1").bind(context.tenantId,unitId,data.stage).first():null;
  if(resource==="leads"&&data.stage&&!leadStage)throw failure("Choose an active pipeline stage in this business unit.");
  if(resource==="leads"&&Number(leadStage?.is_lost)===1&&!data.loss_reason&&!existing.loss_reason)throw failure("Add a reason before closing this opportunity as lost.");
  if((resource==="invoices"&&(Object.hasOwn(data,"amount_minor")||Object.hasOwn(data,"status")))||((resource==="proposals"||resource==="leads")&&Object.hasOwn(data,resource==="leads"?"value_minor":"amount_minor")))if(!canSeeFinancials(context,unitId))throw failure("Financial access is required for this change.",403);
  const oldProposal=resource==="proposals"?await db.prepare("SELECT * FROM crm_proposals WHERE id=? AND tenant_id=? AND unit_id=?").bind(id,context.tenantId,unitId).first():null;
  const proposalContentChanged=Boolean(oldProposal&&["title","scope","amount_minor","currency","valid_until"].some(field=>Object.hasOwn(data,field)&&String(data[field]??"")!==String(oldProposal[field]??"")));
  if(proposalContentChanged)data.version=Number(oldProposal.version||1)+1;
  if(data.owner_user_id){const assigned=await db.prepare("SELECT 1 ok FROM crm_unit_access WHERE tenant_id=? AND unit_id=? AND user_id=?").bind(context.tenantId,unitId,data.owner_user_id).first();if(!assigned)throw failure("Assign this teammate to the business unit before making them an owner.");}
  if(resource==="deliverables")data.updated_at=new Date().toISOString();
  else if(resource!=="milestones"){data.updated_by=user.id;data.updated_at=new Date().toISOString();}
  if(["activities","milestones"].includes(resource)&&Object.hasOwn(data,"status"))data.completed_at=data.status==="completed"?(data.completed_at||new Date().toISOString()):null;
  const keys=Object.keys(data);
  const updateStatement=db.prepare(`UPDATE ${table} SET ${keys.map(k=>`${k}=?`).join(",")} WHERE id=? AND tenant_id=? AND unit_id=?`).bind(...keys.map(k=>data[k]),id,context.tenantId,unitId);
  let auditWrittenWithUpdate=false;
  if(resource==="proposals"&&proposalContentChanged){
    const snapshot={...oldProposal,...data};
    const versionStatement=db.prepare("INSERT INTO crm_proposal_versions(id,tenant_id,unit_id,proposal_id,version,title,scope,amount_minor,currency,valid_until,changed_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),context.tenantId,unitId,id,snapshot.version,snapshot.title,snapshot.scope||null,snapshot.amount_minor||null,snapshot.currency,snapshot.valid_until||null,user.id);
    await db.batch([updateStatement,versionStatement]);
  }else if(resource==="leads"&&Number(leadStage?.is_won)===1){
    const companyId=String(data.company_id||existing.company_id||""),contactId=String(data.contact_id||existing.contact_id||"");
    const statements=[updateStatement];
    if(companyId)statements.push(db.prepare("UPDATE crm_companies SET status=CASE WHEN status IN ('lead','prospect') THEN 'client' ELSE status END,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=?").bind(user.id,companyId,context.tenantId,unitId));
    if(contactId)statements.push(db.prepare("UPDATE crm_contacts SET status=CASE WHEN status IN ('lead','prospect') THEN 'client' ELSE status END,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=?").bind(user.id,contactId,context.tenantId,unitId));
    statements.push(db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.leads.won','lead',?,?)").bind(crypto.randomUUID(),context.tenantId,unitId,user.id,id,JSON.stringify({companyId:companyId||null,contactId:contactId||null})));
    await db.batch(statements);auditWrittenWithUpdate=true;
  }else await updateStatement.run();
  if(resource==="projects"&&data.owner_user_id)await db.prepare("INSERT INTO crm_project_members(tenant_id,unit_id,project_id,user_id,project_role,added_by) VALUES(?,?,?,?,'project_owner',?) ON CONFLICT(tenant_id,unit_id,project_id,user_id) DO UPDATE SET project_role='project_owner',added_by=excluded.added_by").bind(context.tenantId,unitId,id,data.owner_user_id,user.id).run();
  if(resource==="milestones"){
    const totals=await db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed FROM crm_milestones WHERE tenant_id=? AND unit_id=? AND project_id=(SELECT project_id FROM crm_milestones WHERE id=?)").bind(context.tenantId,unitId,id).first();
    const progress=Number(totals?.total||0)?Math.round(Number(totals.completed||0)/Number(totals.total)*100):0;
    await db.prepare("UPDATE crm_projects SET progress=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT project_id FROM crm_milestones WHERE id=?) AND tenant_id=? AND unit_id=?").bind(progress,user.id,id,context.tenantId,unitId).run();
  }
  if(!auditWrittenWithUpdate){context.writeUnit=unitId;const action=resource==="leads"&&Number(leadStage?.is_lost)===1?"crm.leads.lost":`crm.${resource}.updated`;await writeAudit(db,context,user,action,resource,id,{fields:keys});}
  return {id,...data};
}

export async function replaceCrmProjectMembers(db,context,user,input) {
  if(!Array.isArray(input.userIds))throw failure("Choose project team members.");
  const projectId=clean(input.projectId,100);
  const project=await db.prepare("SELECT id,unit_id,owner_user_id FROM crm_projects WHERE id=? AND tenant_id=?").bind(projectId,context.tenantId).first();
  if(!project)throw failure("CRM project not found.",404);
  const unitId=String(project.unit_id);
  if(!context.unitIds.includes(unitId))throw failure("You do not have access to this business unit.",403);
  if(!context.superadmin&&context.role!=="unit_manager")throw failure("Unit manager access is required to manage the project team.",403);
  const userIds=[...new Set(input.userIds.map(value=>clean(value,100)).filter(Boolean))];
  if(project.owner_user_id)userIds.push(String(project.owner_user_id));
  const uniqueUserIds=[...new Set(userIds)];
  for(const userId of uniqueUserIds){
    const assigned=await db.prepare("SELECT 1 ok FROM crm_unit_access WHERE tenant_id=? AND unit_id=? AND user_id=?").bind(context.tenantId,unitId,userId).first();
    if(!assigned)throw failure("Project team members must have access to the project's business unit.");
  }
  const statements=[db.prepare("DELETE FROM crm_project_members WHERE tenant_id=? AND unit_id=? AND project_id=?").bind(context.tenantId,unitId,projectId),...uniqueUserIds.map(userId=>db.prepare("INSERT INTO crm_project_members(tenant_id,unit_id,project_id,user_id,project_role,added_by) VALUES(?,?,?,?,?,?)").bind(context.tenantId,unitId,projectId,userId,userId===project.owner_user_id?"project_owner":"consultant",user.id)),db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.projects.team_updated','project',?,?)").bind(crypto.randomUUID(),context.tenantId,unitId,user.id,projectId,JSON.stringify({userIds:uniqueUserIds}))];
  await db.batch(statements);
  return {projectId,userIds:uniqueUserIds};
}

export async function archiveCrmRecord(db,context,user,resource,id) {
  const table=TABLES[resource];if(!table||["payments","milestones","deliverables"].includes(resource))throw failure("This CRM record cannot be archived here.",400);
  const row=await db.prepare(`SELECT unit_id${resource==="documents"?",document_group_id":""} FROM ${table} WHERE id=? AND tenant_id=?`).bind(id,context.tenantId).first();if(!row)throw failure("CRM record not found.",404);
  const unitId=String(row.unit_id);if(!context.unitIds.includes(unitId))throw failure("You do not have access to this business unit.",403);
  const status={companies:"archived",contacts:"archived",activities:"cancelled",projects:"cancelled",proposals:"expired",invoices:"cancelled",documents:"archived",proposal_templates:"archived",project_risks:"archived"}[resource]||"inactive";
  if(resource==="documents")await db.prepare("UPDATE crm_documents SET status='archived' WHERE tenant_id=? AND unit_id=? AND document_group_id=?").bind(context.tenantId,unitId,row.document_group_id).run();
  else if(resource==="proposal_templates")await db.prepare("UPDATE crm_proposal_templates SET active=0,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=?").bind(user.id,id,context.tenantId,unitId).run();
  else if(resource==="leads"){
    const lostStage=await db.prepare("SELECT slug FROM crm_pipeline_stages WHERE tenant_id=? AND unit_id=? AND active=1 AND is_lost=1 LIMIT 1").bind(context.tenantId,unitId).first();
    if(!lostStage)throw failure("Set an active lost stage before archiving an opportunity.");
    await db.prepare("UPDATE crm_leads SET stage=?,loss_reason='Archived from CRM',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=?").bind(lostStage.slug,user.id,id,context.tenantId,unitId).run();
  }
  else await db.prepare(`UPDATE ${table} SET status=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=?`).bind(status,user.id,id,context.tenantId,unitId).run();
  context.writeUnit=unitId;await writeAudit(db,context,user,`crm.${resource}.archived`,resource,id,{status,...(resource==="documents"?{documentGroupId:row.document_group_id}: {})});return {id,status};
}

export async function grantCrmMember(db,context,actor,input) {
  if(!context.superadmin)throw failure("CRM superadmin access is required.",403);
  const email=clean(input.email,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw failure("Enter a valid Panigale Auth email.");
  const target=await db.prepare("SELECT id,email FROM crm_users WHERE lower(email)=?").bind(email).first();if(!target)throw failure("This person must sign in with Panigale Auth once before access can be granted.",404);
  const role=input.role==="superadmin"?"superadmin":input.role==="unit_manager"?"unit_manager":"member";
  const units=Array.isArray(input.unitIds)?[...new Set(input.unitIds.map(value=>clean(value,100)))]:[];
  const financialUnits=Array.isArray(input.financialUnitIds)?[...new Set(input.financialUnitIds.map(value=>clean(value,100)))]:[];
  if(role!=="superadmin"&&!units.length)throw failure("Choose at least one business unit.");
  for(const unitId of units)if(!context.unitIds.includes(unitId))throw failure("One or more selected business units are unavailable.",403);
  if(role==="superadmin"&&financialUnits.length)throw failure("Financial visibility is implicit for CRM superadmins.");
  for(const unitId of financialUnits)if(!units.includes(unitId))throw failure("Financial visibility can only be granted for assigned units.",400);
  if(target.id===actor.id&&role!=="superadmin")throw failure("You cannot remove your own administrator access.");
  await db.prepare("INSERT INTO crm_memberships(tenant_id,user_id,role,granted_by) VALUES(?,?,?,?) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=excluded.role,granted_by=excluded.granted_by").bind(context.tenantId,target.id,role,actor.id).run();
  await db.prepare("DELETE FROM crm_unit_access WHERE tenant_id=? AND user_id=?").bind(context.tenantId,target.id).run();
  if(role!=="superadmin")for(const unitId of units)await db.prepare("INSERT INTO crm_unit_access(tenant_id,unit_id,user_id,unit_role,can_view_financials,granted_by) VALUES(?,?,?,?,?,?)").bind(context.tenantId,unitId,target.id,role==="unit_manager"?"manager":"member",financialUnits.includes(unitId)?1:0,actor.id).run();
  await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,'crm.access.granted','user',?,?)").bind(crypto.randomUUID(),context.tenantId,actor.id,target.id,JSON.stringify({email,role,unitIds:units,financialUnitIds:financialUnits})).run();
  return {userId:target.id,email:target.email,role,unitIds:units,financialUnitIds:financialUnits};
}

export async function revokeCrmMember(db,context,actor,userId) {
  if(!context.superadmin)throw failure("CRM superadmin access is required.",403);if(userId===actor.id)throw failure("You cannot revoke your own CRM access.");
  const target=await db.prepare("SELECT role FROM crm_memberships WHERE tenant_id=? AND user_id=?").bind(context.tenantId,userId).first();if(!target)throw failure("CRM member not found.",404);
  if(target.role==="superadmin"){const count=await db.prepare("SELECT COUNT(*) count FROM crm_memberships WHERE tenant_id=? AND role='superadmin'").bind(context.tenantId).first();if(Number(count.count)<=1)throw failure("At least one CRM superadmin must remain.",409);}
  await db.prepare("DELETE FROM crm_memberships WHERE tenant_id=? AND user_id=?").bind(context.tenantId,userId).run();await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,'crm.access.revoked','user',?,'{}')").bind(crypto.randomUUID(),context.tenantId,actor.id,userId).run();return {userId,revoked:true};
}

export async function createCrmTenant() { throw failure("Tenant onboarding is reserved for a later SaaS administration flow.",403); }
export async function createCrmUnit(db,context,actor,input) {
  if(!context.superadmin)throw failure("CRM superadmin access is required.",403);const name=clean(input.name,160);const slug=clean(input.slug||name.toLowerCase().replace(/[^a-z0-9]+/g,"-"),120).toLowerCase();if(name.length<2||slug.length<2)throw failure("Enter a business unit name.");
  const id=crypto.randomUUID();await db.prepare("INSERT INTO crm_units(id,tenant_id,name,slug,category,website) VALUES(?,?,?,?,?,?)").bind(id,context.tenantId,name,slug,clean(input.category,120)||"Business unit",clean(input.website,500)||null).run();
  for(const [stageSlug,stageName,color,position,isWon,isLost]of DEFAULT_STAGES)await db.prepare("INSERT INTO crm_pipeline_stages(id,tenant_id,unit_id,name,slug,color,position,is_won,is_lost) VALUES(?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),context.tenantId,id,stageName,stageSlug,color,position,isWon,isLost).run();
  await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.unit.created','unit',?,'{}')").bind(crypto.randomUUID(),context.tenantId,id,actor.id,id).run();return {id,name,slug,active:1};
}
export async function deactivateCrmUnit(db,context,actor,unitId) { if(!context.superadmin)throw failure("CRM superadmin access is required.",403);if(context.units.length<2)throw failure("A workspace must keep an active business unit.",409);await db.prepare("UPDATE crm_units SET active=0 WHERE id=? AND tenant_id=?").bind(unitId,context.tenantId).run();return {id:unitId,active:false}; }
