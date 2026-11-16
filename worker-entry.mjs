import application from "./dist/server/index.js";
import { queueCrmReminderEmails } from "./lib/server/crm-reminders.mjs";

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
    ctx.waitUntil(queueCrmReminderEmails(env.CRM_DB, controller.scheduledTime).then(result => {
      console.info("crm_reminder_scan_completed", result);
    }).catch(error => {
      console.error("crm_reminder_scan_failed", { name: error instanceof Error ? error.name : "unknown" });
    }));
  },
};
