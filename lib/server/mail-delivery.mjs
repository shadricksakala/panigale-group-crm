import { getCurrentCrmReminder } from "./crm-reminders.mjs";

const emailPattern=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const CRM_SUPPORT_SENDERS=Object.freeze({panipay:"panipay@panigale.tech",euroza:"euroza@panigale.tech"});

/** @param {string|null} [appSlug] */
export async function getConfiguredCrmSupportSender(db,tenantId,unitId,appSlug=null){
  const integration=appSlug
    ?await db.prepare("SELECT app_slug,support_email FROM crm_support_integrations WHERE tenant_id=? AND unit_id=? AND app_slug=? AND active=1 LIMIT 1").bind(tenantId,unitId,appSlug).first()
    :await db.prepare("SELECT app_slug,support_email FROM crm_support_integrations WHERE tenant_id=? AND unit_id=? AND active=1 ORDER BY CASE app_slug WHEN 'panipay' THEN 0 WHEN 'euroza' THEN 1 ELSE 2 END LIMIT 1").bind(tenantId,unitId).first();
  const sender=String(integration?.support_email||"").trim().toLowerCase();
  return CRM_SUPPORT_SENDERS[integration?.app_slug]===sender?sender:null;
}

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

export async function deliverCrmEmailOutbox(db,mailGateway,emailService,enabled,nowValue=Date.now()){
  if(String(enabled)!=="true"||!mailGateway&&!emailService)return {enabled:false,attempted:0,sent:0,failed:0};
  const now=Number(nowValue),[internal,client]=await Promise.all([
    db.prepare("SELECT * FROM crm_email_outbox WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at LIMIT 10").bind(new Date(now).toISOString()).all(),
    db.prepare("SELECT o.*,d.message_kind,d.support_message_id,i.app_slug,i.support_email,i.app_name FROM crm_client_email_outbox o JOIN crm_email_drafts d ON d.id=o.draft_id LEFT JOIN crm_support_messages m ON m.id=d.support_message_id LEFT JOIN crm_support_tickets t ON t.id=m.ticket_id AND t.tenant_id=m.tenant_id AND t.unit_id=m.unit_id LEFT JOIN crm_support_integrations i ON i.tenant_id=t.tenant_id AND i.unit_id=t.unit_id AND i.app_slug=t.source_app WHERE o.status='queued' AND (o.next_attempt_at IS NULL OR o.next_attempt_at<=?) ORDER BY o.created_at LIMIT 10").bind(new Date(now).toISOString()).all(),
  ]);
  let attempted=0,sent=0,failed=0;
  const jobs=[...(internal.results||[]).map(row=>({...row,channel:"internal",key:row.idempotency_key})),...(client.results||[]).map(row=>({...row,channel:"client",key:row.idempotency_key}))].slice(0,15);
  for(const job of jobs){
    attempted++;const attempts=Number(job.attempts||0)+1;
    let nativeSendClaimed=false;
    try{
      if(job.channel==="internal"&&job.message_type==="task_reminder"){
        const current=await getCurrentCrmReminder(db,job,now);
        if(!current){
          await db.prepare("UPDATE crm_email_outbox SET status='failed',next_attempt_at=NULL,last_error_code='reminder_stale' WHERE id=? AND status='queued'").bind(job.id).run();
          failed++;continue;
        }
        if(job.recipient_email!==current.recipient_email||job.subject!==current.subject||job.body_text!==current.body_text){
          await db.prepare("UPDATE crm_email_outbox SET recipient_email=?,subject=?,body_text=? WHERE id=? AND status='queued'").bind(current.recipient_email,current.subject,current.body_text,job.id).run();
          Object.assign(job,current);
        }
      }
      let approvedSender=null;
      if(job.channel==="client"){
        const action=job.message_kind==="receipt"?"crm.email.receipt_queued":"crm.email.approved";
        const approval=await db.prepare("SELECT metadata_json FROM crm_audit_events WHERE tenant_id=? AND unit_id=? AND entity_type='email_draft' AND entity_id=? AND action=? ORDER BY created_at DESC LIMIT 1").bind(job.tenant_id,job.unit_id,job.draft_id,action).first();
        try{approvedSender=String(JSON.parse(String(approval?.metadata_json||"{}")).senderEmail||"").trim().toLowerCase();}catch{}
        if(!emailPattern.test(approvedSender))throw Object.assign(new Error("approved_sender_missing"),{status:409,retryable:false});
        if(job.support_message_id&&emailService){
          if(CRM_SUPPORT_SENDERS[job.app_slug]!==approvedSender||String(job.support_email||"").toLowerCase()!==approvedSender)throw Object.assign(new Error("support_sender_changed"),{status:409,retryable:false});
        }else{
          const currentSender=await getVerifiedCrmMailSender(mailGateway,job.tenant_id,job.unit_id);
          if(currentSender!==approvedSender)throw Object.assign(new Error("approved_sender_changed"),{status:409,retryable:false});
        }
      }
      let messageId;
      if(job.channel==="client"&&job.support_message_id&&emailService){
        const claim=await db.prepare("UPDATE crm_client_email_outbox SET status='failed',attempts=?,next_attempt_at=NULL,last_error_code='email_service_delivery_started' WHERE id=? AND status='queued'").bind(attempts,job.id).run();
        if(!Number(claim.meta?.changes||0))continue;
        nativeSendClaimed=true;
        await db.prepare("UPDATE crm_email_drafts SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(job.draft_id).run();
        const result=await emailService.send({from:{email:approvedSender,name:`${job.app_name||"Panigale"} Support`},to:job.recipient_email,subject:job.subject,text:job.body_text});
        messageId=typeof result?.messageId==="string"?result.messageId:"";
        if(!messageId)throw Object.assign(new Error("email_service_message_id_missing"),{status:502,retryable:false});
      }else messageId=await deliver(mailGateway,job,job.key,approvedSender);
      if(job.channel==="internal")await db.prepare("UPDATE crm_email_outbox SET status='sent',attempts=?,sent_at=CURRENT_TIMESTAMP,next_attempt_at=NULL,last_error_code=NULL WHERE id=? AND status='queued'").bind(attempts,job.id).run();
      else{
        const outboxUpdate=nativeSendClaimed
          ?db.prepare("UPDATE crm_client_email_outbox SET status='sent',attempts=?,sent_at=CURRENT_TIMESTAMP,next_attempt_at=NULL,last_error_code=NULL WHERE id=? AND status='failed' AND last_error_code='email_service_delivery_started'").bind(attempts,job.id)
          :db.prepare("UPDATE crm_client_email_outbox SET status='sent',attempts=?,sent_at=CURRENT_TIMESTAMP,next_attempt_at=NULL,last_error_code=NULL WHERE id=? AND status='queued'").bind(attempts,job.id);
        const outboxResult=await outboxUpdate.run();
        if(!Number(outboxResult.meta?.changes||0))throw Object.assign(new Error("email_outbox_claim_lost"),{status:409,retryable:false});
        await db.prepare("UPDATE crm_email_drafts SET status='sent',provider_message_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?").bind(messageId,job.draft_id,nativeSendClaimed?"failed":"queued").run();
        await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) SELECT ?,tenant_id,unit_id,COALESCE(approved_by_user_id,created_by_user_id),'crm.email.sent','email_draft',id,'{}' FROM crm_email_drafts WHERE id=?").bind(crypto.randomUUID(),job.draft_id).run();
      }
      sent++;
    }catch(error){
      const final=nativeSendClaimed||error?.retryable===false||attempts>=8,code=nativeSendClaimed?"email_service_delivery_uncertain":`gateway_${Number(error?.status||0)||"unavailable"}`;
      if(nativeSendClaimed){
        await db.prepare("UPDATE crm_client_email_outbox SET attempts=?,next_attempt_at=NULL,last_error_code=? WHERE id=? AND status='failed' AND last_error_code='email_service_delivery_started'").bind(attempts,code,job.id).run();
      }else if(job.channel==="internal")await db.prepare("UPDATE crm_email_outbox SET status=?,attempts=?,next_attempt_at=?,last_error_code=? WHERE id=? AND status='queued'").bind(final?"failed":"queued",attempts,final?null:retryAt(attempts,now),code,job.id).run();
      else{
        await db.prepare("UPDATE crm_client_email_outbox SET status=?,attempts=?,next_attempt_at=?,last_error_code=? WHERE id=? AND status='queued'").bind(final?"failed":"queued",attempts,final?null:retryAt(attempts,now),code,job.id).run();
        if(final)await db.prepare("UPDATE crm_email_drafts SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(job.draft_id).run();
      }
      failed++;console.error("crm_mail_delivery_attempt_failed",{channel:job.channel,status:error?.status||0,attempts,final});
    }
  }
  return {enabled:true,attempted,sent,failed};
}

export async function deliverCrmSupportOutbox(db,mailGateway,emailService,enabled,nowValue=Date.now()){
  if(String(enabled)!=="true"||!mailGateway&&!emailService)return {enabled:false,attempted:0,sent:0,failed:0};
  const {results=[]}=await db.prepare(`SELECT o.*,i.app_slug,i.support_email,i.app_name,p.receipt_auto_enabled FROM crm_support_email_outbox o JOIN crm_support_tickets t ON t.id=o.ticket_id AND t.tenant_id=o.tenant_id AND t.unit_id=o.unit_id LEFT JOIN crm_support_integrations i ON i.tenant_id=t.tenant_id AND i.unit_id=t.unit_id AND i.app_slug=t.source_app LEFT JOIN crm_email_unit_settings p ON p.tenant_id=o.tenant_id AND p.unit_id=o.unit_id WHERE o.status='queued' AND (o.next_attempt_at IS NULL OR o.next_attempt_at<=?) ORDER BY o.created_at LIMIT 12`).bind(new Date(Number(nowValue)).toISOString()).all();
  let sent=0,failed=0;
  for(const row of results){
    const attempts=Number(row.attempts||0)+1;
    let nativeSendClaimed=false;
    try{
      if(Number(row.receipt_auto_enabled)!==1){await db.prepare("UPDATE crm_support_email_outbox SET status='cancelled',last_error_code='receipt_disabled' WHERE id=? AND status='queued'").bind(row.id).run();continue;}
      let providerId="";
      const configuredSender=String(row.support_email||"").trim().toLowerCase();
      const gatewaySender=mailGateway?await getVerifiedCrmMailSender(mailGateway,row.tenant_id,row.unit_id):null;
      if(gatewaySender&&configuredSender&&gatewaySender===configuredSender){
        providerId=await deliver(mailGateway,row,row.idempotency_key,gatewaySender);
      }else{
        const sender=configuredSender;
        if(!emailService||!sender||CRM_SUPPORT_SENDERS[row.app_slug]!==sender)throw Object.assign(new Error("support_sender_missing"),{status:409,retryable:false});
        const claim=await db.prepare("UPDATE crm_support_email_outbox SET status='failed',attempts=?,next_attempt_at=NULL,last_error_code='email_service_delivery_started' WHERE id=? AND status='queued'").bind(attempts,row.id).run();
        if(!Number(claim.meta?.changes||0))continue;
        nativeSendClaimed=true;
        const result=await emailService.send({from:{email:sender,name:`${row.app_name||"Panigale"} Support`},to:row.recipient_email,subject:row.subject,text:row.body_text});
        providerId=typeof result?.messageId==="string"?result.messageId:"";
        if(!providerId)throw Object.assign(new Error("email_service_message_id_missing"),{status:502,retryable:false});
      }
      const outboxUpdate=nativeSendClaimed
        ?db.prepare("UPDATE crm_support_email_outbox SET status='sent',attempts=?,sent_at=CURRENT_TIMESTAMP,next_attempt_at=NULL,last_error_code=NULL WHERE id=? AND status='failed' AND last_error_code='email_service_delivery_started'").bind(attempts,row.id)
        :db.prepare("UPDATE crm_support_email_outbox SET status='sent',attempts=?,sent_at=CURRENT_TIMESTAMP,next_attempt_at=NULL,last_error_code=NULL WHERE id=? AND status='queued'").bind(attempts,row.id);
      const outboxResult=await outboxUpdate.run();
      if(!Number(outboxResult.meta?.changes||0))throw Object.assign(new Error("support_email_outbox_claim_lost"),{status:409,retryable:false});
      await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,'crm.support.email_sent','support_ticket',?,?)").bind(crypto.randomUUID(),row.tenant_id,row.unit_id,row.ticket_id,JSON.stringify({providerId})).run();sent++;
    }catch(error){
      const final=nativeSendClaimed||error?.retryable===false||attempts>=8,status=Number(error?.status||0)||"unavailable",retry=new Date(Number(nowValue)+Math.min(360,2**Math.min(attempts,8))*60000).toISOString();
      if(nativeSendClaimed)await db.prepare("UPDATE crm_support_email_outbox SET attempts=?,next_attempt_at=NULL,last_error_code='email_service_delivery_uncertain' WHERE id=? AND status='failed' AND last_error_code='email_service_delivery_started'").bind(attempts,row.id).run();
      else await db.prepare("UPDATE crm_support_email_outbox SET status=?,attempts=?,next_attempt_at=?,last_error_code=? WHERE id=? AND status='queued'").bind(final?"failed":"queued",attempts,final?null:retry,`gateway_${status}`,row.id).run();failed++;
      console.error("crm_support_email_delivery_failed",{status,attempts,final});
    }
  }
  return {enabled:true,attempted:results.length,sent,failed};
}
