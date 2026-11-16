import { env } from "cloudflare:workers";
import { assertCrmMutation, getPanigaleCrmUser } from "../../../../lib/server/panigale-auth.mjs";
import { crmContext } from "../../../../lib/server/crm.mjs";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  try {
    const user = await getPanigaleCrmUser(request,env);
    if (!user) return json({ error: "Sign in to continue." },401);
    const tenantId = new URL(request.url).searchParams.get("tenantId") || "";
    const context = await crmContext(env.CRM_DB,user.id,tenantId);
    if (!context.tenant) return json({ error: "CRM workspace is not available." },403);
    const preference = await env.CRM_DB.prepare("SELECT email_reminders_enabled,timezone FROM crm_notification_preferences WHERE tenant_id=? AND user_id=?").bind(context.tenantId,user.id).first();
    return json({ emailRemindersEnabled: Number(preference?.email_reminders_enabled || 0) === 1, timezone: String(preference?.timezone || ""), emailDeliveryReady: env.CRM_EMAIL_SEND_ENABLED === "true" && Boolean(env.CRM_MAILER) });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("crm_reminder_preferences_read_failed", { name: error instanceof Error ? error.name : "unknown" });
    return json({ error: "Unable to load reminder settings." },500);
  }
}

export async function PUT(request: Request) {
  try {
    await assertCrmMutation(request,env);
    const user = await getPanigaleCrmUser(request,env);
    if (!user) return json({ error: "Sign in to continue." },401);
    const input = await request.json() as { tenantId?: unknown; emailRemindersEnabled?: unknown; timezone?: unknown };
    const tenantId = typeof input.tenantId === "string" ? input.tenantId.slice(0,100) : "";
    const context = await crmContext(env.CRM_DB,user.id,tenantId);
    if (!context.tenant) return json({ error: "CRM workspace is not available." },403);
    const enabled = input.emailRemindersEnabled === true ? 1 : input.emailRemindersEnabled === false ? 0 : null;
    if (enabled === null) return json({ error: "Choose whether email reminders are enabled." },400);
    const timezone = typeof input.timezone === "string" ? input.timezone.slice(0,80) : "UTC";
    try { new Intl.DateTimeFormat("en",{timeZone:timezone}); } catch { return json({ error: "Choose a valid time zone." },400); }
    await env.CRM_DB.prepare(`INSERT INTO crm_notification_preferences(tenant_id,user_id,email_reminders_enabled,timezone) VALUES(?,?,?,?)
      ON CONFLICT(tenant_id,user_id) DO UPDATE SET email_reminders_enabled=excluded.email_reminders_enabled,timezone=excluded.timezone,updated_at=CURRENT_TIMESTAMP`).bind(context.tenantId,user.id,enabled,timezone).run();
    return json({ emailRemindersEnabled: enabled === 1, timezone, emailDeliveryReady: env.CRM_EMAIL_SEND_ENABLED === "true" && Boolean(env.CRM_MAILER) });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("crm_reminder_preferences_write_failed", { name: error instanceof Error ? error.name : "unknown" });
    return json({ error: "Unable to save reminder settings." },500);
  }
}
