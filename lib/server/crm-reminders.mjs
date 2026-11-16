function localDateParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type,part.value]));
}

function nextDate(dateText) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0,10);
}

function dueDateForTimezone(value,timezone) {
  const text=String(value||"");
  if(!/^\d{4}-\d{2}-\d{2}/.test(text))return "";
  if(text.length<=10)return text.slice(0,10);
  const date=new Date(text);
  if(!Number.isFinite(date.getTime()))return "";
  const local=localDateParts(date,timezone);
  return `${local.year}-${local.month}-${local.day}`;
}

function reminderTypeFor(dueDate,now,timezone) {
  const local=localDateParts(now,timezone),today=`${local.year}-${local.month}-${local.day}`;
  if(Number(local.hour)<9)return "";
  if(dueDate===today)return "due_date";
  if(nextDate(today)===dueDate)return "day_before";
  return "";
}

export async function getCurrentCrmReminder(db,message,nowValue=Date.now()) {
  const parts=String(message.idempotency_key||"").split(":");
  if(parts.length!==5||parts[0]!=="crm-reminder")return null;
  const [,activityId,ownerId,reminderType,dueDate]=parts;
  if(ownerId!==String(message.recipient_user_id))return null;
  const activity=await db.prepare(`SELECT a.status,a.owner_user_id,a.title,a.due_at,p.email_reminders_enabled,p.timezone,u.email
    FROM crm_activities a
    JOIN crm_users u ON u.id=a.owner_user_id AND u.status='active'
    JOIN crm_notification_preferences p ON p.tenant_id=a.tenant_id AND p.user_id=a.owner_user_id AND p.email_reminders_enabled=1
    JOIN crm_unit_access ua ON ua.tenant_id=a.tenant_id AND ua.unit_id=a.unit_id AND ua.user_id=a.owner_user_id
    JOIN crm_units unit ON unit.tenant_id=a.tenant_id AND unit.id=a.unit_id AND unit.active=1
    WHERE a.id=? AND a.tenant_id=? AND a.unit_id=? AND a.owner_user_id=? AND a.status='open' AND a.kind IN ('task','follow_up')`).bind(activityId,message.tenant_id,message.unit_id,ownerId).first();
  if(!activity)return null;
  const timezone=String(activity.timezone||"UTC"),actualDueDate=dueDateForTimezone(activity.due_at,timezone);
  if(actualDueDate!==dueDate||reminderTypeFor(actualDueDate,new Date(nowValue),timezone)!==reminderType)return null;
  const title=String(activity.title||"").slice(0,200),shortTitle=title.slice(0,140);
  return {
    recipient_email:String(activity.email||""),
    subject:reminderType==="day_before"?`Task due tomorrow: ${shortTitle}`:`Task due today: ${shortTitle}`,
    body_text:`${title}\n\nDue ${dueDate}. Open Panigale Group CRM to review or update this task.`,
  };
}

export async function queueCrmReminderEmails(db, nowValue = Date.now(), deliveryReady = false) {
  if(!deliveryReady)return { queued:0, examined:0, deliveryReady:false };
  const now = new Date(nowValue);
  const { results = [] } = await db.prepare(`SELECT a.id,a.tenant_id,a.unit_id,a.title,a.due_at,a.owner_user_id,u.email,p.timezone
    FROM crm_activities a
    JOIN crm_users u ON u.id=a.owner_user_id AND u.status='active'
    JOIN crm_notification_preferences p ON p.tenant_id=a.tenant_id AND p.user_id=a.owner_user_id AND p.email_reminders_enabled=1
    JOIN crm_unit_access ua ON ua.tenant_id=a.tenant_id AND ua.unit_id=a.unit_id AND ua.user_id=a.owner_user_id
    JOIN crm_units unit ON unit.tenant_id=a.tenant_id AND unit.id=a.unit_id AND unit.active=1
    WHERE a.status='open' AND a.kind IN ('task','follow_up') AND a.due_at IS NOT NULL
    ORDER BY a.due_at LIMIT 5000`).all();
  let queued = 0;
  for (const task of results) {
    const timezone = String(task.timezone || "UTC");
    let local;
    try { local = localDateParts(now,timezone); } catch { local = localDateParts(now,"UTC"); }
    if (Number(local.hour) < 9) continue;
    let dueDate="";
    try{dueDate=dueDateForTimezone(task.due_at,timezone);}catch{}
    if (!dueDate) continue;
    let reminderType = "";
    try{reminderType=reminderTypeFor(dueDate,now,timezone);}catch{}
    if (!reminderType) continue;
    const idempotencyKey = `crm-reminder:${task.id}:${task.owner_user_id}:${reminderType}:${dueDate}`;
    const subject = reminderType === "day_before" ? `Task due tomorrow: ${String(task.title).slice(0,140)}` : `Task due today: ${String(task.title).slice(0,140)}`;
    const body = `${String(task.title).slice(0,200)}\n\nDue ${dueDate}. Open Panigale Group CRM to review or update this task.`;
    const result = await db.prepare(`INSERT OR IGNORE INTO crm_email_outbox(id,tenant_id,unit_id,recipient_user_id,recipient_email,message_type,subject,body_text,idempotency_key,status)
      VALUES(?,?,?,?,?, ?,?,?,?,'queued')`).bind(crypto.randomUUID(),task.tenant_id,task.unit_id,task.owner_user_id,task.email,"task_reminder",subject,body,idempotencyKey).run();
    queued += Number(result.meta?.changes || 0);
  }
  return { queued, examined: results.length, deliveryReady:true };
}

export async function purgeDisconnectedGoogleMail(db,bucket,scheduledAt=Date.now()) {
  const due=await db.prepare(`SELECT id,tenant_id,unit_id FROM crm_google_connections WHERE status='disconnected' AND disconnected_at IS NOT NULL AND datetime(disconnected_at,'+'||retention_days||' days')<=datetime(?) ORDER BY disconnected_at LIMIT 20`).bind(new Date(scheduledAt).toISOString()).all();
  const results=due.results||[];let purged=0;
  for(const connection of results){
    let failed=false;
    while(true){
      const attachments=await db.prepare(`SELECT a.id,a.storage_key FROM crm_email_attachments a JOIN crm_email_messages m ON m.id=a.message_id WHERE m.tenant_id=? AND m.unit_id=? AND m.connection_id=? LIMIT 500`).bind(connection.tenant_id,connection.unit_id,connection.id).all();
      const items=attachments.results||[];if(!items.length)break;
      for(const item of items){
        try{await bucket.delete(item.storage_key);await db.prepare("DELETE FROM crm_email_attachments WHERE id=?").bind(item.id).run();}
        catch(error){failed=true;console.error("crm_mail_attachment_purge_failed",{attachmentId:item.id,name:error instanceof Error?error.name:"unknown"});}
      }
      if(failed)break;
    }
    if(failed)continue;
    await db.prepare("DELETE FROM crm_email_drafts WHERE tenant_id=? AND unit_id=? AND connection_id=?").bind(connection.tenant_id,connection.unit_id,connection.id).run();
    await db.prepare("DELETE FROM crm_email_messages WHERE tenant_id=? AND unit_id=? AND connection_id=?").bind(connection.tenant_id,connection.unit_id,connection.id).run();
    await db.prepare("UPDATE crm_email_sync_jobs SET cursor=NULL,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND unit_id=? AND connection_id=?").bind(connection.tenant_id,connection.unit_id,connection.id).run();
    purged++;
  }
  return {expiredConnections:purged,checked:results.length};
}
