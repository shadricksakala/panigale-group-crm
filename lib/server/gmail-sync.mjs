import { decryptIntegrationValue, encryptIntegrationValue } from "./google-integrations.mjs";

const failCode = async (db,job,code,status="failed") => db.prepare("UPDATE crm_email_sync_jobs SET status=?,last_error_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,code,job.id).run();
const unbase64 = value => {
  const normalized=String(value||"").replaceAll("-","+").replaceAll("_","/");
  const binary=atob(normalized+"=".repeat((4-normalized.length%4)%4));
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
};
const decodeText = value => { try{return new TextDecoder("utf-8",{fatal:false}).decode(unbase64(value));}catch{return "";} };
const head = (message,name) => String(message.payload?.headers?.find(item=>String(item.name).toLowerCase()===name.toLowerCase())?.value||"").slice(0,1000);
function walkParts(part,body,attachments){
  if(!part)return;
  const filename=String(part.filename||"").slice(0,200),attachmentId=part.body?.attachmentId;
  if(filename&&attachmentId){attachments.push({id:String(attachmentId),filename,mimeType:String(part.mimeType||"application/octet-stream").slice(0,160),size:Number(part.body?.size||0)});return;}
  if(part.body?.data){const text=decodeText(part.body.data);if(part.mimeType==="text/plain"&&!body.text)body.text=text.slice(0,200000);if(part.mimeType==="text/html"&&!body.html)body.html=text.slice(0,300000);}
  for(const child of part.parts||[])walkParts(child,body,attachments);
}
function extractEmails(value){return [...new Set(String(value||"").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[])].map(item=>item.toLowerCase()).slice(0,100);}

async function gmailFetch(token,path){
  const response=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{headers:{authorization:`Bearer ${token}`,accept:"application/json"}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(`Google Gmail request failed (${response.status}).`);error.status=response.status;error.reason=String(data.error?.status||data.error?.errors?.[0]?.reason||"unknown").slice(0,80);throw error;}
  return data;
}

export async function googleAccessToken(db,env,connection){
  const expires=Date.parse(String(connection.access_token_expires_at||""));
  if(connection.access_token_ciphertext&&Number.isFinite(expires)&&expires>Date.now()+60000)return decryptIntegrationValue(env,connection.access_token_ciphertext);
  if(!connection.refresh_token_ciphertext)throw Object.assign(new Error("refresh_missing"),{status:401,reason:"refresh_missing"});
  const refresh=await decryptIntegrationValue(env,connection.refresh_token_ciphertext);
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",accept:"application/json"},body:new URLSearchParams({client_id:String(env.GOOGLE_OAUTH_CLIENT_ID||""),client_secret:String(env.GOOGLE_OAUTH_CLIENT_SECRET||""),grant_type:"refresh_token",refresh_token:refresh})});
  const tokens=await response.json().catch(()=>({}));
  if(!response.ok||typeof tokens.access_token!=="string")throw Object.assign(new Error("refresh_failed"),{status:response.status,reason:String(tokens.error||"refresh_failed")});
  const encrypted=await encryptIntegrationValue(env,tokens.access_token),expiresAt=new Date(Date.now()+Number(tokens.expires_in||3600)*1000).toISOString();
  await db.prepare("UPDATE crm_google_connections SET access_token_ciphertext=?,access_token_expires_at=? WHERE id=?").bind(encrypted,expiresAt,connection.id).run();
  return tokens.access_token;
}

async function storeMessage(db,bucket,connection,token,summary){
  const message=await gmailFetch(token,`messages/${encodeURIComponent(summary.id)}?format=full`);
  const exists=await db.prepare("SELECT id FROM crm_email_messages WHERE connection_id=? AND provider_message_id=?").bind(connection.id,message.id).first();
  if(exists)return false;
  const body={text:"",html:""},attachments=[];walkParts(message.payload,body,attachments);
  const from=head(message,"from"),to=extractEmails(head(message,"to")),cc=extractEmails(head(message,"cc"));
  const messageId=crypto.randomUUID(),labels=Array.isArray(message.labelIds)?message.labelIds:[],received=message.internalDate?new Date(Number(message.internalDate)).toISOString():null;
  const sentDate=Date.parse(head(message,"date"));
  const inserted=await db.prepare(`INSERT OR IGNORE INTO crm_email_messages(id,tenant_id,unit_id,connection_id,private_owner_user_id,provider_message_id,provider_thread_id,from_email,to_emails_json,cc_emails_json,subject,snippet,body_text,body_html,sent_at,received_at,direction)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(messageId,connection.tenant_id,connection.unit_id,connection.id,connection.connection_scope==="personal"?connection.owner_user_id:null,String(message.id),String(message.threadId||""),extractEmails(from)[0]||null,JSON.stringify(to),JSON.stringify(cc),head(message,"subject").slice(0,998),String(message.snippet||"").slice(0,1000),body.text,body.html,Number.isFinite(sentDate)?new Date(sentDate).toISOString():received,received,labels.includes("SENT")?"outbound":"inbound").run();
  const sender=extractEmails(from)[0]||"",automatic=String(head(message,"auto-submitted")).toLowerCase(),precedence=String(head(message,"precedence")).toLowerCase(),hasList=Boolean(head(message,"list-id"));
  if(inserted.meta?.changes&&labels.includes("INBOX")&&sender&&sender!==String(connection.email).toLowerCase()&&!/no.?reply|mailer-daemon|notifications?@/i.test(sender)&&(!automatic||automatic==="no")&&!/bulk|junk|list/.test(precedence)&&!hasList){
    const settings=await db.prepare("SELECT receipt_auto_enabled,receipt_subject,receipt_body FROM crm_email_unit_settings WHERE tenant_id=? AND unit_id=?").bind(connection.tenant_id,connection.unit_id).first();
    if(Number(settings?.receipt_auto_enabled)===1){
      const draftId=crypto.randomUUID(),subject=String(settings.receipt_subject||"We received your message").slice(0,250),receipt=String(settings.receipt_body||"Thank you for contacting us. We have received your message and will direct it to the right person.").slice(0,4000),key=`crm-receipt:${connection.id}:${message.id}`;
      const saved=await db.prepare(`INSERT OR IGNORE INTO crm_email_drafts(id,tenant_id,unit_id,created_by_user_id,connection_id,source_message_id,recipient_email,subject,body_text,message_kind,status,approval_required)
        VALUES(?,?,?,?,?,?,?,?,?,'receipt','queued',0)`).bind(draftId,connection.tenant_id,connection.unit_id,connection.connected_by_user_id,connection.id,messageId,sender,subject,receipt).run();
      if(saved.meta?.changes)await db.prepare(`INSERT OR IGNORE INTO crm_client_email_outbox(id,tenant_id,unit_id,draft_id,recipient_email,subject,body_text,idempotency_key,status)
        VALUES(?,?,?,?,?,?,?,?,'queued')`).bind(crypto.randomUUID(),connection.tenant_id,connection.unit_id,draftId,sender,subject,receipt,key).run();
    }
  }
  for(const attachment of attachments){
    if(attachment.size<0||attachment.size>25*1024*1024)continue;
    try{
      const resource=await gmailFetch(token,`messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(attachment.id)}`);
      const bytes=unbase64(resource.data);if(bytes.byteLength>25*1024*1024)continue;
      const id=crypto.randomUUID(),key=`email/${connection.tenant_id}/${connection.unit_id}/${connection.id}/${messageId}/${id}`;
      await bucket.put(key,bytes,{httpMetadata:{contentType:attachment.mimeType}});
      await db.prepare("INSERT INTO crm_email_attachments(id,tenant_id,unit_id,message_id,filename,mime_type,size_bytes,storage_key) VALUES(?,?,?,?,?,?,?,?)").bind(id,connection.tenant_id,connection.unit_id,messageId,attachment.filename,attachment.mimeType,bytes.byteLength,key).run();
    }catch(error){console.error("crm_gmail_attachment_import_failed",{connectionId:connection.id,name:error instanceof Error?error.name:"unknown"});}
  }
  return true;
}

export async function processGoogleMailSync(db,bucket,env,limit=6){
  const jobs=await db.prepare(`SELECT j.*,c.connection_scope,c.owner_user_id,c.access_token_ciphertext,c.refresh_token_ciphertext,c.access_token_expires_at,c.gmail_history_id,c.status connection_status
    FROM crm_email_sync_jobs j JOIN crm_google_connections c ON c.id=j.connection_id AND c.tenant_id=j.tenant_id AND c.unit_id=j.unit_id
    WHERE j.status IN ('queued','running') AND c.status='active' ORDER BY CASE j.job_kind WHEN 'initial_history' THEN 0 ELSE 1 END,j.created_at LIMIT ?`).bind(limit).all();
  let completed=0,imported=0,failed=0;
  for(const job of jobs.results||[]){
    await db.prepare("UPDATE crm_email_sync_jobs SET status='running',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('queued','running')").bind(job.id).run();
    try{
      const token=await googleAccessToken(db,env,job),cursor=job.cursor?JSON.parse(job.cursor):{};
      if(job.job_kind==="initial_history"){
        const page=new URLSearchParams({maxResults:"25"});if(cursor.pageToken)page.set("pageToken",cursor.pageToken);
        const data=await gmailFetch(token,`messages?${page}`);
        for(const item of data.messages||[])if(await storeMessage(db,bucket,job,token,item))imported++;
        if(data.nextPageToken){await db.prepare("UPDATE crm_email_sync_jobs SET status='queued',cursor=?,imported_count=imported_count+?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify({pageToken:data.nextPageToken}),Number((data.messages||[]).length),job.id).run();continue;}
        const profile=await gmailFetch(token,"profile");
        await db.prepare("UPDATE crm_google_connections SET gmail_history_id=? WHERE id=?").bind(String(profile.historyId||job.gmail_history_id||""),job.connection_id).run();
        await db.prepare("UPDATE crm_email_sync_jobs SET status='complete',cursor=NULL,imported_count=imported_count+?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(Number((data.messages||[]).length),job.id).run();completed++;continue;
      }
      const startId=cursor.startHistoryId||job.gmail_history_id;if(!startId)throw Object.assign(new Error("history_missing"),{status:400,reason:"history_missing"});
      const params=new URLSearchParams({startHistoryId:String(startId),historyTypes:"messageAdded",maxResults:"100"});if(cursor.pageToken)params.set("pageToken",cursor.pageToken);
      let data;
      try{data=await gmailFetch(token,`history?${params}`);}catch(error){if(error.status===404){await db.prepare("UPDATE crm_email_sync_jobs SET job_kind='initial_history',status='queued',cursor=NULL,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(job.id).run();continue;}throw error;}
      const messageIds=new Set();for(const record of data.history||[])for(const item of record.messagesAdded||[])if(item.message?.id)messageIds.add(item.message.id);
      for(const id of messageIds)if(await storeMessage(db,bucket,job,token,{id}))imported++;
      if(data.nextPageToken){await db.prepare("UPDATE crm_email_sync_jobs SET status='queued',cursor=?,imported_count=imported_count+?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify({startHistoryId:String(startId),pageToken:data.nextPageToken}),messageIds.size,job.id).run();continue;}
      await db.prepare("UPDATE crm_google_connections SET gmail_history_id=? WHERE id=?").bind(String(data.historyId||startId),job.connection_id).run();
      await db.prepare("UPDATE crm_email_sync_jobs SET status='complete',cursor=NULL,imported_count=imported_count+?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(messageIds.size,job.id).run();completed++;
    }catch(error){
      const status=Number(error?.status||0),code=String(error?.reason||"sync_failed").replace(/[^a-z0-9_-]/gi,"").slice(0,80)||"sync_failed";
      if(status===401||status===403)await db.prepare("UPDATE crm_google_connections SET status='reauth_required',access_token_ciphertext=NULL,access_token_expires_at=NULL WHERE id=?").bind(job.connection_id).run();
      await failCode(db,job,code);failed++;
      console.error("crm_gmail_sync_job_failed",{connectionId:job.connection_id,jobKind:job.job_kind,status,code});
    }
  }
  const connections=await db.prepare("SELECT id,tenant_id,unit_id FROM crm_google_connections WHERE status='active' AND refresh_token_ciphertext IS NOT NULL LIMIT 200").all();
  for(const connection of connections.results||[])await db.prepare(`INSERT INTO crm_email_sync_jobs(id,tenant_id,unit_id,connection_id,job_kind) VALUES(?,?,?,?,'incremental')
    ON CONFLICT DO NOTHING`).bind(crypto.randomUUID(),connection.tenant_id,connection.unit_id,connection.id).run();
  return {checked:(jobs.results||[]).length,completed,imported,failed};
}
