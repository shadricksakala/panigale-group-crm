"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowDownRight, ArrowUpRight, BriefcaseBusiness, Building2, CalendarClock, Check, CircleDollarSign, ClipboardList, ContactRound, ExternalLink, FileText, Handshake, LoaderCircle, LockKeyhole, LogIn, Plus, Search, Settings2, ShieldCheck, Users, X } from "lucide-react";
import { getJson, secureJson } from "../../lib/client/api";

type Unit = { id: string; name: string; slug: string; category: string; website?: string | null; active?: number };
type RecordRow = Record<string, string | number | null | undefined> & { id: string; unit_id?: string; unit_name?: string; name?: string; title?: string; status?: string; stage?: string; amount_minor?: number; value_minor?: number; email?: string; phone?: string };
type Tab = "overview" | "contacts" | "leads" | "work" | "proposals" | "invoices" | "access";
type Summary = { leads: Record<string, { count: number; valueMinor: number }>; contacts: number; activeProjects: number; dueTasks: number; invoices: Record<string, { count: number; amountMinor: number }>; proposals: Record<string, number> };
type Bootstrap = { ready: boolean; canBootstrap: boolean; hasAccess?: boolean; role?: string | null; tenant?: { id: string; name: string } };
type Member = { user_id: string; name: string | null; email: string; role: string; unit_ids: string };
type InputField = { name: string; label: string; type?: string; options?: string[]; required?: boolean; wide?: boolean };

const ventures = [
  ["PaniPay", "Payments and invoicing", "https://panipay.panigale.tech"],
  ["FutureCampus", "Education technology", "https://futurecampus.africa"],
  ["Euroza Consultancy", "Strategy and advisory", "https://euroza.panigale.tech"],
  ["EBT", "Business technology", "https://ebt.panigale.tech"],
  ["ZedPreneurs", "Entrepreneurship and skills", "https://zedprenuers.com"],
  ["StrongPoint Capital", "Fund management", "https://strongpoint.panigale.tech"],
  ["Ultra FX Academy", "Financial education", "https://ultrafxacademy.online"],
  ["The Proventus Show", "Media and thought leadership", "https://pshow.panigale.tech"],
  ["ASIL Zambia", "Advanced AI research", "https://panigale.tech/asil/"],
];

const tabList: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "contacts", label: "Contacts", icon: ContactRound },
  { id: "leads", label: "Pipeline", icon: ArrowUpRight },
  { id: "work", label: "Work", icon: BriefcaseBusiness },
  { id: "proposals", label: "Proposals", icon: FileText },
  { id: "invoices", label: "Invoices", icon: CircleDollarSign },
  { id: "access", label: "Team access", icon: ShieldCheck },
];

