const API = "https://panipay.panigale.tech/api/v1";
const fail = (message, status = 400) => new Response(message, { status });
const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const encoder = new TextEncoder();
const b64 = bytes => { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); };
const unb64 = value => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0));

async function encryptionKey(env) {
  const hex = String(env.CRM_INTEGRATION_ENCRYPTION_KEY || "");
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw fail("CRM integration encryption is not configured.", 503);
  const raw = Uint8Array.from(hex.match(/.{2}/g), pair => parseInt(pair, 16));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encryptSecret(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), encoder.encode(value));
  return `${b64(iv)}.${b64(new Uint8Array(data))}`;
}
async function decryptSecret(env, value) {
  const [encodedIv, encodedData] = String(value || "").split(".");
  if (!encodedIv || !encodedData) throw fail("Stored PaniPay credentials are invalid.", 503);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(encodedIv) }, await encryptionKey(env), unb64(encodedData));
  return new TextDecoder().decode(plain);
}

async function request(apiKey, path, { method = "GET", body, idempotencyKey } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    redirect: "manual",
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status >= 300 && response.status < 400) throw fail("PaniPay returned an unexpected redirect.", 502);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? "PaniPay rejected the API key or required scopes. Check invoices:read, invoices:write, and payments:read."
      : clean(result.error, 240) || "PaniPay could not complete the request.";
    throw fail(message, response.status === 429 ? 429 : response.status >= 500 ? 502 : response.status);
  }
  return result;
}

async function getConnection(db, env, tenantId, unitId) {
  const row = await db.prepare("SELECT * FROM crm_panipay_connections WHERE tenant_id=? AND unit_id=?").bind(tenantId, unitId).first();
  if (!row) throw fail("Connect this business unit to PaniPay before sending or refreshing invoices.", 409);
  return {
    row,
    apiKey: await decryptSecret(env, row.api_key_ciphertext),
    webhookSecret: await decryptSecret(env, row.webhook_secret_ciphertext),
  };
}

export async function getPaniPayConnections(db, context, env) {
  const { results = [] } = await db.prepare("SELECT unit_id,updated_at FROM crm_panipay_connections WHERE tenant_id=? AND unit_id IN (SELECT id FROM crm_units WHERE tenant_id=? AND active=1)").bind(context.tenantId, context.tenantId).all();
  const base = String(env.CRM_PUBLIC_URL || "https://crm.panigale.tech").replace(/\/$/, "");
  return context.units.map(unit => ({ unitId: unit.id, connected: results.some(row => row.unit_id === unit.id), webhookUrl: `${base}/api/webhooks/panipay` }));
}

export async function savePaniPayConnection(db, env, context, user, unitId, apiKey, webhookSecret) {
  if (!context.superadmin) throw fail("CRM superadmin access is required to connect a PaniPay merchant.", 403);
  if (!context.unitIds.includes(unitId)) throw fail("You do not have access to this business unit.", 403);
  const key = clean(apiKey, 300), secret = clean(webhookSecret, 500);
  if (key && !/^pp_(?:live|test)_/.test(key)) throw fail("Enter a PaniPay API key.");
  if (secret && !secret.startsWith("whsec_")) throw fail("Enter the complete PaniPay webhook signing secret (starts with whsec_)." );
  if (!key || !secret) throw fail("Both the API key and webhook signing secret are required.");
  // Validate the key and its exact required scopes before replacing a working connection.
  await request(key, "/invoices?status=draft&limit=1");
  await request(key, "/payments?limit=1");
  const encryptedKey = await encryptSecret(env, key), encryptedSecret = await encryptSecret(env, secret);
  await db.prepare(`INSERT INTO crm_panipay_connections(tenant_id,unit_id,api_key_ciphertext,webhook_secret_ciphertext,connected_by_user_id)
    VALUES(?,?,?,?,?) ON CONFLICT(tenant_id,unit_id) DO UPDATE SET api_key_ciphertext=excluded.api_key_ciphertext,webhook_secret_ciphertext=excluded.webhook_secret_ciphertext,connected_by_user_id=excluded.connected_by_user_id,updated_at=CURRENT_TIMESTAMP`)
    .bind(context.tenantId, unitId, encryptedKey, encryptedSecret, user.id).run();
  await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.panipay.connected','panipay_connection',?,?)")
    .bind(crypto.randomUUID(), context.tenantId, unitId, user.id, unitId, JSON.stringify({ updated: true })).run();
  return { unitId, connected: true };
}

