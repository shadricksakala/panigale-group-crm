import application from "./dist/server/index.js";
import { purgeDisconnectedGoogleMail, queueCrmReminderEmails } from "./lib/server/crm-reminders.mjs";
import { processGoogleMailSync } from "./lib/server/gmail-sync.mjs";
import { deliverCrmEmailOutbox, deliverCrmSupportOutbox } from "./lib/server/mail-delivery.mjs";

export default {
  async fetch(request, env, ctx) {
    const response = await application.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-frame-options", "DENY");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
    if (new URL(request.url).protocol === "https:") {
      headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
  async scheduled(controller, env, ctx) {
    if (env.CRM_SCHEDULED_JOBS_ENABLED !== "true") return;
    ctx.waitUntil(queueCrmReminderEmails(env.CRM_DB, controller.scheduledTime, env.CRM_EMAIL_SEND_ENABLED === "true" && Boolean(env.CRM_MAILER)).then(result => {
      console.info("crm_reminder_scan_completed", result);
    }).catch(error => {
      console.error("crm_reminder_scan_failed", { name: error instanceof Error ? error.name : "unknown" });
    }));
    ctx.waitUntil(purgeDisconnectedGoogleMail(env.CRM_DB,env.CRM_DOCUMENTS,controller.scheduledTime).then(result=>{
      if(result.expiredConnections)console.info("crm_mail_retention_purge_completed",result);
    }).catch(error=>console.error("crm_mail_retention_purge_failed",{name:error instanceof Error?error.name:"unknown"})));
    ctx.waitUntil(processGoogleMailSync(env.CRM_DB,env.CRM_DOCUMENTS,env,6).then(result=>{
      if(result.checked||result.imported)console.info("crm_gmail_sync_scan_completed",result);
    }).catch(error=>console.error("crm_gmail_sync_scan_failed",{name:error instanceof Error?error.name:"unknown"})));
    ctx.waitUntil(deliverCrmEmailOutbox(env.CRM_DB,env.CRM_MAILER,env.CRM_EMAIL_SEND_ENABLED,controller.scheduledTime).then(result=>{
      if(result.attempted)console.info("crm_mail_delivery_scan_completed",result);
    }).catch(error=>console.error("crm_mail_delivery_scan_failed",{name:error instanceof Error?error.name:"unknown"})));
    ctx.waitUntil(deliverCrmSupportOutbox(env.CRM_DB,env.CRM_MAILER,env.CRM_EMAIL,env.CRM_EMAIL_SEND_ENABLED,controller.scheduledTime).then(result=>{
      if(result.attempted)console.info("crm_support_mail_delivery_scan_completed",result);
    }).catch(error=>console.error("crm_support_mail_delivery_scan_failed",{name:error instanceof Error?error.name:"unknown"})));
  },
};
