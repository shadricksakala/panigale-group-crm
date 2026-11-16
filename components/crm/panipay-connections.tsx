"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { getJson, secureJson } from "../../lib/client/api";

type Unit = { id: string; name: string };
type Connection = { unitId: string; connected: boolean; profileId: string; profileName: string; webhookUrl: string };

export function PaniPayConnections({ tenantId, units }: { tenantId: string; units: Unit[] }) {
  const [items, setItems] = useState<Connection[]>([]);
  const [secrets, setSecrets] = useState<Record<string, { apiKey: string; webhookSecret: string }>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const result = await getJson<{ items: Connection[] }>(`/api/integrations/panipay?tenantId=${encodeURIComponent(tenantId)}`);
    setItems(result.items || []);
  }
  useEffect(() => { void refresh().catch(() => setError("Unable to load PaniPay connections.")); }, [tenantId]);

  async function save(event: FormEvent<HTMLFormElement>, unitId: string) {
    event.preventDefault();
    const values = secrets[unitId];
    if (!values?.apiKey || !values?.webhookSecret) { setError("Enter both PaniPay secrets to connect this unit."); return; }
    setBusy(unitId); setError(""); setNotice("");
    try {
      await secureJson("/api/integrations/panipay", "PUT", { tenantId, unitId, ...values });
      setSecrets(current => ({ ...current, [unitId]: { apiKey: "", webhookSecret: "" } }));
      await refresh(); setNotice("PaniPay merchant connected. Configure its webhook URL in PaniPay Developers.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to connect this PaniPay merchant."); }
    finally { setBusy(""); }
  }

  return <details className="crm-card crm-card-pad" style={{ marginBottom: 14 }}>
    <summary style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", listStyle: "none", fontSize: 13, fontWeight: 700 }}><ShieldCheck size={17} color="#0876f9"/>PaniPay invoice connections</summary>
    <p style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>Each business unit connects to its own merchant. Keys are encrypted and never shown again. Create a PaniPay API key with invoices:read, invoices:write, and payments:read scopes. Add the webhook endpoint below in PaniPay → Developers → Webhook endpoints, select payment.succeeded, then paste its signing secret here. Invoices without a due date are sent with a due date 30 days after issue.</p>
    {items.map(item => {
      const value = secrets[item.unitId] || { apiKey: "", webhookSecret: "" };
      return <form key={item.unitId} onSubmit={event => void save(event, item.unitId)} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12, display: "grid", gap: 9 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><strong style={{ fontSize: 12 }}>{units.find(unit => unit.id === item.unitId)?.name || "Business unit"}</strong><span className={`crm-pill ${item.connected ? "green" : "gold"}`}>{item.connected ? "Connected" : "Not connected"}</span></div>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 11 }}>Mapped PaniPay profile: <strong>{item.profileName || "Not assigned"}</strong>{!item.profileId && " · Invoice connection is disabled until a profile is mapped."}</p>
        <label className="crm-field">PaniPay API key<input disabled={!item.profileId} type="password" autoComplete="new-password" value={value.apiKey} onChange={event => setSecrets(current => ({ ...current, [item.unitId]: { ...value, apiKey: event.target.value } }))} placeholder={item.connected ? "Enter a replacement key to rotate" : "pp_live_…"}/></label>
        <label className="crm-field">Webhook signing secret<input disabled={!item.profileId} type="password" autoComplete="new-password" value={value.webhookSecret} onChange={event => setSecrets(current => ({ ...current, [item.unitId]: { ...value, webhookSecret: event.target.value } }))} placeholder={item.connected ? "Enter to replace the current secret" : "whsec_…"}/></label>
        <label className="crm-field">Webhook URL<input readOnly value={item.webhookUrl}/></label>
        <button className="crm-secondary crm-button-small" disabled={busy === item.unitId || !item.profileId}>{busy === item.unitId ? <LoaderCircle size={14} className="animate-spin"/> : <Check size={14}/>}Connect {item.connected ? "or rotate" : "merchant"}</button>
      </form>;
    })}
    {error && <p className="crm-alert" role="alert">{error}</p>}{notice && <p className="crm-notice" role="status">{notice}</p>}
  </details>;
}

type Invoice = { id: string; unit_id?: string | number | null; title?: string | number | null; status?: string | number | null; panipay_invoice_id?: string | number | null; panipay_payment_url?: string | number | null; panipay_send_status?: string | number | null; amount_minor?: string | number | null; };
export function PaniPayInvoiceActions({ invoices, financialUnitIds, onAction }: { invoices: Invoice[]; financialUnitIds: string[]; onAction: (invoice: Invoice, action: "send" | "refresh") => Promise<void> }) {
  const [busy, setBusy] = useState("");
  const eligible = invoices.filter(invoice => financialUnitIds.includes(String(invoice.unit_id)) && ["draft", "sent", "overdue"].includes(String(invoice.status)));
  if (!eligible.length) return null;
  return <article className="crm-card crm-card-pad" style={{ marginBottom: 14 }}><div className="crm-card-head"><div><h2>Send and collect with PaniPay</h2><p>Send existing CRM invoices by email with hosted checkout, then refresh confirmed payments.</p></div></div>
    {eligible.map(invoice => <div className="crm-list-row" key={invoice.id}><span className="crm-metric-icon tone-blue"><ShieldCheck size={16}/></span><span className="crm-list-content"><strong>{String(invoice.title || "Invoice")}</strong><span>{Number(invoice.amount_minor || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} ZMW · {String(invoice.panipay_send_status || "not_sent") === "sent" ? "Sent through PaniPay" : "Not sent through PaniPay"}</span></span>
      {!!invoice.panipay_payment_url && <a className="crm-secondary crm-button-small" href={String(invoice.panipay_payment_url)} target="_blank" rel="noopener noreferrer">Open checkout</a>}
      {String(invoice.panipay_send_status || "not_sent") !== "sent" && <button className="crm-primary crm-button-small" disabled={Boolean(busy)} onClick={async () => { setBusy(invoice.id); try { await onAction(invoice, "send"); } finally { setBusy(""); } }}>{busy === invoice.id ? <LoaderCircle size={14} className="animate-spin"/> : <Check size={14}/>}Send with PaniPay</button>}
      {!!invoice.panipay_invoice_id && <button className="crm-secondary crm-button-small" disabled={Boolean(busy)} onClick={async () => { setBusy(invoice.id); try { await onAction(invoice, "refresh"); } finally { setBusy(""); } }}>{busy === invoice.id ? <LoaderCircle size={14} className="animate-spin"/> : <Check size={14}/>}Refresh payment</button>}
    </div>)}
  </article>;
}