async function invoiceForPaniPay(db, context, id) {
  const row = await db.prepare(`SELECT i.*,c.name AS contact_name,c.email AS contact_email,c.phone AS contact_phone,c.address AS contact_address,
      co.name AS company_name,co.email AS company_email,co.phone AS company_phone,co.address AS company_address
    FROM crm_invoices i
    LEFT JOIN crm_contacts c ON c.id=i.contact_id AND c.tenant_id=i.tenant_id AND c.unit_id=i.unit_id
    LEFT JOIN crm_companies co ON co.id=i.company_id AND co.tenant_id=i.tenant_id AND co.unit_id=i.unit_id
    WHERE i.id=? AND i.tenant_id=? AND i.unit_id IN (${context.unitIds.map(() => "?").join(",") || "NULL"})`).bind(id, context.tenantId, ...context.unitIds).first();
  if (!row) throw fail("Invoice not found.", 404);
  const unit = context.units.find(item => item.id === row.unit_id);
  if (!context.superadmin && Number(unit?.can_view_financials) !== 1) throw fail("Financial access is required for this invoice.", 403);
  return row;
}

const money = minor => (Number(minor) / 100).toFixed(2);
const dateToday = () => new Date().toISOString().slice(0, 10);
function defaultDueDate() { const due = new Date(); due.setUTCDate(due.getUTCDate() + 30); return due.toISOString().slice(0, 10); }

