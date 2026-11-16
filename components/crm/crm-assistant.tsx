"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, LoaderCircle, Mail, Send, Sparkles, X } from "lucide-react";
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

type GoogleConnection = {id:string;unit_id:string;connection_scope:"personal"|"shared";owner_user_id:string|null;email:string;granted_scopes:string;status:string;retention_days:number;connected_at:string;scanned_count:number;last_sync_status:string|null;last_sync_error:string|null;canManageRetention:boolean;canDisconnect:boolean};
export function GoogleConnections({tenantId,unitId,units}:{tenantId:string;unitId:string;units:{id:string;name:string}[]}) {
  const [open,setOpen]=useState(false),[scope,setScope]=useState<"personal"|"shared">("personal"),[selectedUnit,setSelectedUnit]=useState(unitId),[items,setItems]=useState<GoogleConnection[]>([]),[configured,setConfigured]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[receiptEnabled,setReceiptEnabled]=useState(false),[receiptSubject,setReceiptSubject]=useState("We received your message"),[receiptBody,setReceiptBody]=useState("Thank you for contacting us. We have received your message and will direct it to the right person."),[canManageEmail,setCanManageEmail]=useState(false),[calendars,setCalendars]=useState<{connectionId:string;email:string;scope:string;error?:string;events:{id:string;summary:string;start:string;end:string;htmlLink:string}[]}[]>([]),[eventConnection,setEventConnection]=useState(""),[eventTitle,setEventTitle]=useState(""),[eventStart,setEventStart]=useState(""),[eventEnd,setEventEnd]=useState(""),[editingEvent,setEditingEvent]=useState("");
  useEffect(()=>{if(unitId)setSelectedUnit(unitId);},[unitId]);
  const refresh=async()=>{if(!open)return;setBusy(true);try{const query=`tenantId=${encodeURIComponent(tenantId)}&unitId=${encodeURIComponent(selectedUnit)}`,data=await getJson<{items:GoogleConnection[];googleConfigured:boolean}>(`/api/integrations/google?${query}`);setItems(data.items||[]);setConfigured(data.googleConfigured);const [emailSettings,calendarData]=await Promise.all([getJson<{receiptAutoEnabled:boolean;receiptSubject:string;receiptBody:string;canManage:boolean}>(`/api/settings/email?${query}`).catch(()=>null),getJson<{calendars:typeof calendars}>(`/api/integrations/calendar?${query}`).catch(()=>({calendars:[]}))]);if(emailSettings){setReceiptEnabled(emailSettings.receiptAutoEnabled);setReceiptSubject(emailSettings.receiptSubject);setReceiptBody(emailSettings.receiptBody);setCanManageEmail(emailSettings.canManage);}setCalendars(calendarData.calendars||[]);if(!eventConnection&&(data.items||[]).length)setEventConnection((data.items||[]).find(item=>item.status==="active")?.id||"");}catch(reason){setError(reason instanceof Error?reason.message:"Unable to load integrations.");}finally{setBusy(false);}};
  useEffect(()=>{void refresh();},[open,selectedUnit,tenantId]);
  async function connect(){setBusy(true);setError("");try{const result=await secureJson<{authorizationUrl:string}>("/api/integrations/google","POST",{tenantId,unitId:selectedUnit,scope});window.location.assign(result.authorizationUrl);}catch(reason){setError(reason instanceof Error?reason.message:"Unable to start Google authorization.");setBusy(false);}}
  async function disconnect(item:GoogleConnection){if(!window.confirm(`Disconnect ${item.email}? Google access will be revoked where possible. Mail data remains in the CRM for ${item.retention_days} days, then is permanently removed.`))return;setBusy(true);setError("");try{const result=await secureJson<{googleGrantRevoked:boolean}>("/api/integrations/google","DELETE",{tenantId,connectionId:item.id});setNotice(result.googleGrantRevoked?`${item.email} disconnected. Its saved mail follows the unit retention policy.`:`${item.email} disconnected from CRM, but Google could not confirm grant revocation. Remove CRM access from your Google Account security settings.`);await refresh();}catch(reason){setError(reason instanceof Error?reason.message:"Unable to disconnect this mailbox.");}finally{setBusy(false);}}
  async function saveRetention(item:GoogleConnection,event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget),retentionDays=Number(form.get("retentionDays"));setBusy(true);setError("");try{await secureJson("/api/integrations/google","PATCH",{tenantId,connectionId:item.id,retentionDays});setNotice(`Retention updated for ${item.email}.`);await refresh();}catch(reason){setError(reason instanceof Error?reason.message:"Unable to save retention.");}finally{setBusy(false);}}
  async function saveEmailSettings(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");try{const result=await secureJson<{receiptAutoEnabled:boolean}>("/api/settings/email","PUT",{tenantId,unitId:selectedUnit,receiptAutoEnabled:receiptEnabled,receiptSubject,receiptBody});setReceiptEnabled(result.receiptAutoEnabled);setNotice("Automatic receipt settings saved. Delivery waits for the company mail server connection.");}catch(reason){setError(reason instanceof Error?reason.message:"Unable to save receipt settings.");}finally{setBusy(false);}}
  function editEvent(connectionId:string,event:{id:string;summary:string;start:string;end:string}){setEditingEvent(event.id);setEventConnection(connectionId);setEventTitle(event.summary);setEventStart(event.start.includes("T")?event.start.slice(0,16):`${event.start}T09:00`);setEventEnd(event.end.includes("T")?event.end.slice(0,16):`${event.end}T10:00`);}
  async function saveEvent(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!window.confirm(`${editingEvent?"Update":"Create"} “${eventTitle}” on the selected connected Google Calendar?`))return;setBusy(true);setError("");try{await secureJson("/api/integrations/calendar","POST",{tenantId,unitId:selectedUnit,connectionId:eventConnection,eventId:editingEvent||undefined,action:editingEvent?"update":"create",confirmed:true,summary:eventTitle,start:new Date(eventStart).toISOString(),end:new Date(eventEnd).toISOString()});setNotice(`Calendar event ${editingEvent?"updated":"created"}.`);setEditingEvent("");setEventTitle("");await refresh();}catch(reason){setError(reason instanceof Error?reason.message:"Unable to save calendar event.");}finally{setBusy(false);}}
  return <>
    <button className="crm-panel-link" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={()=>{setNotice("");setError("");setOpen(true);}}><Mail size={14}/> Connect Gmail & Calendar</button>
    {open&&<div className="crm-overlay" role="presentation" onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}><section className="crm-modal crm-google-modal" role="dialog" aria-modal="true" aria-labelledby="google-connections-heading">
      <header className="crm-modal-head"><div><h2 id="google-connections-heading">Email & calendar connections</h2><p>Gmail is imported into its business unit. Personal mail stays private to its owner; shared mail is visible to authorized unit members.</p></div><button className="crm-icon-button" aria-label="Close connections" onClick={()=>setOpen(false)}><X size={17}/></button></header>
      <div className="crm-google-body"><label className="crm-field">Business unit<select value={selectedUnit} onChange={event=>setSelectedUnit(event.target.value)}>{units.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <div className="crm-google-connect-row"><label className="crm-field">Mailbox access<select value={scope} onChange={event=>setScope(event.target.value as "personal"|"shared")}><option value="personal">My personal mailbox</option><option value="shared">Shared business mailbox</option></select></label><button className="crm-primary" disabled={busy||!selectedUnit||!configured} onClick={()=>void connect()}>{busy?<LoaderCircle size={15} className="crm-assistant-spin"/>:<Mail size={15}/>}Connect Google</button></div>
        {!configured&&<p className="crm-google-hint">Google OAuth setup is pending. The app needs a Google OAuth client ID, client secret, and token-encryption key. Register this redirect URI: <code>{typeof window!=="undefined"?`${window.location.origin}/api/integrations/google/callback`:"/api/integrations/google/callback"}</code></p>}
        {notice&&<p className="crm-notice" role="status">{notice}</p>}{error&&<p className="crm-alert" role="alert">{error}</p>}
        <div className="crm-google-list"><h3>Connected accounts</h3>{items.map(item=><article className="crm-google-item" key={item.id}><span className="crm-google-icon">{item.granted_scopes.includes("calendar.events")?<CalendarDays size={17}/>:<Mail size={17}/>}</span><div className="crm-list-content"><strong>{item.email}</strong><span>{item.connection_scope==="shared"?"Shared unit mailbox":"Personal mailbox"} · {item.status.replaceAll("_"," ")}</span><small>{item.status==="disconnected"?`Disconnected · data retained ${item.retention_days} days`:item.last_sync_error?`Mail sync needs attention (${item.last_sync_error})`:item.last_sync_status==="queued"||item.last_sync_status==="running"?`Importing mail · ${Number(item.scanned_count||0).toLocaleString()} messages scanned`:item.last_sync_status==="complete"?`Mail synced · ${Number(item.scanned_count||0).toLocaleString()} messages scanned`:"Gmail read access · Calendar event access"}</small>{item.canManageRetention&&<form className="crm-google-retention" onSubmit={event=>void saveRetention(item,event)}><label>Mail retention after disconnect<select name="retentionDays" defaultValue={item.retention_days}><option value="0">Delete immediately</option><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">1 year</option><option value="1095">3 years</option></select></label><button className="crm-secondary crm-button-small" disabled={busy}>Save</button></form>}</div>{item.status!=="disconnected"&&<button className="crm-secondary crm-button-small" disabled={busy||!item.canDisconnect} onClick={()=>void disconnect(item)}>Disconnect</button>}</article>)}{!busy&&!items.length&&<p className="crm-google-hint">No Google accounts are connected to this business unit yet.</p>}</div>
        {canManageEmail&&<form className="crm-email-receipt-config" onSubmit={event=>void saveEmailSettings(event)}><h3>Automatic receipt</h3><label className="crm-email-receipt-toggle"><input type="checkbox" checked={receiptEnabled} onChange={event=>setReceiptEnabled(event.target.checked)}/><span><strong>Enable simple acknowledgements</strong><small>Replies go to the sender of the received email. Default is off. Delivery starts after the company mail server is connected.</small></span></label><label className="crm-field">Subject<input value={receiptSubject} maxLength={250} onChange={event=>setReceiptSubject(event.target.value)}/></label><label className="crm-field">Message<textarea value={receiptBody} rows={3} maxLength={4000} onChange={event=>setReceiptBody(event.target.value)}/></label><button className="crm-secondary crm-button-small" disabled={busy}>Save receipt settings</button></form>}
        <div className="crm-google-calendar"><h3>Google Calendar</h3>{calendars.map(calendar=><section key={calendar.connectionId}><strong>{calendar.email}</strong>{calendar.error?<p className="crm-google-hint">{calendar.error}</p>:<>{calendar.events.map(event=><div className="crm-google-event" key={event.id}><span><strong>{event.summary}</strong><small>{event.start.replace("T"," ").slice(0,16)}</small></span><button className="crm-secondary crm-button-small" disabled={busy} onClick={()=>editEvent(calendar.connectionId,event)}>Edit</button></div>)}{!calendar.events.length&&<p className="crm-google-hint">No events in the next 30 days.</p>}</>}</section>)}{items.some(item=>item.status==="active")&&<form className="crm-google-event-form" onSubmit={event=>void saveEvent(event)}><label className="crm-field">Calendar<select value={eventConnection} onChange={event=>setEventConnection(event.target.value)}>{items.filter(item=>item.status==="active").map(item=><option key={item.id} value={item.id}>{item.email}</option>)}</select></label><label className="crm-field">Event title<input required value={eventTitle} onChange={event=>setEventTitle(event.target.value)} maxLength={250}/></label><div className="crm-google-dates"><label className="crm-field">Start<input type="datetime-local" required value={eventStart} onChange={event=>setEventStart(event.target.value)}/></label><label className="crm-field">End<input type="datetime-local" required value={eventEnd} onChange={event=>setEventEnd(event.target.value)}/></label></div><button className="crm-primary" disabled={busy||!eventConnection}>{editingEvent?"Review & update event":"Review & create event"}</button>{editingEvent&&<button type="button" className="crm-secondary crm-button-small" onClick={()=>{setEditingEvent("");setEventTitle("");}}>Cancel edit</button>}</form>}</div>
        <p className="crm-google-hint">Google will request Gmail read access and Google Calendar event access. Calendar changes will require review and confirmation in the CRM.</p>
      </div>
    </section></div>}
  </>;
}