const formFields: Record<string, InputField[]> = {
  contacts: [
    { name: "name", label: "Name", required: true },
    { name: "contact_type", label: "Record type", options: ["person", "organization"] },
    { name: "company", label: "Company or institution" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone" },
    { name: "source", label: "How did they find us?" },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  leads: [
    { name: "title", label: "Opportunity", required: true },
    { name: "contact_id", label: "Contact", options: [] },
    { name: "stage", label: "Stage", options: ["new", "qualified", "proposal", "won", "lost"] },
    { name: "source", label: "Lead source" },
    { name: "value_minor", label: "Expected value (ZMW)" },
    { name: "expected_close", label: "Expected close date", type: "date" },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  activities: [
    { name: "title", label: "Task or activity", required: true },
    { name: "kind", label: "Type", options: ["task", "follow_up", "call", "meeting", "email", "note"] },
    { name: "contact_id", label: "Contact", options: [] },
    { name: "lead_id", label: "Opportunity", options: [] },
    { name: "due_at", label: "Due date", type: "date" },
    { name: "details", label: "Details", type: "textarea", wide: true },
  ],
  projects: [
    { name: "name", label: "Project or programme", required: true },
    { name: "contact_id", label: "Client or partner", options: [] },
    { name: "lead_id", label: "Related opportunity", options: [] },
    { name: "status", label: "Status", options: ["planned", "active", "on_hold", "completed", "cancelled"] },
    { name: "due_date", label: "Target date", type: "date" },
    { name: "description", label: "Scope or summary", type: "textarea", wide: true },
  ],
  proposals: [
    { name: "title", label: "Proposal or quotation", required: true },
    { name: "contact_id", label: "Client or partner", options: [] },
    { name: "lead_id", label: "Related opportunity", options: [] },
    { name: "amount_minor", label: "Amount (ZMW)" },
    { name: "valid_until", label: "Valid until", type: "date" },
    { name: "scope", label: "Scope and notes", type: "textarea", wide: true },
  ],
  invoices: [
    { name: "title", label: "Invoice or receivable", required: true },
    { name: "contact_id", label: "Client or partner", options: [] },
    { name: "proposal_id", label: "Related proposal", options: [] },
    { name: "amount_minor", label: "Amount (ZMW)", required: true },
    { name: "external_reference", label: "Invoice reference or PaniPay link" },
    { name: "due_date", label: "Due date", type: "date" },
    { name: "status", label: "Status", options: ["draft", "sent", "paid", "overdue", "cancelled"] },
  ],
};

const labels: Record<string, string> = { new: "New", qualified: "Qualified", proposal: "Proposal", won: "Won", lost: "Lost", planned: "Planned", active: "Active", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled", draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", accepted: "Accepted", rejected: "Rejected", expired: "Expired", open: "Open" };

function money(minor?: number | null) {
  return new Intl.NumberFormat("en-ZM", { style: "currency", currency: "ZMW", maximumFractionDigits: 0 }).format(Number(minor || 0) / 100);
}

function titleCase(value: string) { return (labels[value] || value || "—").replaceAll("_", " "); }

export default function CrmPage() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [contacts, setContacts] = useState<RecordRow[]>([]);
  const [leads, setLeads] = useState<RecordRow[]>([]);
  const [activities, setActivities] = useState<RecordRow[]>([]);
  const [projects, setProjects] = useState<RecordRow[]>([]);
  const [proposals, setProposals] = useState<RecordRow[]>([]);
  const [invoices, setInvoices] = useState<RecordRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [modal, setModal] = useState("");
  const [query, setQuery] = useState("");
  const [formUnit, setFormUnit] = useState("");

  const querySuffix = useMemo(() => {
    const query = new URLSearchParams();
    if (bootstrap?.tenant?.id) query.set("tenantId", bootstrap.tenant.id);
    if (selectedUnit) query.set("unitId", selectedUnit);
    return query.size ? `?${query}` : "";
  }, [bootstrap?.tenant?.id, selectedUnit]);

  const load = useCallback(async (withBootstrap = false) => {
    setError("");
    if (withBootstrap || !bootstrap) {
      const state = await getJson<Bootstrap>("/api/crm/admin");
      setBootstrap(state);
      if (!state.hasAccess) return;
    }
    const suffix = querySuffix;
    const [unitData, dashboard, contactData, leadData, activityData, projectData, proposalData, invoiceData] = await Promise.all([
      getJson<{ data: Unit[] }>(`/api/crm/units${suffix}`),
      getJson<{ data: Summary }>(`/api/crm/dashboard${suffix}`),
      getJson<{ data: RecordRow[] }>(`/api/crm/contacts${suffix}`),
      getJson<{ data: RecordRow[] }>(`/api/crm/leads${suffix}`),
      getJson<{ data: RecordRow[] }>(`/api/crm/activities${suffix}`),
      getJson<{ data: RecordRow[] }>(`/api/crm/projects${suffix}`),
      getJson<{ data: RecordRow[] }>(`/api/crm/proposals${suffix}`),
      getJson<{ data: RecordRow[] }>(`/api/crm/invoices${suffix}`),
    ]);
    setUnits(unitData.data || []); setSummary(dashboard.data); setContacts(contactData.data || []); setLeads(leadData.data || []); setActivities(activityData.data || []); setProjects(projectData.data || []); setProposals(proposalData.data || []); setInvoices(invoiceData.data || []);
  }, [bootstrap, querySuffix]);

  useEffect(() => { let active = true; setLoading(true); load(true).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Unable to open the CRM."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [load]);

  useEffect(() => {
    if (tab !== "access" || !bootstrap?.hasAccess || bootstrap.role !== "superadmin") return;
    let active = true;
    getJson<{ data: Member[] }>(`/api/crm/members?tenantId=${encodeURIComponent(bootstrap.tenant?.id || "")}`).then(team => { if (active) setMembers(team.data || []); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load CRM access."); });
    return () => { active = false; };
  }, [tab, bootstrap]);

  const visibleContacts = useMemo(() => contacts.filter(item => `${item.name || ""} ${item.company || ""} ${item.email || ""}`.toLowerCase().includes(query.toLowerCase())), [contacts, query]);

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, values = new FormData(form), data: Record<string, unknown> = { unitId: formUnit || selectedUnit || units[0]?.id };
    for (const field of formFields[modal] || []) { const value = values.get(field.name); if (value !== null && value !== "") data[field.name] = field.name.endsWith("_minor") ? Math.round(Number(value) * 100) : value; }
    setBusy(true); setError(""); setNotice("");
    try { await secureJson(`/api/crm/${modal}${querySuffix}`, "POST", data); setModal(""); setFormUnit(""); setNotice("Saved to the selected business unit."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save this CRM record."); }
    finally { setBusy(false); }
  }

  async function updateStatus(resource: string, row: RecordRow, field: "status" | "stage", value: string) {
    setBusy(true); setError(""); setNotice("");
    try { await secureJson(`/api/crm/${resource}${querySuffix}`, "PATCH", { id: row.id, [field]: value }); setNotice("Status updated."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update the record."); }
    finally { setBusy(false); }
  }

  async function archive(resource: string, row: RecordRow) {
    if (!confirm(`Archive “${row.title || row.name}”?`)) return;
    setBusy(true); setError("");
    try { await secureJson(`/api/crm/${resource}${querySuffix}`, "DELETE", { id: row.id }); await load(); setNotice("Record archived."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to archive this record."); }
    finally { setBusy(false); }
  }

  async function grantMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, values = new FormData(form), unitIds = values.getAll("unitIds").map(String), role = String(values.get("role") || "member");
    setBusy(true); setError("");
    try { await secureJson(`/api/crm/members?tenantId=${encodeURIComponent(bootstrap?.tenant?.id || "")}`, "POST", { email: values.get("email"), role, unitIds }); form.reset(); setNotice("CRM access updated."); setTab("access"); await load(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to grant CRM access."); }
    finally { setBusy(false); }
  }

  async function revokeMember(member: Member) {
    if (!confirm(`Revoke CRM access for ${member.email}?`)) return;
    setBusy(true); setError("");
    try { await secureJson(`/api/crm/members?tenantId=${encodeURIComponent(bootstrap?.tenant?.id || "")}`, "DELETE", { userId: member.user_id }); setMembers(current => current.filter(row => row.user_id !== member.user_id)); setNotice("CRM access revoked."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to revoke CRM access."); }
    finally { setBusy(false); }
  }

  async function bootstrapWorkspace() {
    setBusy(true); setError("");
    try { await secureJson("/api/crm/admin", "POST", { action: "bootstrap" }); await load(true); setNotice("Panigale Group CRM workspace is ready."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to set up the CRM workspace."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#f4f7f3] text-[#15251e]">
    <header className="sticky top-0 z-20 border-b border-[#dfe8e0] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-7 lg:px-10">
        <a href="https://panigale.tech" className="flex min-w-0 items-center gap-3" aria-label="Panigale Group home">
          <span className="whitespace-nowrap text-[14px] font-bold tracking-[.14em] text-[#102a20] sm:text-[15px]">PANIGALE <span className="font-medium tracking-[.3em] text-[#9b7838]">GROUP</span></span>
          <span className="h-8 w-px bg-[#dfe8e0]"/><span className="truncate text-sm font-semibold text-[#527064]">Group CRM</span>
        </a>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-1.5 rounded-full bg-[#e9f2eb] px-3 py-1.5 text-xs font-semibold text-[#25583f] sm:inline-flex"><LockKeyhole size={13}/>Private workspace</span>
          <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dce6df] px-3 text-xs font-semibold text-[#365848] hover:bg-[#f4f7f3] sm:px-4 sm:text-sm">PaniPay <ExternalLink size={14}/></Link>
        </div>
      </div>
    </header>

    <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-5 sm:px-7 sm:py-7 lg:grid-cols-[226px_minmax(0,1fr)] lg:gap-9 lg:px-10">
      <aside className="lg:sticky lg:top-[92px] lg:h-[calc(100vh-120px)]">
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-[#dfe8e0] bg-white p-3 lg:block lg:border-0 lg:bg-transparent lg:p-0">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#768a7e]">Workspace</p><div className="mt-1 flex items-center gap-2"><Building2 size={17} className="shrink-0 text-[#256547]"/><span className="truncate text-sm font-bold">{bootstrap?.tenant?.name || "Panigale Group"}</span></div></div>
          {units.length > 1 && <label className="ml-2 min-w-[118px] max-w-[48%] lg:mt-4 lg:block lg:max-w-full"><span className="sr-only">Filter by business unit</span><select value={selectedUnit} onChange={event => setSelectedUnit(event.target.value)} className="w-full min-h-10 rounded-xl border border-[#dfe8e0] bg-white px-3 text-xs font-semibold text-[#345b48] outline-none focus:ring-2 focus:ring-[#70a37e]"><option value="">All my businesses</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>}
        </div>
        <nav aria-label="CRM sections" className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">{tabList.filter(item => item.id !== "access" || bootstrap?.role === "superadmin").map(item => { const Icon = item.icon; const active = tab === item.id; return <button key={item.id} onClick={() => { setTab(item.id); setQuery(""); }} className={`inline-flex min-h-10 shrink-0 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition lg:w-full ${active ? "bg-[#174c36] text-white shadow-sm" : "bg-white text-[#557165] hover:bg-[#e9f2eb] lg:bg-transparent"}`}><Icon size={17}/>{item.label}{active && <ArrowDownRight size={14} className="ml-auto hidden lg:block"/>}</button>; })}</nav>
        <div className="mt-8 hidden rounded-2xl border border-[#dfe8e0] bg-white p-4 lg:block"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#788b80]">Data access</p><p className="mt-2 text-xs leading-5 text-[#5b7065]">Business records stay private to assigned teams. CRM superadmins control cross-business access.</p><div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#286648]"><ShieldCheck size={15}/>Access is audited</div></div>
      </aside>

      <section className="min-w-0">
        {error && <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={17}/></button></div>}
        {notice && <div role="status" className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={17}/></button></div>}
        {loading ? <div role="status" className="grid min-h-[420px] place-items-center rounded-3xl border border-[#dfe8e0] bg-white text-sm text-[#5b7065]"><span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={18}/>Opening Group CRM…</span></div>
          : bootstrap && !bootstrap.ready ? <div className="grid min-h-[500px] place-items-center rounded-3xl border border-[#dfe8e0] bg-white p-7 text-center"><div className="max-w-md"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e8f1e9] text-[#286648]"><Handshake size={26}/></span><h1 className="mt-5 text-2xl font-bold">Panigale Group CRM</h1><p className="mt-2 text-sm leading-6 text-[#617568]">Set up the private Group workspace with business-unit pipelines and access controls.</p>{bootstrap.canBootstrap ? <button disabled={busy} onClick={() => void bootstrapWorkspace()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#174c36] px-5 text-sm font-bold text-white hover:bg-[#123e2c] disabled:opacity-60"><Settings2 size={16}/>{busy ? "Setting up…" : "Set up Group workspace"}</button> : <p className="mt-5 flex items-center justify-center gap-2 text-sm text-[#667a6e]"><LockKeyhole size={16}/>Ask a PaniPay platform superadmin to set up this workspace.</p>}</div></div>
          : bootstrap && !bootstrap.hasAccess ? <div className="grid min-h-[500px] place-items-center rounded-3xl border border-[#dfe8e0] bg-white p-7 text-center"><div className="max-w-md"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e8f1e9] text-[#286648]"><LockKeyhole size={26}/></span><h1 className="mt-5 text-2xl font-bold">Access hasn’t been granted</h1><p className="mt-2 text-sm leading-6 text-[#617568]">A CRM superadmin must assign your account to one or more business units. Your PaniPay account does not grant CRM access automatically.</p><Link href="/?mode=login&returnTo=%2Fcrm" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe8e0] px-4 text-sm font-semibold text-[#345b48]"><LogIn size={16}/>Sign in to PaniPay</Link></div></div>
          : <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#8c7136]">PANIGALE GROUP · RELATIONSHIPS & DELIVERY</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{tabList.find(item => item.id === tab)?.label}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#66796d]">Manage the relationships and opportunities that move across your assigned businesses.</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto">{tab !== "overview" && tab !== "access" && <button onClick={() => { setModal(tab === "work" ? "activities" : tab); setFormUnit(selectedUnit || units[0]?.id || ""); }} disabled={!units.length} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#174c36] px-4 text-sm font-bold text-white hover:bg-[#123e2c] disabled:opacity-50 sm:flex-none"><Plus size={16}/>{tab === "work" ? "Add task or project" : `Add ${tab === "leads" ? "opportunity" : tab === "invoices" ? "invoice record" : tab.slice(0, -1)}`}</button>}{tab === "contacts" && <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-[#dfe8e0] bg-white px-3 sm:flex-none"><Search size={16} className="text-[#819187]"/><input aria-label="Search contacts" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search contacts" className="w-full bg-transparent text-sm outline-none sm:w-40"/></label>}</div></div>
            {!units.length && tab !== "overview" && <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No business units are assigned to your CRM account. Ask a CRM superadmin for access.</div>}

            {tab === "overview" && <Overview summary={summary} leads={leads} activities={activities} projects={projects} invoices={invoices} units={units} />}
            {tab === "contacts" && <RecordsList title="Contacts and organisations" empty="No contacts yet. Add a person or organisation to start a relationship record." rows={visibleContacts} columns={["name","company","email","phone","unit_name"]} onArchive={row => void archive("contacts", row)} busy={busy}/>}
            {tab === "leads" && <Pipeline leads={leads} onStatus={(row, stage) => void updateStatus("leads", row, "stage", stage)} onArchive={row => void archive("leads", row)} busy={busy}/>}
            {tab === "work" && <WorkList projects={projects} activities={activities} onTaskStatus={(row, status) => void updateStatus("activities", row, "status", status)} onProjectStatus={(row, status) => void updateStatus("projects", row, "status", status)} onAddProject={() => { setModal("projects"); setFormUnit(selectedUnit || units[0]?.id || ""); }} onAddTask={() => { setModal("activities"); setFormUnit(selectedUnit || units[0]?.id || ""); }} busy={busy}/>}
            {tab === "proposals" && <RecordsList title="Proposals and quotations" empty="No proposals yet. Track scope, value, and approval status here." rows={proposals} columns={["title","unit_name","status","amount_minor","valid_until"]} statusOptions={["draft","sent","accepted","rejected","expired"]} onStatus={(row, status) => void updateStatus("proposals", row, "status", status)} onArchive={row => void archive("proposals", row)} busy={busy}/>}
            {tab === "invoices" && <RecordsList title="Invoice and collection tracking" empty="No invoice records yet. Link a PaniPay invoice reference to track collection here." rows={invoices} columns={["title","unit_name","status","amount_minor","due_date","external_reference"]} statusOptions={["draft","sent","paid","overdue","cancelled"]} onStatus={(row, status) => void updateStatus("invoices", row, "status", status)} onArchive={row => void archive("invoices", row)} busy={busy}/>}
            {tab === "access" && bootstrap?.role === "superadmin" && <AccessPanel units={units} members={members} allowSuperadmin={bootstrap.canBootstrap} onGrant={grantMember} onRevoke={member => void revokeMember(member)} busy={busy}/>}
          </>}
      </section>
    </div>

    {modal && <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#0d1f16]/45 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) setModal(""); }}><form onSubmit={saveRecord} className="my-auto max-h-[min(92vh,850px)] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#8a713e]">{units.find(unit => unit.id === formUnit)?.name || "Business unit"}</p><h2 className="mt-1 text-2xl font-bold">Add {modal === "activities" ? "task or activity" : modal === "leads" ? "opportunity" : modal === "invoices" ? "invoice record" : modal.slice(0, -1)}</h2></div><button type="button" onClick={() => setModal("")} aria-label="Close form" className="grid h-10 w-10 place-items-center rounded-xl hover:bg-[#eef3ee]"><X size={19}/></button></div>
      {!selectedUnit && units.length > 1 && <label className="mt-5 block text-sm font-semibold">Business unit<select value={formUnit} onChange={event => setFormUnit(event.target.value)} required className="mt-2 min-h-11 w-full rounded-xl border border-[#dce6df] bg-white px-3 font-normal"><option value="">Choose a business</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{(formFields[modal] || []).map(field => <label key={field.name} className={`block text-sm font-semibold ${field.wide ? "sm:col-span-2" : ""}`}>{field.label}{field.options ? <select name={field.name} required={field.required} defaultValue={field.name === "contact_id" || field.name === "lead_id" || field.name === "proposal_id" ? "" : field.options[0]} className="mt-2 min-h-11 w-full rounded-xl border border-[#dce6df] bg-white px-3 font-normal"><option value="">{field.name === "contact_id" ? "No linked contact" : field.name === "lead_id" ? "No linked opportunity" : field.name === "proposal_id" ? "No linked proposal" : "Choose"}</option>{field.options.map(option => <option value={option} key={option}>{option.replaceAll("_", " ")}</option>)}{field.name === "contact_id" && contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}{contact.company ? ` · ${contact.company}` : ""}</option>)}{field.name === "lead_id" && leads.map(lead => <option key={lead.id} value={lead.id}>{lead.title}</option>)}{field.name === "proposal_id" && proposals.map(proposal => <option key={proposal.id} value={proposal.id}>{proposal.title}</option>)}</select> : field.type === "textarea" ? <textarea name={field.name} required={field.required} rows={4} className="mt-2 w-full rounded-xl border border-[#dce6df] px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-[#7ba58a]"/> : <input name={field.name} type={field.type || "text"} required={field.required} min={field.name.endsWith("_minor") ? "0" : undefined} step={field.name.endsWith("_minor") ? "0.01" : undefined} className="mt-2 min-h-11 w-full rounded-xl border border-[#dce6df] px-3 font-normal outline-none focus:ring-2 focus:ring-[#7ba58a]"/>}</label>)}</div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setModal("")} className="min-h-11 rounded-xl border border-[#dce6df] px-4 text-sm font-semibold">Cancel</button><button disabled={busy || !formUnit && units.length > 1} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#174c36] px-5 text-sm font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16}/> : <Check size={16}/>}Save record</button></div></form></div>}
  </main>;
}

function Overview({ summary, leads, activities, projects, invoices, units }: { summary: Summary | null; leads: RecordRow[]; activities: RecordRow[]; projects: RecordRow[]; invoices: RecordRow[]; units: Unit[] }) {
  const pipelineValue = Object.values(summary?.leads || {}).reduce((total, item) => total + item.valueMinor, 0);
  const openLeads = Object.entries(summary?.leads || {}).filter(([stage]) => !["won", "lost"].includes(stage)).reduce((total, [, item]) => total + item.count, 0);
  const outstanding = Object.values(summary?.invoices || {}).filter(item => item).reduce((total, item, index) => total + (index === 0 ? item.amountMinor : 0), 0); // Summary cards show tracked sent/overdue totals below.
  const overdue = summary?.invoices?.overdue?.amountMinor || 0, sent = summary?.invoices?.sent?.amountMinor || 0;
  const stats = [
    { label: "Open opportunities", value: String(openLeads), detail: money(pipelineValue), icon: ArrowUpRight },
    { label: "Active relationships", value: String(summary?.contacts || 0), detail: "People and organisations", icon: Users },
    { label: "Work in progress", value: String(summary?.activeProjects || 0), detail: `${summary?.dueTasks || 0} tasks due in 7 days`, icon: BriefcaseBusiness },
    { label: "Awaiting collection", value: money(sent + overdue), detail: `${money(overdue)} overdue`, icon: CircleDollarSign },
  ];
  void outstanding;
  return <div className="space-y-6"><section className="overflow-hidden rounded-3xl bg-[#143e2d] p-6 text-white sm:p-8"><div className="flex flex-wrap items-start justify-between gap-6"><div className="max-w-xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.15em] text-[#d6e6d8]"><span className="h-1.5 w-1.5 rounded-full bg-[#d9bd67]"/>One Group · Connected work</span><h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Relationships into<br/>real progress.</h2><p className="mt-3 max-w-lg text-sm leading-6 text-white/75">Keep the group’s leads, follow-ups, active work, and collections moving in one private workspace.</p></div><div className="grid min-w-[220px] grid-cols-3 gap-2 self-end sm:w-[340px]"><div className="col-span-3 rounded-2xl bg-white/10 p-3"><div className="mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.15em] text-white/65"><span>Group pipeline</span><span>{openLeads} open</span></div><div className="flex h-3 overflow-hidden rounded-full bg-white/10">{["new","qualified","proposal","won"].map((stage,index)=>{const value=summary?.leads?.[stage]?.count||0;const total=Math.max(openLeads+(summary?.leads?.won?.count||0),1);return <span key={stage} className={`h-full ${["bg-[#e7d17d]","bg-[#a6c799]","bg-[#73a786]","bg-[#4b8060]"][index]}`} style={{width:`${Math.max(value/total*100,value?7:0)}%`}}/>})}</div><div className="mt-2 flex justify-between text-[10px] text-white/65"><span>New</span><span>Qualified</span><span>Proposal</span><span>Won</span></div></div><div className="rounded-2xl bg-white/10 p-3"><p className="text-[10px] text-white/60">Units</p><b className="mt-1 block text-2xl">{units.length}</b></div><div className="rounded-2xl bg-white/10 p-3"><p className="text-[10px] text-white/60">Leads</p><b className="mt-1 block text-2xl">{openLeads}</b></div><div className="rounded-2xl bg-white/10 p-3"><p className="text-[10px] text-white/60">Tasks</p><b className="mt-1 block text-2xl">{summary?.dueTasks||0}</b></div></div></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(stat=>{const Icon=stat.icon;return <article key={stat.label} className="rounded-2xl border border-[#dfe8e0] bg-white p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-[#60746a]">{stat.label}</span><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eaf2eb] text-[#286648]"><Icon size={17}/></span></div><b className="mt-3 block text-2xl tracking-tight">{stat.value}</b><p className="mt-1 text-xs text-[#829087]">{stat.detail}</p></article>})}</section>
    <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]"><div className="rounded-2xl border border-[#dfe8e0] bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-bold">Recent opportunities</h3><p className="mt-1 text-xs text-[#7a8b81]">Your latest sales activity</p></div><span className="text-xs font-semibold text-[#819187]">{leads.length} records</span></div><div className="mt-4 divide-y divide-[#edf1ed]">{leads.slice(0,5).map(lead=><div key={lead.id} className="flex items-center gap-3 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eef4ef] text-[#286648]"><Handshake size={16}/></span><div className="min-w-0 flex-1"><b className="block truncate text-sm">{lead.title}</b><span className="text-xs text-[#788a7f]">{lead.unit_name} · {titleCase(String(lead.stage))}</span></div><b className="shrink-0 text-xs">{lead.value_minor?money(Number(lead.value_minor)):"—"}</b></div>)}{!leads.length&&<p className="py-8 text-center text-sm text-[#849188]">No opportunities yet.</p>}</div></div><div className="space-y-5"><div className="rounded-2xl border border-[#dfe8e0] bg-white p-5"><div className="flex items-center gap-2"><CalendarClock size={17} className="text-[#286648]"/><h3 className="font-bold">Next actions</h3></div><div className="mt-4 space-y-3">{activities.filter(item=>item.status==="open").slice(0,4).map(task=><div key={task.id} className="flex items-start gap-3 rounded-xl bg-[#f5f8f5] p-3"><span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#bb9a45]"/><div className="min-w-0"><b className="block text-sm">{task.title}</b><span className="text-xs text-[#7a8b81]">{task.unit_name}{task.due_at?` · ${String(task.due_at).slice(0,10)}`:""}</span></div></div>)}{!activities.filter(item=>item.status==="open").length&&<p className="py-4 text-sm text-[#829087]">No open follow-ups.</p>}</div></div><div className="rounded-2xl border border-[#dfe8e0] bg-white p-5"><div className="flex items-center gap-2"><ClipboardList size={17} className="text-[#286648]"/><h3 className="font-bold">Active work</h3></div><div className="mt-3 space-y-2">{projects.filter(item=>["planned","active","on_hold"].includes(String(item.status))).slice(0,3).map(project=><div key={project.id} className="flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold">{project.name}</span><span className="shrink-0 rounded-full bg-[#eaf2eb] px-2 py-1 text-[10px] font-bold text-[#286648]">{titleCase(String(project.status))}</span></div>)}{!projects.filter(item=>["planned","active","on_hold"].includes(String(item.status))).length&&<p className="text-sm text-[#829087]">No projects or programmes yet.</p>}</div></div></div></section>
    <section className="rounded-2xl border border-[#dfe8e0] bg-white p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8a713e]">VENTURE DIRECTORY</p><h3 className="mt-1 text-lg font-bold">Work across the Group</h3></div><span className="text-xs text-[#7a8b81]">Specialist operations stay in their own systems</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{ventures.map(([name,category,url])=><a key={name} href={url} target="_blank" rel="noreferrer" className="flex min-h-[70px] items-center gap-3 rounded-xl border border-[#edf1ed] p-3 hover:border-[#9bbb9e] hover:bg-[#f7faf7]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eaf2eb] text-[#286648]"><Building2 size={16}/></span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{name}</b><span className="block truncate text-xs text-[#829087]">{category}</span></span><ExternalLink size={14} className="shrink-0 text-[#7d9183]"/></a>)}</div></section>
  </div>;
}

function RecordsList({ title, empty, rows, columns, onArchive, onStatus, statusOptions = [], busy }: { title: string; empty: string; rows: RecordRow[]; columns: string[]; onArchive?: (row: RecordRow) => void; onStatus?: (row: RecordRow, status: string) => void; statusOptions?: string[]; busy: boolean }) {
  return <section className="overflow-hidden rounded-2xl border border-[#dfe8e0] bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ed] px-4 py-4 sm:px-5"><h2 className="font-bold">{title}</h2><span className="text-xs text-[#7e8d83]">{rows.length} records</span></div>{rows.length?<div className="divide-y divide-[#edf1ed]">{rows.map(row=><article key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf2eb] text-[#286648]">{columns.includes("email")?<ContactRound size={17}/>:columns.includes("external_reference")?<CircleDollarSign size={17}/>:<FileText size={17}/>}</span><div className="min-w-0 flex-1"><b className="block truncate text-sm">{String(row.name||row.title||"Untitled")}</b><p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[#7e8d83]">{columns.filter(column=>!["name","title"].includes(column)&&row[column]!=null&&row[column]!=="").map(column=><span key={column}>{column==="amount_minor"?money(Number(row[column])):column==="unit_name"?row[column]:column==="status"||column==="stage"?titleCase(String(row[column])):String(row[column])}</span>)}</p></div>{onStatus&&row.status&&<select disabled={busy} aria-label={`Status for ${row.title||row.name}`} value={String(row.status)} onChange={event=>onStatus(row,event.target.value)} className="min-h-9 max-w-[135px] rounded-lg border border-[#dce6df] bg-white px-2 text-xs font-semibold"><option value={String(row.status)}>{titleCase(String(row.status))}</option>{statusOptions.filter(item=>item!==row.status).map(item=><option key={item} value={item}>{titleCase(item)}</option>)}</select>}{onArchive&&<button disabled={busy} onClick={()=>onArchive(row)} title="Archive record" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#89958c] hover:bg-rose-50 hover:text-rose-700"><X size={16}/></button>}</article>)}</div>:<p className="p-10 text-center text-sm text-[#839087]">{empty}</p>}</section>;
}

function Pipeline({ leads, onStatus, onArchive, busy }: { leads: RecordRow[]; onStatus: (row: RecordRow, stage: string) => void; onArchive: (row: RecordRow) => void; busy: boolean }) {
  const stages = ["new","qualified","proposal","won","lost"];
  return <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">{stages.map(stage=>{const rows=leads.filter(lead=>lead.stage===stage);return <section key={stage} className="min-w-0 rounded-2xl border border-[#dfe8e0] bg-[#edf3ee] p-3"><div className="flex items-center justify-between gap-2 px-1 pb-3"><h2 className="text-sm font-bold">{titleCase(stage)}</h2><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-[#617568]">{rows.length}</span></div><div className="space-y-2">{rows.map(lead=><article key={lead.id} className="rounded-xl border border-[#e2eae3] bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-2"><b className="min-w-0 text-sm">{lead.title}</b><button onClick={()=>onArchive(lead)} title="Archive opportunity" disabled={busy} className="text-[#a0aaa2] hover:text-rose-700"><X size={15}/></button></div><p className="mt-2 text-xs text-[#75867b]">{lead.unit_name}</p><div className="mt-3 flex items-center justify-between gap-2"><b className="text-xs">{lead.value_minor?money(Number(lead.value_minor)):"Value pending"}</b><select aria-label={`Move ${lead.title}`} disabled={busy} value={String(lead.stage)} onChange={event=>onStatus(lead,event.target.value)} className="max-w-[105px] rounded-lg border border-[#e0e8e0] bg-white px-2 py-1 text-[10px] font-semibold">{stages.map(value=><option key={value} value={value}>{titleCase(value)}</option>)}</select></div></article>)}{!rows.length&&<p className="rounded-xl border border-dashed border-[#cdd9cf] px-3 py-6 text-center text-xs text-[#849188]">No opportunities</p>}</div></section>})}</div>;
}

function WorkList({ projects, activities, onTaskStatus, onProjectStatus, onAddProject, onAddTask, busy }: { projects: RecordRow[]; activities: RecordRow[]; onTaskStatus: (row: RecordRow,status: string)=>void; onProjectStatus:(row:RecordRow,status:string)=>void; onAddProject:()=>void; onAddTask:()=>void; busy:boolean }) {
  return <div className="space-y-5"><div className="flex flex-wrap gap-2"><button onClick={onAddTask} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dce6df] bg-white px-4 text-sm font-semibold text-[#345b48]"><Plus size={15}/>Add task</button><button onClick={onAddProject} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dce6df] bg-white px-4 text-sm font-semibold text-[#345b48]"><Plus size={15}/>Add project or programme</button></div><RecordsList title="Tasks and follow-ups" empty="No work items yet. Add a task, call, or follow-up." rows={activities} columns={["title","unit_name","kind","status","due_at","owner_name"]} statusOptions={["open","completed","cancelled"]} onStatus={(row,status)=>onTaskStatus(row,status)} busy={busy}/><RecordsList title="Projects and programmes" empty="No projects or programmes yet." rows={projects} columns={["name","unit_name","status","due_date","owner_name"]} statusOptions={["planned","active","on_hold","completed","cancelled"]} onStatus={(row,status)=>onProjectStatus(row,status)} busy={busy}/></div>;
}

function AccessPanel({ units, members, allowSuperadmin, onGrant, onRevoke, busy }: { units: Unit[]; members: Member[]; allowSuperadmin: boolean; onGrant:(event:FormEvent<HTMLFormElement>)=>void; onRevoke:(member:Member)=>void; busy:boolean }) {
  return <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]"><form onSubmit={onGrant} className="rounded-2xl border border-[#dfe8e0] bg-white p-5"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-[#286648]"/><h2 className="font-bold">Grant access</h2></div><p className="mt-2 text-xs leading-5 text-[#788a7f]">Only CRM superadmins can grant access. Members see records for the business units selected here.</p><label className="mt-4 block text-sm font-semibold">PaniPay account email<input name="email" type="email" required maxLength={254} placeholder="Enter the person’s registered email" className="mt-2 min-h-11 w-full rounded-xl border border-[#dce6df] px-3 font-normal"/></label><label className="mt-4 block text-sm font-semibold">Access level<select name="role" className="mt-2 min-h-11 w-full rounded-xl border border-[#dce6df] bg-white px-3 font-normal"><option value="member">Member · selected businesses</option>{allowSuperadmin&&<option value="superadmin">CRM superadmin · all Group businesses</option>}</select></label><fieldset className="mt-4"><legend className="text-sm font-semibold">Business units</legend><div className="mt-2 grid gap-2">{units.map(unit=><label key={unit.id} className="flex min-h-10 items-center gap-2 rounded-lg bg-[#f4f7f3] px-3 text-sm"><input type="checkbox" name="unitIds" value={unit.id} className="accent-[#286648]"/><span>{unit.name}</span></label>)}</div><p className="mt-2 text-[11px] leading-4 text-[#829087]">Selections apply to Members. Superadmins see all units.</p></fieldset><button disabled={busy} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#174c36] px-4 text-sm font-bold text-white disabled:opacity-50">{busy?<LoaderCircle className="animate-spin" size={16}/>:<Plus size={16}/>}Grant CRM access</button><p className="mt-3 text-[11px] leading-4 text-[#89948c]">The person needs an active PaniPay account before access can be granted.</p></form><section className="overflow-hidden rounded-2xl border border-[#dfe8e0] bg-white"><div className="flex items-center justify-between gap-3 border-b border-[#edf1ed] p-4"><div><h2 className="font-bold">Current CRM team</h2><p className="mt-1 text-xs text-[#7e8d83]">{members.length} people · changes are audited</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eaf2eb] text-[#286648]"><Users size={17}/></span></div><div className="divide-y divide-[#edf1ed]">{members.map(member=><article key={member.user_id} className="flex items-start gap-3 p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eaf2eb] font-bold text-[#286648]">{(member.name||member.email).slice(0,1).toUpperCase()}</span><div className="min-w-0 flex-1"><b className="block truncate text-sm">{member.name||member.email}</b><p className="mt-0.5 truncate text-xs text-[#7e8d83]">{member.email}</p><p className="mt-2 text-[11px] font-semibold text-[#50715e]">{member.role==="superadmin"?"All Group businesses · CRM superadmin":units.filter(unit=>member.unit_ids.split(",").includes(unit.id)).map(unit=>unit.name).join(" · ")||"No business units assigned"}</p></div>{member.role!=="superadmin"&&<button disabled={busy} onClick={()=>onRevoke(member)} title="Revoke CRM access" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#87938a] hover:bg-rose-50 hover:text-rose-700"><X size={16}/></button>}</article>)}{!members.length&&<p className="p-10 text-center text-sm text-[#839087]">No CRM members yet.</p>}</div></section></div>;
}