async function createOrSendInvoice(db, env, user, context, invoice) {
  if (String(invoice.currency) !== "ZMW") throw fail("PaniPay collection can currently be reconciled to CRM invoices in ZMW only.");
  if (!Number(invoice.amount_minor)) throw fail("A positive invoice amount is required before sending.");
  const email = clean(invoice.contact_email || invoice.company_email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("Add a valid email to the linked contact or organization before sending this invoice.");
  const connection = await getConnection(db, env, context.tenantId, invoice.unit_id);
  let externalId = clean(invoice.panipay_invoice_id, 100);
  if (!externalId) {
    const customerName = clean(invoice.contact_name || invoice.company_name, 160);
    if (!customerName) throw fail("Link this invoice to a contact or organization before sending.");
    const issueDate = dateToday();
    const dueDate = clean(invoice.due_date, 10) || defaultDueDate();
    const created = await request(connection.apiKey, "/invoices", {
      method: "POST",
      idempotencyKey: `crm-invoice-${invoice.id}`,
      body: {
        customer: { name: customerName, email, phone: invoice.contact_phone || invoice.company_phone || undefined, address: invoice.contact_address || invoice.company_address || undefined },
        invoiceNumber: clean(invoice.external_reference, 40) || `CRM-${invoice.id.slice(0, 12)}`,
        issueDate,
        dueDate,
        items: [{ description: clean(invoice.title, 240), quantity: 1, unitPrice: money(invoice.amount_minor) }],
        amountCurrency: String(invoice.currency),
      },
    });
    externalId = clean(created.id, 100);
    if (!externalId) throw fail("PaniPay created no invoice ID.", 502);
    await db.prepare("UPDATE crm_invoices SET panipay_invoice_id=?,panipay_send_status='created',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=?")
      .bind(externalId, user.id, invoice.id, context.tenantId, invoice.unit_id).run();
    invoice.panipay_invoice_id = externalId;
    // Persist the provider's private checkout token URL when available so retries remain safe.
    if (created.public_token) {
      const checkoutUrl = `https://panipay.panigale.tech/invoice/${encodeURIComponent(String(created.public_token))}`;
      await db.prepare("UPDATE crm_invoices SET panipay_payment_url=? WHERE id=? AND tenant_id=? AND unit_id=?").bind(checkoutUrl, invoice.id, context.tenantId, invoice.unit_id).run();
    }
  }
  if (String(invoice.panipay_send_status) === "sent") return { invoiceId: externalId, paymentUrl: invoice.panipay_payment_url, status: "sent", alreadySent: true };
  let sent;
  try {
    sent = await request(connection.apiKey, `/invoices/${encodeURIComponent(externalId)}/send`, { method: "POST", body: {} });
  } catch (error) {
    // A timeout can occur after PaniPay accepted the email. Read the invoice before retrying delivery.
    const current = await request(connection.apiKey, `/invoices/${encodeURIComponent(externalId)}`).catch(() => null);
    if (!current?.sent_at && !["sent", "partially_paid", "paid", "overdue"].includes(String(current?.status))) {
      await db.prepare("UPDATE crm_invoices SET panipay_send_status='error',updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=?").bind(invoice.id, context.tenantId, invoice.unit_id).run();
      throw error;
    }
    sent = { invoice: current, publicUrl: current.publicUrl || current.public_url || invoice.panipay_payment_url };
  }
  const paymentUrl = clean(sent.publicUrl || sent.public_url || invoice.panipay_payment_url, 1000);
  await db.prepare("UPDATE crm_invoices SET panipay_payment_url=COALESCE(NULLIF(?,''),panipay_payment_url),panipay_send_status='sent',status=CASE WHEN status='draft' THEN 'sent' ELSE status END,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=?")
    .bind(paymentUrl, user.id, invoice.id, context.tenantId, invoice.unit_id).run();
  await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.invoice.sent_via_panipay','invoice',?,?)")
    .bind(crypto.randomUUID(), context.tenantId, invoice.unit_id, user.id, invoice.id, JSON.stringify({ panipayInvoiceId: externalId })).run();
  return { invoiceId: externalId, paymentUrl, status: "sent" };
}

async function loadVerifiedPayment(apiKey, id) {
  const result = await request(apiKey, `/payments?id=${encodeURIComponent(id)}`);
  const payment = result.data;
  if (!payment || payment.status !== "succeeded" || payment.currency !== "ZMW" || !Number.isSafeInteger(Number(payment.amount_minor)) || Number(payment.amount_minor) <= 0) {
    throw fail("PaniPay has not confirmed this payment as successful ZMW collection.", 409);
  }
  return payment;
}

async function attachPayment(db, invoice, payment, actorId, eventId = null) {
  const externalId = clean(payment.id, 120);
  const existing = await db.prepare("SELECT id FROM crm_payments WHERE tenant_id=? AND unit_id=? AND panipay_payment_id=?").bind(invoice.tenant_id, invoice.unit_id, externalId).first();
  if (existing) {
    if (eventId) await db.prepare("UPDATE crm_panipay_webhook_events SET status='processed',processed_at=CURRENT_TIMESTAMP WHERE event_id=?").bind(eventId).run();
    return { imported: false, duplicate: true };
  }
  const amount = Number(payment.amount_minor), remaining = Number(invoice.amount_minor) - Number(invoice.paid_minor || 0);
  if (amount > remaining) throw fail("Confirmed PaniPay payment is greater than the remaining CRM invoice balance; manual review is required.", 409);
  const paidAt = String(payment.succeeded_at || payment.created_at || new Date().toISOString()).slice(0, 10);
  const paymentRef = clean(payment.provider_reference || externalId, 200);
  const statements = [
    db.prepare(`UPDATE crm_invoices SET status=CASE WHEN COALESCE((SELECT SUM(amount_minor) FROM crm_payments WHERE tenant_id=? AND unit_id=? AND invoice_id=?),0)+? >= amount_minor THEN 'paid' WHEN due_date IS NOT NULL AND due_date < date('now') THEN 'overdue' ELSE 'sent' END,
      paid_at=CASE WHEN COALESCE((SELECT SUM(amount_minor) FROM crm_payments WHERE tenant_id=? AND unit_id=? AND invoice_id=?),0)+? >= amount_minor THEN ? ELSE paid_at END,
      updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=? AND status IN ('sent','overdue') AND COALESCE((SELECT SUM(amount_minor) FROM crm_payments WHERE tenant_id=? AND unit_id=? AND invoice_id=?),0)+? <= amount_minor`)
      .bind(invoice.tenant_id, invoice.unit_id, invoice.id, amount, invoice.tenant_id, invoice.unit_id, invoice.id, amount, paidAt, actorId, invoice.id, invoice.tenant_id, invoice.unit_id, invoice.tenant_id, invoice.unit_id, invoice.id, amount),
    db.prepare(`INSERT INTO crm_payments(id,tenant_id,unit_id,invoice_id,amount_minor,paid_at,method,reference,notes,recorded_by,panipay_payment_id)
      SELECT ?,?,?,?,?,?,'panipay',?,?,?,? WHERE changes() > 0`)
      .bind(crypto.randomUUID(), invoice.tenant_id, invoice.unit_id, invoice.id, amount, paidAt, paymentRef, "Confirmed by PaniPay API", actorId, externalId),
  ];
  if (eventId) statements.push(db.prepare("UPDATE crm_panipay_webhook_events SET status='processed',processed_at=CURRENT_TIMESTAMP WHERE event_id=?").bind(eventId));
  await db.batch(statements);
  const inserted = await db.prepare("SELECT id FROM crm_payments WHERE tenant_id=? AND unit_id=? AND panipay_payment_id=?").bind(invoice.tenant_id, invoice.unit_id, externalId).first();
  if (!inserted) throw fail("Payment could not be reconciled against the CRM invoice.", 409);
  await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.invoice.panipay_payment_recorded','invoice',?,?)")
    .bind(crypto.randomUUID(), invoice.tenant_id, invoice.unit_id, actorId, invoice.id, JSON.stringify({ panipayPaymentId: externalId, amountMinor: amount })).run();
  return { imported: true, amountMinor: amount };
}

async function reconcileInvoice(db, env, user, context, invoice) {
  if (!invoice.panipay_invoice_id) throw fail("Send this invoice with PaniPay before refreshing payment status.", 409);
  const { apiKey } = await getConnection(db, env, context.tenantId, invoice.unit_id);
  const external = await request(apiKey, `/invoices/${encodeURIComponent(invoice.panipay_invoice_id)}`);
  const payments = Array.isArray(external.payments) ? external.payments : [];
  let imported = 0, importedMinor = 0;
  for (const entry of payments) {
    const id = clean(entry.payment_id || entry.paymentId || "", 120);
    if (!id) continue;
    const verified = await loadVerifiedPayment(apiKey, id);
    if (String(verified.invoice_id) !== String(invoice.panipay_invoice_id)) continue;
    const result = await attachPayment(db, { ...invoice, paid_minor: Number(invoice.paid_minor || 0) + importedMinor }, verified, user.id);
    if (result.imported) { imported++; importedMinor += result.amountMinor; }
  }
  return { imported, importedMinor, status: String(external.status || invoice.status), paymentUrl: invoice.panipay_payment_url };
}

export async function handlePaniPayInvoiceAction(db, env, user, context, invoiceId, action, confirmed=false) {
  const invoice = await invoiceForPaniPay(db, context, invoiceId);
  if (action === "send") {
    if(!confirmed)throw fail("Review and confirm the client invoice email before sending it.",400);
    await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.email.approved','panipay_invoice',?,?)")
      .bind(crypto.randomUUID(),context.tenantId,invoice.unit_id,user.id,invoice.id,JSON.stringify({channel:"panipay",selfApproved:true})).run();
    return createOrSendInvoice(db, env, user, context, invoice);
  }
  if (action === "refresh") return reconcileInvoice(db, env, user, context, invoice);
  throw fail("Choose send or refresh.");
}

function signatureMatches(secret, timestamp, rawBody, suppliedHex) {
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/.test(suppliedHex)) return false;
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then(async key => {
      const data = new TextEncoder().encode(`${timestamp}.${rawBody}`), digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
      const supplied = Uint8Array.from(suppliedHex.match(/.{2}/g) || [], byte => parseInt(byte, 16));
      if (digest.length !== supplied.length) return false;
      let diff = 0; for (let i = 0; i < digest.length; i++) diff |= digest[i] ^ supplied[i];
      return diff === 0;
    });
}

