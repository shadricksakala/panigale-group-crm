"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import { ApiError, getJson, secureJson } from "../../lib/client/api";

type Message = { id?: string; role: "user" | "assistant"; content: string };
type Suggestion = { id: string; kind: "task" | "note"; title: string; details?: string; dueAt?: string | null; linkType?: string | null; linkId?: string | null };

export function CrmAssistant({ tenantId, unitId, unitName }: { tenantId: string; unitId: string; unitName: string }) {
  const [open,setOpen] = useState(false);
  const [messages,setMessages] = useState<Message[]>([]);
  const [suggestions,setSuggestions] = useState<Suggestion[]>([]);
  const [conversationId,setConversationId] = useState("");
  const [draft,setDraft] = useState("");
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const scopeKey = `${tenantId}:${unitId}`;

  useEffect(() => {
    if (!open || !unitId) return;
    let cancelled = false;
    setLoading(true); setError("");
    getJson<{ conversation: { id: string } | null; messages: Message[]; suggestions: Suggestion[] }>(`/api/ai/assistant?tenantId=${encodeURIComponent(tenantId)}&unitId=${encodeURIComponent(unitId)}`)
      .then(result => { if (!cancelled) { setConversationId(result.conversation?.id || ""); setMessages(result.messages || []); setSuggestions(result.suggestions || []); } })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load the assistant."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open,scopeKey,tenantId,unitId]);

  const pendingIds = useMemo(() => new Set(suggestions.map(item => item.id)),[suggestions]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || busy || !unitId) return;
    setBusy(true); setError(""); setMessages(current => [...current,{role:"user",content:message}]); setDraft("");
    try {
      const result = await secureJson<{ conversationId:string; answer:string; suggestions:Suggestion[] }>("/api/ai/assistant","POST",{tenantId,unitId,conversationId,message});
      setConversationId(result.conversationId);
      setMessages(current => [...current,{role:"assistant",content:result.answer}]);
      if(result.suggestions?.length) setSuggestions(current => [...current,...result.suggestions]);
    } catch(reason) {
      setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "The assistant is unavailable.");
      setMessages(current => current.slice(0,-1)); setDraft(message);
    } finally { setBusy(false); }
  }

  async function resolveSuggestion(suggestion: Suggestion, action: "confirm" | "dismiss") {
    setBusy(true); setError("");
    try {
      await secureJson(`/api/ai/suggestions/${encodeURIComponent(suggestion.id)}`,"POST",{tenantId,action});
      setSuggestions(current => current.filter(item => item.id !== suggestion.id));
      if(action === "confirm") setMessages(current => [...current,{role:"assistant",content:`Added “${suggestion.title}” to ${suggestion.kind === "task" ? "tasks" : "activity notes"}.`}]);
    } catch(reason) { setError(reason instanceof Error ? reason.message : "Unable to update this suggestion."); }
    finally { setBusy(false); }
  }

  return <div className="crm-assistant-anchor">
    <button type="button" className="crm-icon-button" title="Open CRM assistant" aria-label="Open CRM assistant" aria-expanded={open} onClick={() => setOpen(value => !value)}><Sparkles size={18}/></button>
    {open && <section className="crm-assistant-panel" role="dialog" aria-modal="false" aria-label="Panigale CRM assistant">
      <header className="crm-assistant-header"><span className="crm-assistant-mark"><Sparkles size={17}/></span><div><strong>CRM assistant</strong><small>{unitName || "Select a business unit"}</small></div><button className="crm-icon-button" type="button" aria-label="Close assistant" onClick={() => setOpen(false)}><X size={17}/></button></header>
      {!unitId ? <div className="crm-assistant-empty">Choose one business unit in the workspace bar to use the assistant. Its context stays within that unit.</div> : <>
        <div className="crm-assistant-messages" aria-live="polite">
          {loading && <p className="crm-assistant-status">Loading your private assistant history…</p>}
          {!loading && !messages.length && <div className="crm-assistant-empty"><strong>Work through relationships faster.</strong><span>Ask for a brief, meeting preparation, or a follow-up idea. CRM changes stay suggestions until you confirm them.</span></div>}
          {messages.map((message,index)=><div className={`crm-assistant-message ${message.role}`} key={message.id || `${index}-${message.role}`}><span>{message.role === "assistant" ? "Pani" : "You"}</span><p>{message.content}</p></div>)}
          {suggestions.length > 0 && <div className="crm-assistant-suggestions"><strong>Suggested CRM updates</strong>{suggestions.map(item=><article key={item.id} className="crm-assistant-suggestion"><div><span>{item.kind === "task" ? "Task" : "Note"}{item.dueAt ? ` · ${item.dueAt.slice(0,10)}` : ""}</span><strong>{item.title}</strong>{item.details && <p>{item.details}</p>}</div><div className="crm-assistant-suggestion-actions"><button type="button" disabled={busy || !pendingIds.has(item.id)} onClick={() => void resolveSuggestion(item,"confirm")}><Check size={14}/>Add</button><button type="button" disabled={busy || !pendingIds.has(item.id)} onClick={() => void resolveSuggestion(item,"dismiss")}>Dismiss</button></div></article>)}</div>}
          {busy && <p className="crm-assistant-status"><LoaderCircle size={14} className="crm-assistant-spin"/>Thinking…</p>}
          {error && <p className="crm-assistant-error" role="alert">{error}</p>}
        </div>
        <form className="crm-assistant-composer" onSubmit={send}><textarea aria-label="Ask the CRM assistant" placeholder="Ask about this business unit…" value={draft} maxLength={6000} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void send();} }}/><button className="crm-primary" type="submit" disabled={busy || !draft.trim()} aria-label="Send message"><Send size={16}/></button></form>
        <p className="crm-assistant-footnote">AI suggestions may be wrong. Review before adding.</p>
      </>}
    </section>}
  </div>;
}

export function ReminderEmailSettings({ tenantId }: { tenantId:string }) {
  const [enabled,setEnabled] = useState(false);
  const [timezone,setTimezone] = useState("UTC");
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    getJson<{emailRemindersEnabled:boolean;timezone:string;emailDeliveryReady:boolean}>(`/api/settings/reminders?tenantId=${encodeURIComponent(tenantId)}`)
      .then(result => { if(!cancelled){setEnabled(result.emailRemindersEnabled);setTimezone(result.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");setReady(result.emailDeliveryReady);} })
      .catch(reason => { if(!cancelled)setError(reason instanceof Error?reason.message:"Unable to load email reminder settings."); });
    return () => { cancelled=true; };
  },[tenantId]);
  async function toggle() {
    setBusy(true);setError("");
    try {
      const result=await secureJson<{emailRemindersEnabled:boolean;timezone:string;emailDeliveryReady:boolean}>("/api/settings/reminders","PUT",{tenantId,emailRemindersEnabled:!enabled,timezone});
      setEnabled(result.emailRemindersEnabled);setTimezone(result.timezone);setReady(result.emailDeliveryReady);
    } catch(reason){setError(reason instanceof Error?reason.message:"Unable to save email reminder settings.");}
    finally{setBusy(false);}
  }
  return <div className="crm-reminder-email-setting"><label><input type="checkbox" checked={enabled} disabled={busy} onChange={() => void toggle()}/><span><strong>Email task reminders</strong><small>24 hours before and on the due date</small></span></label><p>{ready?`Reminders use ${timezone}.`:"Your preference is saved. Email delivery will start when the company mail server is connected."}</p>{error&&<small role="alert">{error}</small>}</div>;
}
