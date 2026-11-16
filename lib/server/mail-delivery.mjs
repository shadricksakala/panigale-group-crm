const emailPattern=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export async function getVerifiedCrmMailSender(mailGateway,tenantId,unitId){
  if(!mailGateway)return null;
  try{
    const query=new URLSearchParams({tenantId:String(tenantId),unitId:String(unitId)});
    const response=await mailGateway.fetch(`https://mail-gateway.internal/sender-identity?${query}`,{headers:{accept:"application/json"}});
    if(!response.ok)return null;
    const data=await response.json().catch(()=>null);
    const from=typeof data?.from==="string"?data.from.trim().toLowerCase():"";
    return data?.verified===true&&emailPattern.test(from)?from:null;
  }catch{return null;}
}

async function deliver(mailGateway,message,idempotencyKey,approvedSender=null){
  const payload={tenantId:message.tenant_id,unitId:message.unit_id,to:message.recipient_email,subject:message.subject,text:message.body_text,...(approvedSender?{from:approvedSender}:{})};
  const response=await mailGateway.fetch("https://mail-gateway.internal/send",{method:"POST",headers:{"content-type":"application/json",accept:"application/json","idempotency-key":idempotencyKey},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error("mail_gateway_rejected"),{status:response.status});
  if(approvedSender&&String(data.from||"").trim().toLowerCase()!==approvedSender)throw Object.assign(new Error("mail_gateway_sender_mismatch"),{status:502,retryable:false});
  if(typeof data.messageId!=="string"||!data.messageId)throw Object.assign(new Error("mail_gateway_message_id_missing"),{status:502,retryable:false});
  return data.messageId;
}
function retryAt(attempt,now){const minutes=Math.min(360,Math.max(1,2**Math.min(attempt,8)));return new Date(now+minutes*60000).toISOString();}

export async function deliverCrmEmailOutbox(db,mailGateway,enabled,nowValue=Date.now()){
  if(String(enabled)!=="true"||!mailGateway)return {enabled:false,attempted:0,sent:0,failed:0};
  const now=Number(nowValue),[internal,client]=await Promise.all([
    db.prepare("SELECT * FROM crm_email_outbox WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at LIMIT 10").bind(new Date(now).toISOString()).all(),
    db.prepare("SELECT o.*,d.message_kind FROM crm_client_email_outbox o JOIN crm_email_drafts d ON d.id=o.draft_id WHERE o.status='queued' AND (o.next_attempt_at IS NULL OR o.next_attempt_at<=?) ORDER BY o.created_at LIMIT 10").bind(new Date(now).toISOString()).all(),
  ]);
  let attempted=0,sent=0,failed=0;
  const jobs=[...(internal.results||[]).map(row=>({...row,channel:"internal",key:row.idempotency_key})),...(client.results||[]).map(row=>({...row,channel:"client",key:row.idempotency_key}))].slice(0,15);
  for(const job of jobs){
    attempted++;const attempts=Number(job.attempts||0)+1;
    try{
      let approvedSender=null;
      if(job.channel==="client"){
        const action=job.message_kind==="receipt"?"crm.email.receipt_queued":"crm.email.approved";
        const approval=await db.prepare("SELECT metadata_json FROM crm_audit_events WHERE tenant_id=? AND unit_id=? AND entity_type='email_draft' AND entity_id=? AND action=? ORDER BY created_at DESC LIMIT 1").bind(job.tenant_id,job.unit_id,job.draft_id,action).first();
        try{approvedSender=String(JSON.parse(String(approval?.metadata_json||"{}")).senderEmail||"").trim().toLowerCase();}catch{}
        if(!emailPattern.test(approvedSender))throw Object.assign(new Error("approved_sender_missing"),{status:409,retryable:false});
        const currentSender=await getVerifiedCrmMailSender(mailGateway,job.tenant_id,job.unit_id);
        if(currentSender!==approvedSender)throw Object.assign(new Error("approved_sender_changed"),{status:409,retryable:false});
      }
      const messageId=await deliver(mailGateway,job,job.key,approvedSender);
      if(job.channel==="internal")await db.prepare("UPDATE crm_email_outbox SET status='sent',attempts=?,sent_at=CURRENT_TIMESTAMP,next_attempt_at=NULL,last_error_code=NULL WHERE id=? AND status='queued'").bind(attempts,job.id).run();
      else{
        await db.prepare("UPDATE crm_client_email_outbox SET status='sent',attempts=?,sent_at=CURRENT_TIMESTAMP,next_attempt_at=NULL,last_error_code=NULL WHERE id=? AND status='queued'").bind(attempts,job.id).run();
        await db.prepare("UPDATE crm_email_drafts SET status='sent',provider_message_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(messageId,job.draft_id).run();
        await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) SELECT ?,tenant_id,unit_id,COALESCE(approved_by_user_id,created_by_user_id),'crm.email.sent','email_draft',id,'{}' FROM crm_email_drafts WHERE id=?").bind(crypto.randomUUID(),job.draft_id).run();
      }
      sent++;
    }catch(error){
      const final=error?.retryable===false||attempts>=8,code=`gateway_${Number(error?.status||0)||"unavailable"}`;
      if(job.channel==="internal")await db.prepare("UPDATE crm_email_outbox SET status=?,attempts=?,next_attempt_at=?,last_error_code=? WHERE id=? AND status='queued'").bind(final?"failed":"queued",attempts,final?null:retryAt(attempts,now),code,job.id).run();
      else{
        await db.prepare("UPDATE crm_client_email_outbox SET status=?,attempts=?,next_attempt_at=?,last_error_code=? WHERE id=? AND status='queued'").bind(final?"failed":"queued",attempts,final?null:retryAt(attempts,now),code,job.id).run();
        if(final)await db.prepare("UPDATE crm_email_drafts SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(job.draft_id).run();
      }
      failed++;console.error("crm_mail_delivery_attempt_failed",{channel:job.channel,status:error?.status||0,attempts,final});
    }
  }
  return {enabled:true,attempted,sent,failed};
}