export async function receivePaniPayWebhook(db, env, request) {
  const timestamp = request.headers.get("x-panipay-timestamp") || "", signature = request.headers.get("x-panipay-signature") || "";
  const raw = await request.text();
  if (raw.length > 64_000) throw fail("Webhook payload is too large.", 413);
  const { results = [] } = await db.prepare("SELECT * FROM crm_panipay_connections").all();
  let connection = null;
  for (const row of results) {
    const secret = await decryptSecret(env, row.webhook_secret_ciphertext);
    if (await signatureMatches(secret, timestamp, raw, signature)) { connection = { row, apiKey: await decryptSecret(env, row.api_key_ciphertext) }; break; }
  }
  if (!connection) throw fail("Invalid PaniPay webhook signature.", 401);
  let event;
  try { event = JSON.parse(raw); } catch { throw fail("Invalid webhook JSON.", 400); }
  const eventId = clean(event.id, 160), eventType = clean(event.type, 80), paymentId = clean(event.data?.paymentId || "", 120);
  if (!eventId) throw fail("Webhook event ID is required.", 400);
  const { tenant_id: tenantId, unit_id: unitId, connected_by_user_id: actorId } = connection.row;
  const inserted = await db.prepare("INSERT OR IGNORE INTO crm_panipay_webhook_events(event_id,tenant_id,unit_id,event_type,payment_id,status) VALUES(?,?,?,?,?,'processing')")
    .bind(eventId, tenantId, unitId, eventType, paymentId || null).run();
  if (!Number(inserted.meta?.changes || 0)) {
    const prior = await db.prepare("SELECT status FROM crm_panipay_webhook_events WHERE event_id=?").bind(eventId).first();
    if (prior?.status === "processed" || prior?.status === "ignored") return { duplicate: true };
    await db.prepare("DELETE FROM crm_panipay_webhook_events WHERE event_id=? AND status='error'").bind(eventId).run();
  }
  try {
    if (eventType !== "payment.succeeded" || !paymentId) {
      await db.prepare("UPDATE crm_panipay_webhook_events SET status='ignored',processed_at=CURRENT_TIMESTAMP WHERE event_id=?").bind(eventId).run();
      return { ignored: true };
    }
    const payment = await loadVerifiedPayment(connection.apiKey, paymentId);
    const invoice = await db.prepare("SELECT i.*,COALESCE((SELECT SUM(amount_minor) FROM crm_payments p WHERE p.tenant_id=i.tenant_id AND p.unit_id=i.unit_id AND p.invoice_id=i.id),0) AS paid_minor FROM crm_invoices i WHERE i.tenant_id=? AND i.unit_id=? AND i.panipay_invoice_id=?")
      .bind(tenantId, unitId, payment.invoice_id).first();
    if (!invoice || String(payment.invoice_id) !== String(invoice.panipay_invoice_id)) {
      await db.prepare("UPDATE crm_panipay_webhook_events SET status='ignored',processed_at=CURRENT_TIMESTAMP WHERE event_id=?").bind(eventId).run();
      return { ignored: true };
    }
    await attachPayment(db, invoice, payment, actorId, eventId);
    return { processed: true };
  } catch (error) {
    await db.prepare("UPDATE crm_panipay_webhook_events SET status='error' WHERE event_id=? AND status='processing'").bind(eventId).run();
    throw error;
  }
}
