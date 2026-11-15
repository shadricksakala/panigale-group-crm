"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, Archive, ArrowDownRight, ArrowRight, Bell, BriefcaseBusiness, Building2, CalendarDays,
  Check, CheckSquare2, ChevronDown, CircleDollarSign, ClipboardList, Clock3, ContactRound,
  Download, ExternalLink, FileText, Filter, Handshake, Home, LayoutGrid, LoaderCircle, LockKeyhole,
  LogOut, Mail, MoreHorizontal, Paperclip, Pencil, Phone, Plus, Search, Send, Settings2,
  ShieldCheck, Sparkles, Target, TrendingUp, Users, WalletCards, X,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ApiError, getJson, secureForm, secureJson } from "../../lib/client/api";

type Row = Record<string, string | number | boolean | null | undefined> & { id: string };
type Module = "overview" | "contacts" | "pipeline" | "projects" | "tasks" | "proposals" | "documents" | "invoices" | "reports" | "access";
type User = { id: string; name: string; email: string };
type Unit = { id: string; name: string; slug: string; category: string; website?: string | null; accent?: string; can_view_financials?: number };
type Tenant = { id: string; name: string; slug: string; role: string };
type Stage = { id: string; name: string; slug: string; color: string; position: number; is_won: number; is_lost: number; active: number };
type Context = { user: User; memberships: Tenant[]; tenant: Tenant | null; role: string | null; units: Unit[]; stages?: Stage[]; members?: Row[] };
type Field = { name: string; label: string; type?: string; wide?: boolean; required?: boolean; options?: { value: string; label: string }[] };
type CrmData = { dashboard:Row|null; companies:Row[]; contacts:Row[]; leads:Row[]; activities:Row[]; projects:Row[]; projectMembers:Row[]; milestones:Row[]; deliverables:Row[]; proposals:Row[]; documents:Row[]; invoices:Row[]; payments:Row[]; stages:Stage[]; members:Row[]; reports:Row|null };

const nav: { id: Module; label: string; icon: typeof Home }[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "contacts", label: "Contacts", icon: ContactRound },
  { id: "pipeline", label: "Pipeline", icon: Filter },
  { id: "projects", label: "Projects", icon: BriefcaseBusiness },
  { id: "tasks", label: "Tasks", icon: CheckSquare2 },
  { id: "proposals", label: "Proposals", icon: FileText },
  { id: "documents", label: "Documents", icon: Paperclip },
  { id: "invoices", label: "Invoices", icon: WalletCards },
  { id: "reports", label: "Reports", icon: Activity },
  { id: "access", label: "Team access", icon: ShieldCheck },
];

const emptyData:CrmData = { companies: [], contacts: [], leads: [], activities: [], projects: [], projectMembers: [], milestones: [], deliverables: [], proposals: [], documents: [], invoices: [], payments: [], stages: [], members: [], reports: null, dashboard: null };
const CHART_COLORS = ["#0876f9", "#18b88b", "#f2ad22", "#8165e8", "#e46d54", "#9aa8bc"];

function initials(value: unknown) {
  return String(value || "PG").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}
function titleCase(value: unknown) {
  const text = String(value || "").replaceAll("_", " ");
  return text ? text.replace(/\b\w/g, character => character.toUpperCase()) : "—";
}
function money(minor: unknown, currency = "ZMW") {
  const number = Number(minor || 0) / 100;
  return new Intl.NumberFormat("en-ZM", { style: "currency", currency, maximumFractionDigits: 0 }).format(number);
}
function fmtDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function safeText(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
function queryString(tenantId: string, unitId: string) {
  const query = new URLSearchParams();
  if (tenantId) query.set("tenantId", tenantId);
  if (unitId) query.set("unitId", unitId);
  return query.size ? `?${query}` : "";
}
function pillTone(status: unknown) {
  const value = String(status || "").toLowerCase();
  if (["active", "client", "won", "paid", "completed", "accepted", "in_progress"].includes(value)) return "green";
  if (["proposal", "qualified", "sent", "in_review", "prospect"].includes(value)) return "blue";
  if (["overdue", "lost", "blocked", "cancelled", "rejected"].includes(value)) return "red";
  if (["new", "planned", "draft", "pending", "not_started", "on_hold"].includes(value)) return "gold";
  return "";
}
function EmptyState({ icon: Icon, title, detail, action }: { icon: typeof FileText; title: string; detail: string; action?: ReactNode }) {
  return <div className="crm-empty"><div><span className="crm-empty-icon"><Icon size={21}/></span><h3>{title}</h3><p>{detail}</p>{action && <div style={{ marginTop: 15 }}>{action}</div>}</div></div>;
}
function Pill({ value }: { value: unknown }) {
  return <span className={`crm-pill ${pillTone(value)}`}>{titleCase(value)}</span>;
}
function Brand() {
  return <a className="crm-brand" href="/crm"><img src="/panigale-wordmark.png" alt="Panigale Group" style={{width:138,height:"auto",objectFit:"contain"}}/><span className="crm-brand-name"><span>CRM</span></span></a>;
}

const baseFields: Record<string, Field[]> = {
  companies: [
    { name: "name", label: "Organization name", required: true },
    { name: "status", label: "Relationship", type: "select", options: ["lead", "prospect", "client", "partner", "inactive"] .map(value => ({ value, label: titleCase(value) })) },
    { name: "industry", label: "Industry" }, { name: "segment", label: "Segment" },
    { name: "owner_user_id", label: "Relationship owner", type: "select" },
    { name: "website", label: "Website", type: "url" }, { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "tel" }, { name: "source", label: "Source" },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  contacts: [
    { name: "name", label: "Full name", required: true }, { name: "job_title", label: "Job title" },
    { name: "company_id", label: "Organization", type: "select" },
    { name: "status", label: "Relationship", type: "select", options: ["lead", "prospect", "client", "partner", "inactive"].map(value => ({ value, label: titleCase(value) })) },
    { name: "owner_user_id", label: "Relationship owner", type: "select" },
    { name: "email", label: "Email", type: "email" }, { name: "phone", label: "Phone", type: "tel" },
    { name: "next_follow_up", label: "Next follow-up", type: "date" }, { name: "source", label: "Source" },
    { name: "notes", label: "Relationship notes", type: "textarea", wide: true },
  ],
  leads: [
    { name: "title", label: "Opportunity name", required: true }, { name: "company_id", label: "Organization", type: "select" },
    { name: "contact_id", label: "Primary contact", type: "select" }, { name: "stage", label: "Stage", type: "select" },
    { name: "source", label: "Lead source" }, { name: "value", label: "Expected value (ZMW)", type: "number" },
    { name: "expected_close", label: "Expected close", type: "date" }, { name: "next_step", label: "Next step" },
    { name: "owner_user_id", label: "Opportunity owner", type: "select" },
    { name: "qualification", label: "Qualification notes", type: "textarea", wide: true },
    { name: "notes", label: "Additional notes", type: "textarea", wide: true },
  ],
  activities: [
    { name: "title", label: "Task or activity", required: true },
    { name: "kind", label: "Type", type: "select", options: ["task", "call", "meeting", "email", "note", "follow_up"].map(value => ({ value, label: titleCase(value) })) },
    { name: "priority", label: "Priority", type: "select", options: ["low", "medium", "high"].map(value => ({ value, label: titleCase(value) })) },
    { name: "owner_user_id", label: "Owner", type: "select" },
    { name: "due_at", label: "Due date", type: "date" }, { name: "company_id", label: "Organization", type: "select" },
    { name: "contact_id", label: "Contact", type: "select" }, { name: "lead_id", label: "Opportunity", type: "select" },
    { name: "project_id", label: "Project", type: "select" }, { name: "details", label: "Details", type: "textarea", wide: true },
  ],
  projects: [
    { name: "name", label: "Engagement name", required: true }, { name: "company_id", label: "Client organization", type: "select" },
    { name: "contact_id", label: "Client contact", type: "select" }, { name: "lead_id", label: "Source opportunity", type: "select" },
    { name: "proposal_id", label: "Accepted proposal", type: "select" },
    { name: "engagement_type", label: "Engagement type" },
    { name: "owner_user_id", label: "Project owner", type: "select" },
    { name: "status", label: "Status", type: "select", options: ["planned", "active", "on_hold", "completed", "cancelled"].map(value => ({ value, label: titleCase(value) })) },
    { name: "start_date", label: "Start date", type: "date" }, { name: "due_date", label: "Target date", type: "date" },
    { name: "description", label: "Scope and summary", type: "textarea", wide: true },
  ],
  milestones: [
    { name: "title", label: "Milestone", required: true }, { name: "due_date", label: "Target date", type: "date" },
    { name: "status", label: "Status", type: "select", options: ["pending", "in_progress", "completed", "blocked"].map(value => ({ value, label: titleCase(value) })) },
    { name: "description", label: "Notes", type: "textarea", wide: true },
  ],
  deliverables: [
    { name: "title", label: "Deliverable", required: true }, { name: "due_date", label: "Due date", type: "date" },
    { name: "milestone_id", label: "Milestone", type: "select" },
    { name: "owner_user_id", label: "Owner", type: "select" },
    { name: "status", label: "Status", type: "select", options: ["not_started", "in_progress", "in_review", "completed"].map(value => ({ value, label: titleCase(value) })) },
    { name: "description", label: "Description", type: "textarea", wide: true },
  ],
  proposals: [
    { name: "title", label: "Proposal title", required: true }, { name: "company_id", label: "Organization", type: "select" },
    { name: "contact_id", label: "Contact", type: "select" }, { name: "lead_id", label: "Opportunity", type: "select" },
    { name: "amount", label: "Proposed value (ZMW)", type: "number" }, { name: "valid_until", label: "Valid until", type: "date" },
    { name: "scope", label: "Scope and assumptions", type: "textarea", wide: true },
  ],
  invoices: [
    { name: "title", label: "Invoice title", required: true }, { name: "company_id", label: "Organization", type: "select" },
    { name: "contact_id", label: "Billing contact", type: "select" }, { name: "project_id", label: "Project", type: "select" },
    { name: "amount", label: "Invoice amount (ZMW)", type: "number", required: true },
    { name: "external_reference", label: "Invoice reference or PaniPay link", type: "url" },
    { name: "due_date", label: "Due date", type: "date" },
  ],
  payments: [
    { name: "amount", label: "Amount received (ZMW)", type: "number", required: true },
    { name: "paid_at", label: "Payment date", type: "date", required: true },
    { name: "method", label: "Payment method", type: "select", options: ["manual", "panipay", "bank_transfer", "cash", "other"].map(value => ({ value, label: titleCase(value) })) },
    { name: "reference", label: "Receipt or transaction reference" },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
};

export function CrmApp() {
  const [module, setModule] = useState<Module>("overview");
  const [context, setContext] = useState<Context | null>(null);
  const [selectedTenant, setSelectedTenant] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [data, setData] = useState<CrmData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState("");
  const [modalParent, setModalParent] = useState<Row | null>(null);
  const [editingRecord, setEditingRecord] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [detailType, setDetailType] = useState<"contact" | "company" | "project" | "lead" | null>(null);
  const [contactMode, setContactMode] = useState("All");
  const [moreOpen, setMoreOpen] = useState(false);
  const [unitForForm, setUnitForForm] = useState("");
  const [selectedProposal, setSelectedProposal] = useState<Row | null>(null);
  const [csvTarget,setCsvTarget]=useState<"contacts"|"leads"|null>(null);

  const suffix = useMemo(() => queryString(selectedTenant || context?.tenant?.id || "", selectedUnit), [selectedTenant, context?.tenant?.id, selectedUnit]);
  const isSuperadmin = context?.role === "superadmin";
  const currentUnit = context?.units.find(unit => unit.id === selectedUnit);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const workContext = await getJson<Context>(`/api/crm/context${selectedTenant ? `?tenantId=${encodeURIComponent(selectedTenant)}` : ""}`);
      setContext(workContext);
      const tenantId = selectedTenant || workContext.tenant?.id || "";
      if (!tenantId || !workContext.tenant) { setData(emptyData); return; }
      if (!selectedTenant) setSelectedTenant(tenantId);
      const path = (resource: string) => `/api/crm/${resource}${queryString(tenantId, selectedUnit)}`;
      const [dashboard, companies, contacts, leads, activities, projects, projectMembers, milestones, deliverables, proposals, documents, invoices, payments, stages, members, reports] = await Promise.all([
        getJson<{ data: Row }>(path("dashboard")),
        getJson<{ data: Row[] }>(path("companies")),
        getJson<{ data: Row[] }>(path("contacts")),
        getJson<{ data: Row[] }>(path("leads")),
        getJson<{ data: Row[] }>(path("activities")),
        getJson<{ data: Row[] }>(path("projects")),
        getJson<{ data: Row[] }>(path("project_members")),
        getJson<{ data: Row[] }>(path("milestones")),
        getJson<{ data: Row[] }>(path("deliverables")),
        getJson<{ data: Row[] }>(path("proposals")),
        getJson<{ data: Row[] }>(path("documents")),
        getJson<{ data: Row[] }>(path("invoices")),
        getJson<{ data: Row[] }>(path("payments")),
        getJson<{ data: Stage[] }>(path("stages")),
        getJson<{ data: Row[] }>(path("members")),
        getJson<{ data: Row }>(path("reports")),
      ]);
      setData({
        dashboard: dashboard.data || null, companies: companies.data || [], contacts: contacts.data || [], leads: leads.data || [],
        activities: activities.data || [], projects: projects.data || [], projectMembers: projectMembers.data || [], milestones: milestones.data || [], deliverables: deliverables.data || [],
        proposals: proposals.data || [], documents: documents.data || [], invoices: invoices.data || [], payments: payments.data || [],
        stages: stages.data || [], members: members.data || [], reports: reports.data || null,
      });
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) { setContext(null); setData(emptyData); }
      else setError(reason instanceof Error ? reason.message : "Unable to load the CRM.");
    } finally { if (showLoading) setLoading(false); }
  }, [selectedTenant, selectedUnit]);

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => {
    const onUnauthorized = () => { setContext(null); setData(emptyData); };
    window.addEventListener("crm:unauthorized", onUnauthorized);
    return () => window.removeEventListener("crm:unauthorized", onUnauthorized);
  }, []);

  const canSeeFinancials = Boolean(isSuperadmin || (selectedUnit ? currentUnit?.can_view_financials === 1 : context?.units.length && context?.units.every(unit => unit.can_view_financials === 1)));
  const queryMatch = <T extends Row>(rows: T[], fields: string[]) => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(row => fields.some(field => String(row[field] || "").toLowerCase().includes(term)));
  };
  const allStages = data.stages.filter(stage => stage.active);
  const stageRows = allStages.map(stage => ({ stage: stage.name, value: data.leads.filter(lead => lead.stage === stage.slug).reduce((sum, lead) => sum + Number(lead.value_minor || 0), 0) / 100, count: data.leads.filter(lead => lead.stage === stage.slug).length }));
  const openPipelineMinor = data.leads.filter(lead => !["won", "lost"].includes(String(lead.stage))).reduce((sum, lead) => sum + Number(lead.value_minor || 0), 0);
  const activeProjects = data.projects.filter(project => ["planned", "active", "on_hold"].includes(String(project.status))).length;
  const dueTasks = data.activities.filter(task => task.status === "open" && task.due_at && new Date(String(task.due_at)).getTime() <= Date.now() + 7 * 86400000).length;
  const outstandingMinor = data.invoices.filter(invoice => ["sent", "overdue"].includes(String(invoice.status))).reduce((sum, invoice) => sum + Math.max(0, Number(invoice.amount_minor || 0) - Number(invoice.paid_minor || 0)), 0);
  const trend = Array.isArray(data.dashboard?.trend) ? data.dashboard.trend as { label: string; value: number }[] : [];

  function openCreate(resource: string, parent?: Row | null) {
    setError(""); setNotice(""); setEditingRecord(null); setUnitForForm(selectedUnit || context?.units[0]?.id || ""); setModal(resource); setModalParent(parent || null);
  }
  function openEdit(resource:string,row:Row) {
    setError("");setNotice("");setModalParent(null);setEditingRecord(row);setUnitForForm(String(row.unit_id||selectedUnit||context?.units[0]?.id||""));setModal(resource);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context?.tenant) return;
    const values = new FormData(event.currentTarget);
    const resource = modal;
    const payload: Record<string, unknown> = { tenantId: context.tenant.id, unitId: unitForForm || selectedUnit || context.units[0]?.id };
    if(editingRecord)payload.id=editingRecord.id;
    if (modalParent?.id && ["milestones", "deliverables"].includes(resource)) payload.project_id = modalParent.id;
    if (modalParent?.id && resource === "payments") payload.invoice_id = modalParent.id;
    if(modalParent?.id&&resource==="activities"){
      if(modalParent.industry!==undefined||modalParent.segment!==undefined)payload.company_id=modalParent.id;
      else if(modalParent.job_title!==undefined||modalParent.email!==undefined){payload.contact_id=modalParent.id;if(modalParent.company_id)payload.company_id=modalParent.company_id;}
      else if(modalParent.name!==undefined)payload.project_id=modalParent.id;
      else if(modalParent.stage!==undefined)payload.lead_id=modalParent.id;
    }
    for (const [key, raw] of values.entries()) {
      if (key === "file" || raw === "") continue;
      if (["value", "amount"].includes(key)) payload[key === "value" ? "value_minor" : "amount_minor"] = Math.round(Number(raw) * 100);
      else payload[key] = raw;
    }
    setBusy(true); setError(""); setNotice("");
    let savedNotice=editingRecord?"Changes saved.":"Saved successfully.";
    try {
      if (resource === "documents") {
        const form = new FormData();
        form.set("tenantId", String(payload.tenantId)); form.set("unitId", String(payload.unitId));
        for (const key of ["company_id", "contact_id", "project_id", "proposal_id", "version_label"]) if (payload[key]) form.set(key, String(payload[key]));
        const file = values.get("file"); if (file instanceof File) form.set("file", file);
        await secureForm(`/api/crm/documents/upload${queryString(context.tenant.id, String(payload.unitId))}`, form);
      } else {
        const suffixForWrite = queryString(context.tenant.id, String(payload.unitId));
        const result=await secureJson<{warnings?:string[]}>(`/api/crm/${resource}${suffixForWrite}`, editingRecord?"PATCH":"POST", payload);
        if(result.warnings?.length)savedNotice=result.warnings.join(" ");
      }
      setModal(""); setModalParent(null); setEditingRecord(null); setNotice(savedNotice); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save this record."); }
    finally { setBusy(false); }
  }
  async function update(resource: string, row: Row, fields: Record<string, unknown>) {
    if (!context?.tenant) return;
    setBusy(true); setError("");
    try { await secureJson(`/api/crm/${resource}${queryString(context.tenant.id, String(row.unit_id || selectedUnit))}`, "PATCH", { id: row.id, ...fields }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update the record."); }
    finally { setBusy(false); }
  }
  async function saveProjectTeam(project:Row,userIds:string[]) {
    if(!context?.tenant)return;
    setBusy(true);setError("");setNotice("");
    try{await secureJson(`/api/crm/project_members${queryString(context.tenant.id,String(project.unit_id||selectedUnit))}`,"POST",{projectId:project.id,userIds});await load();setNotice("Project team updated.");}
    catch(reason){setError(reason instanceof Error?reason.message:"Unable to update the project team.");}
    finally{setBusy(false);}
  }
  async function createEngagementFromProposal(row:Row) {
    if(!context?.tenant)return;
    const unitId=String(row.unit_id||selectedUnit);if(!unitId)return;
    setBusy(true);setError("");
    try{
      await secureJson(`/api/crm/projects${queryString(context.tenant.id,unitId)}`,"POST",{tenantId:context.tenant.id,unitId,proposal_id:row.id,company_id:row.company_id||null,contact_id:row.contact_id||null,lead_id:row.lead_id||null,name:row.title,description:row.scope||"",status:"planned"});
      setNotice("Engagement created from the accepted proposal.");setModule("projects");await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"Unable to create the engagement.");}
    finally{setBusy(false);}
  }
  async function importCsv(file:File,unitId:string) {
    if(!context?.tenant)return;
    setBusy(true);setError("");
    try{
      const form=new FormData();form.set("file",file);
      const result=await secureForm<{imported:number;skipped:number;errors:{line:number;message:string}[]}>(`/api/crm/import/${csvTarget}${queryString(context.tenant.id,unitId)}`,form);
      const firstErrors=result.errors.slice(0,3).map(row=>`Line ${row.line}: ${row.message}`).join(" ");
      setCsvTarget(null);setNotice(`${result.imported} imported; ${result.skipped} skipped.${firstErrors?` ${firstErrors}`:""}`);await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"Unable to import this CSV.");}
    finally{setBusy(false);}
  }
  async function archive(resource: string, row: Row) {
    if (!context?.tenant || !window.confirm(`Archive ${String(row.title || row.name || "this record")}?`)) return;
    setBusy(true); setError("");
    try { await secureJson(`/api/crm/${resource}${queryString(context.tenant.id, String(row.unit_id || selectedUnit))}`, "DELETE", { id: row.id }); await load(); setNotice("Record archived."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to archive the record."); }
    finally { setBusy(false); }
  }
  async function signOut() {
    try { await secureJson("/api/auth/logout", "POST"); } finally { window.location.assign("/crm"); }
  }
  function setActiveModule(next: Module) {
    setModule(next); setSearch(""); setDetail(null); setDetailType(null); setMoreOpen(false);
  }
  function selectedNav(moduleId: Module) { return moduleId === module; }

  if (loading) return <div className="crm-auth-screen"><div className="crm-auth-card"><Brand/><p>Loading your secure workspace…</p><LoaderCircle className="animate-spin" size={22} style={{ color: "var(--blue)" }}/></div></div>;
  if (!context?.user) return <div className="crm-auth-screen"><div className="crm-auth-card"><Brand/><span className="crm-metric-icon tone-blue" style={{ margin: "0 auto 15px" }}><LockKeyhole size={20}/></span><h1>Relationships, connected.</h1><p>Bring Panigale Group contacts, opportunities, projects, and follow-up into one clear workspace. Sign in with your Panigale account to continue.</p><a className="crm-primary" href="/api/auth/login?returnTo=%2Fcrm">Continue with Panigale Auth <ArrowRight size={16}/></a>{error && <p style={{ marginTop: 16, color: "var(--red)" }}>{error}</p>}</div></div>;
  if (context.tenant === null) return <div className="crm-auth-screen"><div className="crm-auth-card"><Brand/><span className="crm-metric-icon tone-gold" style={{ margin: "0 auto 15px" }}><ShieldCheck size={20}/></span><h1>Access is not assigned yet</h1><p>Your Panigale identity is verified, but no CRM workspace has granted access to this account. Ask a CRM administrator to assign your business units.</p><button className="crm-secondary" onClick={() => void signOut()}><LogOut size={15}/>Sign out</button></div></div>;

  const pageTitles: Record<Module, [string, string]> = {
    overview: ["Overview", "Your relationship workspace at a glance."],
    contacts: ["Contacts", "Manage organizations and people, and keep every relationship moving."],
    pipeline: ["Opportunities", "Track and move deals through your sales pipeline."],
    projects: ["Projects", "Coordinate engagement delivery, milestones, and client outcomes."],
    tasks: ["Tasks", "Keep calls, meetings, and next steps on track."],
    proposals: ["Proposals", "Create, share, and track scopes and quotations."],
    documents: ["Documents", "Keep client and project files organized with unit scoped access."],
    invoices: ["Invoices", "Track receivables and record payments alongside your work."],
    reports: ["Reports", "Understand pipeline, delivery, and collection performance."],
    access: ["Team access", "Manage who can see each business unit."],
  };
  const [pageTitle, pageSubtitle] = pageTitles[module];
  const mainAction = module === "contacts" ? ["companies", "Add organization"] : module === "pipeline" ? ["leads", "New opportunity"] : module === "projects" ? ["projects", "New project"] : module === "tasks" ? ["activities", "Add task"] : module === "proposals" ? ["proposals", "New proposal"] : module === "invoices" ? ["invoices", "New invoice"] : null;
  const searchPlaceholder = module === "contacts" ? "Search people and organizations..." : module === "pipeline" ? "Search opportunities..." : `Search ${pageTitle.toLowerCase()}...`;

  const fieldsFor = (resource: string): Field[] => {
    const companyOptions = data.companies.map(company => ({ value: company.id, label: String(company.name) }));
    const contactOptions = data.contacts.map(contact => ({ value: contact.id, label: `${contact.name}${contact.company_name ? ` · ${contact.company_name}` : ""}` }));
    const leadOptions = data.leads.map(lead => ({ value: lead.id, label: String(lead.title) }));
    const proposalOptions = data.proposals.map(proposal => ({ value: proposal.id, label: String(proposal.title) }));
    const projectOptions = data.projects.map(project => ({ value: project.id, label: String(project.name) }));
    const stageOptions = allStages.map(stage => ({ value: stage.slug, label: stage.name }));
    const membersOptions = data.members.map(member => ({ value: String(member.user_id || member.id), label: String(member.name || member.email || "Team member") }));
    const milestoneOptions = data.milestones.filter(item => item.project_id === modalParent?.id).map(item => ({ value: item.id, label: String(item.title) }));
    return (baseFields[resource] || []).map(field => {
      if (field.name === "company_id") return { ...field, options: companyOptions };
      if (field.name === "contact_id") return { ...field, options: contactOptions };
      if (field.name === "lead_id") return { ...field, options: leadOptions };
      if (field.name === "proposal_id") return { ...field, options: proposalOptions };
      if (field.name === "project_id") return { ...field, options: projectOptions };
      if (field.name === "stage") return { ...field, options: stageOptions };
      if (field.name === "owner_user_id") return { ...field, options: membersOptions };
      if (field.name === "milestone_id") return { ...field, options: milestoneOptions };
      return field;
    });
  };

  const visibleContacts = queryMatch(data.contacts, ["name", "company_name", "job_title", "email", "phone"]);
  const visibleCompanies = queryMatch(data.companies, ["name", "industry", "segment", "website"]);
  const shownContacts = contactMode === "Organizations" ? visibleCompanies : contactMode === "People" ? visibleContacts : [...visibleCompanies, ...visibleContacts];
  const visibleLeads = queryMatch(data.leads, ["title", "company_name", "contact_name", "source", "next_step"]);
  const visibleProjects = queryMatch(data.projects, ["name", "company_name", "description", "owner_name"]);
  const visibleTasks = queryMatch(data.activities, ["title", "details", "company_name", "contact_name", "kind"]);
  const visibleProposals = queryMatch(data.proposals, ["title", "company_name", "contact_name", "status"]);
  const visibleDocuments = queryMatch(data.documents, ["filename", "company_name", "project_name", "content_type"]);
  const visibleInvoices = queryMatch(data.invoices, ["title", "company_name", "external_reference", "status"]);

  return <div className="crm-shell">
    <aside className="crm-sidebar">
      <Brand/>
      <nav className="crm-nav" aria-label="CRM sections">{nav.filter(item => item.id !== "access" || isSuperadmin).map(item => { const Icon = item.icon; return <button key={item.id} className={`crm-nav-button ${selectedNav(item.id) ? "active" : ""}`} onClick={() => setActiveModule(item.id)}><Icon/><span>{item.label}</span>{item.id === "tasks" && dueTasks > 0 && <span className="crm-pill gold" style={{ marginLeft: "auto" }}>{dueTasks}</span>}</button>; })}</nav>
      <div className="crm-sidebar-bottom"><button className="crm-nav-button" onClick={() => void signOut()}><LogOut/><span>Sign out</span></button><div className="crm-unit-mini"><span className="crm-avatar">{initials(context.user.name)}</span><span style={{ minWidth: 0 }}><strong style={{ display: "block", overflow: "hidden", maxWidth: 155, textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{context.user.name}</strong><small style={{ color: "#a8bad2", fontSize: 10 }}>{context.tenant.name}</small></span><ChevronDown size={14} style={{ marginLeft: "auto" }}/></div></div>
    </aside>

    <div className="crm-main">
      <header className="crm-topbar">
        <div className="crm-select-wrap"><span>Workspace</span><select aria-label="Workspace" value={context.tenant.id} onChange={event => { setSelectedTenant(event.target.value); setSelectedUnit(""); }} disabled={context.memberships.length < 2}>{context.memberships.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></div>
        <div className="crm-top-separator"/>
        <div className="crm-select-wrap"><span>Business unit</span><select aria-label="Business unit" value={selectedUnit} onChange={event => setSelectedUnit(event.target.value)}><option value="">All my units</option>{context.units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></div>
        <div className="crm-top-separator"/>
        <label className="crm-search"><Search size={17}/><input aria-label="Search CRM" placeholder={searchPlaceholder} value={search} onChange={event => setSearch(event.target.value)}/><span style={{ color: "#9ba6b8", fontSize: 10 }}>⌘ K</span></label>
        <button className="crm-icon-button" title="Recent activity" onClick={() => setActiveModule("tasks")}><Bell size={18}/></button>
        <div className="crm-account"><span className="crm-avatar">{initials(context.user.name)}</span><span className="crm-account-copy"><strong style={{ fontSize: 12 }}>{context.user.name}</strong><small style={{ color: "var(--muted)", fontSize: 10 }}>{currentUnit?.name || "Panigale Group"}</small></span><ChevronDown size={14}/></div>
      </header>

      <main className="crm-content">
        {error && <div role="alert" className="crm-alert" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>{error}<button aria-label="Dismiss" onClick={() => setError("")}><X size={15}/></button></div>}
        {notice && <div role="status" className="crm-notice" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>{notice}<button aria-label="Dismiss" onClick={() => setNotice("")}><X size={15}/></button></div>}
        <div className="crm-page-head"><div><p className="crm-eyebrow">{currentUnit?.name || "Panigale Group"}</p><h1>{module === "overview" ? `Good morning, ${context.user.name.split(" ")[0]}` : pageTitle}</h1><p>{module === "overview" ? "Here’s what’s happening across your customer relationships today." : pageSubtitle}</p></div>{mainAction && <button className="crm-primary" onClick={() => openCreate(mainAction[0])}><Plus size={17}/>{mainAction[1]}</button>}</div>

        {module === "overview" && <OverviewView data={data} stageRows={stageRows} trend={trend} pipeline={openPipelineMinor} activeProjects={activeProjects} dueTasks={dueTasks} outstanding={outstandingMinor} canSeeFinancials={canSeeFinancials} onNavigate={setActiveModule} onSelectTask={() => setActiveModule("tasks")}/>}
        {module === "contacts" && <ContactsView mode={contactMode} setMode={setContactMode} companies={visibleCompanies} contacts={visibleContacts} rows={shownContacts} allCompanies={data.companies.length} onCreate={openCreate} onImportCsv={()=>setCsvTarget("contacts")} onSelect={(row, kind) => { setDetail(row); setDetailType(kind); }} search={search}/>}
        {module === "pipeline" && <PipelineView leads={visibleLeads} stages={allStages} canSeeFinancials={canSeeFinancials} onCreate={() => openCreate("leads")} onImportCsv={()=>setCsvTarget("leads")} onEdit={row=>openEdit("leads",row)} onUpdate={(row, stage) => void update("leads", row, { stage })} onSelect={row => { setDetail(row); setDetailType("lead"); }} busy={busy}/>}
        {module === "projects" && <ProjectsView projects={visibleProjects} projectMembers={data.projectMembers} members={data.members} canManageTeam={isSuperadmin||context.role==="unit_manager"} busy={busy} onSaveTeam={saveProjectTeam} milestones={data.milestones} deliverables={data.deliverables} activities={data.activities} selected={detailType === "project" ? detail : null} onSelect={row => { setDetail(row); setDetailType("project"); }} onClear={() => { setDetail(null); setDetailType(null); }} onCreate={openCreate} onEdit={row=>openEdit("projects",row)} onUpdate={(row, status) => void update("projects", row, { status })} onMilestoneStatus={(row,status)=>void update("milestones",row,{status})} onDeliverableStatus={(row,status)=>void update("deliverables",row,{status})}/>}
        {module === "tasks" && <TasksView tasks={visibleTasks} onCreate={() => openCreate("activities")} onEdit={row=>openEdit("activities",row)} onUpdate={(row, status) => void update("activities", row, { status })} onArchive={row => void archive("activities", row)} busy={busy}/>}
        {module === "proposals" && <ProposalsView proposals={visibleProposals} convertedProposalIds={data.projects.map(project=>String(project.proposal_id||""))} onCreate={() => openCreate("proposals")} onEdit={row=>openEdit("proposals",row)} onConvert={row=>void createEngagementFromProposal(row)} onUpdate={(row, status) => void update("proposals", row, { status })} onPrint={row => setSelectedProposal(row)} busy={busy}/>}
        {module === "documents" && <DocumentsView documents={visibleDocuments} companies={data.companies} projects={data.projects} onCreate={() => openCreate("documents")} onDownload={async row => { try { window.open(`/api/crm/documents/${encodeURIComponent(row.id)}/download${queryString(context.tenant!.id, String(row.unit_id || selectedUnit))}`, "_blank", "noopener,noreferrer"); } catch { setError("Unable to open this file."); } }} onArchive={row => void archive("documents", row)}/>}
        {module === "invoices" && <InvoicesView invoices={visibleInvoices} payments={data.payments} financialUnitIds={context.units.filter(unit=>isSuperadmin||unit.can_view_financials===1).map(unit=>unit.id)} canSeeFinancials={canSeeFinancials} onCreate={() => openCreate("invoices")} onEdit={row=>openEdit("invoices",row)} onPay={row => openCreate("payments", row)} onUpdate={(row, status) => void update("invoices", row, { status })} busy={busy}/>}
        {module === "reports" && <ReportsView data={data} stageRows={stageRows} canSeeFinancials={canSeeFinancials}/>}
        {module === "access" && <AccessView context={context} data={data} onGrant={async (event, role, units, financialUnits) => { event.preventDefault(); const values = new FormData(event.currentTarget); if (!context.tenant) return; setBusy(true); try { await secureJson(`/api/crm/members${queryString(context.tenant.id, "")}`, "POST", { email: values.get("email"), role, unitIds: units, financialUnitIds: financialUnits }); await load(); setNotice("Team access updated."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to grant access."); } finally { setBusy(false); } }} onRevoke={async row => { if (!context.tenant || !window.confirm(`Revoke CRM access for ${row.email}?`)) return; setBusy(true); try { await secureJson(`/api/crm/members${queryString(context.tenant.id, "")}`, "DELETE", { userId: row.user_id }); await load(); setNotice("CRM access revoked."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to revoke access."); } finally { setBusy(false); } }} busy={busy}/>}
      </main>
    </div>

    <nav className="crm-bottom-nav" aria-label="Mobile CRM sections">{(["overview", "contacts", "pipeline", "tasks"] as Module[]).map(id => { const item = nav.find(entry => entry.id === id)!; const Icon = item.icon; return <button key={id} className={`crm-bottom-button ${module === id ? "active" : ""}`} onClick={() => setActiveModule(id)}><Icon/><span>{id === "overview" ? "Home" : item.label}</span></button>; })}<button className={`crm-bottom-button ${moreOpen ? "active" : ""}`} onClick={() => setMoreOpen(true)}><MoreHorizontal/><span>More</span></button></nav>
    {moreOpen && <div className="crm-mobile-more" onClick={() => setMoreOpen(false)}><section className="crm-mobile-more-panel" onClick={event => event.stopPropagation()}><div className="crm-card-head"><div><h2>More from your workspace</h2><p>{context.tenant.name} · {currentUnit?.name || "All units"}</p></div><button className="crm-icon-button" onClick={() => setMoreOpen(false)}><X size={17}/></button></div><nav>{nav.filter(item => !["overview", "contacts", "pipeline", "tasks", "access"].includes(item.id)).concat(isSuperadmin ? [nav.find(item => item.id === "access")!] : []).map(item => { const Icon = item.icon; return <button key={item.id} className={module === item.id ? "active" : ""} onClick={() => setActiveModule(item.id)}><Icon size={20}/>{item.label}</button>; })}</nav><button className="crm-secondary" style={{ width: "100%", marginTop: 13 }} onClick={() => void signOut()}><LogOut size={15}/>Sign out</button></section></div>}

    {detail && detailType === "contact" && <ContactDrawer row={detail} activities={data.activities} companies={data.companies} onEdit={row=>openEdit("contacts",row)} onFollowUp={row=>openCreate("activities",row)} mobileClose={() => { setDetail(null); setDetailType(null); }}/>}
    {detail && detailType === "company" && <CompanyDrawer row={detail} contacts={data.contacts} leads={data.leads} activities={data.activities} onEdit={row=>openEdit("companies",row)} onFollowUp={row=>openCreate("activities",row)} mobileClose={() => { setDetail(null); setDetailType(null); }}/>}
    {detail && detailType === "lead" && <LeadDrawer row={detail} canSeeFinancials={canSeeFinancials} onEdit={row=>openEdit("leads",row)} mobileClose={() => { setDetail(null); setDetailType(null); }}/>}
    {modal && <RecordModal resource={modal} parent={modalParent} record={editingRecord} fields={fieldsFor(modal)} units={context.units} fixedUnit={editingRecord?String(editingRecord.unit_id||""):selectedUnit} unitForForm={unitForForm} setUnitForForm={setUnitForForm} busy={busy} error={error} onClose={() => { setModal(""); setModalParent(null); setEditingRecord(null); }} onSubmit={save}/>}
    {selectedProposal && <ProposalPrint proposal={selectedProposal} company={data.companies.find(company => company.id === selectedProposal.company_id)} unit={currentUnit} onClose={() => setSelectedProposal(null)}/>}
    {csvTarget&&<ImportCsvModal resource={csvTarget} units={context.units} defaultUnit={selectedUnit||context.units[0]?.id||""} busy={busy} error={error} onClose={()=>{setCsvTarget(null);setError("");}} onImport={importCsv}/>}
  </div>;
}

function OverviewView({ data, stageRows, trend, pipeline, activeProjects, dueTasks, outstanding, canSeeFinancials, onNavigate, onSelectTask }: { data: typeof emptyData; stageRows: { stage: string; value: number; count: number }[]; trend: { label: string; value: number }[]; pipeline: number; activeProjects: number; dueTasks: number; outstanding: number; canSeeFinancials: boolean; onNavigate: (id: Module) => void; onSelectTask: (row: Row) => void }) {
  const metrics = [
    { label: "Open pipeline", value: canSeeFinancials ? money(pipeline) : "Restricted", note: `${data.leads.filter(row => !["won", "lost"].includes(String(row.stage))).length} active opportunities`, icon: TrendingUp, tone: "blue" },
    { label: "Active engagements", value: String(activeProjects), note: `${data.projects.filter(row => row.status === "active").length} in delivery`, icon: Users, tone: "green" },
    { label: "Tasks due", value: String(dueTasks), note: `${data.activities.filter(row => row.status === "open" && String(row.due_at || "").slice(0,10) < new Date().toISOString().slice(0,10)).length} overdue`, icon: CheckSquare2, tone: "gold" },
    { label: "Outstanding invoices", value: canSeeFinancials ? money(outstanding) : "Restricted", note: canSeeFinancials ? `${data.invoices.filter(row => ["sent", "overdue"].includes(String(row.status))).length} awaiting payment` : "Unit access limits financials", icon: CircleDollarSign, tone: "violet" },
  ];
  const recent = [...data.activities].sort((a,b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0,4);
  const tasks = data.activities.filter(row => row.status === "open").sort((a,b) => String(a.due_at || "").localeCompare(String(b.due_at || ""))).slice(0,5);
  const pieData = (canSeeFinancials ? stageRows.filter(row => row.value > 0) : stageRows.filter(row => row.count > 0).map(row => ({ ...row, value: row.count })));
  return <div className="crm-grid" style={{ gap: 18 }}>
    <section className="crm-grid crm-grid-4">{metrics.map(item => { const Icon = item.icon; return <article className="crm-card crm-metric" key={item.label}><div><span className="crm-metric-label">{item.label}</span><div className="crm-metric-value">{item.value}</div><div className="crm-metric-note">{item.note}</div></div><span className={`crm-metric-icon tone-${item.tone}`}><Icon size={19}/></span></article>; })}</section>
    <section className="crm-grid crm-grid-2">
      <article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>Pipeline value trend</h2><p>Open opportunity value over time</p></div><select className="crm-filter" aria-label="Pipeline chart period"><option>Last 30 days</option><option>Last 90 days</option><option>This year</option></select></div><div className="crm-chart-box">{trend.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}><defs><linearGradient id="crmTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0876f9" stopOpacity={.22}/><stop offset="95%" stopColor="#0876f9" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e8edf4" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#8290a7", fontSize: 10 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#8290a7", fontSize: 10 }} tickFormatter={value => `${Number(value)/1000000}m`}/><Tooltip formatter={(value) => money(value)}/><Area type="monotone" dataKey="value" stroke="#0876f9" strokeWidth={3} fill="url(#crmTrend)"/></AreaChart></ResponsiveContainer> : <EmptyState icon={TrendingUp} title="Your pipeline will appear here" detail="Add an opportunity to start tracking expected value and stage movement."/>}</div></article>
      <article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>Pipeline by stage</h2><p>{canSeeFinancials?"Where active opportunity value stands":"Opportunity counts · financial values restricted"}</p></div><button className="crm-panel-link" onClick={() => onNavigate("pipeline")}>View pipeline <ArrowRight size={14}/></button></div><div className="crm-overview-pipeline-breakdown">{pieData.length ? <><div style={{ width: "100%", height: 190 }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} dataKey="value" nameKey="stage" innerRadius="62%" outerRadius="88%" paddingAngle={3} stroke="none">{pieData.map((item,index) => <Cell key={item.stage} fill={CHART_COLORS[index % CHART_COLORS.length]}/>)}</Pie><Tooltip formatter={(value) => canSeeFinancials?money(Number(value)*100):`${value} opportunities`}/></PieChart></ResponsiveContainer></div><div style={{ display: "grid", gap: 11 }}>{pieData.slice(0,5).map((item,index) => <div key={item.stage} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}><i style={{ width: 8, height: 8, borderRadius: 99, background: CHART_COLORS[index % CHART_COLORS.length] }}/><span style={{ flex: 1, color: "#53637c" }}>{item.stage}</span><strong>{canSeeFinancials?money(item.value * 100):`${item.count} deals`}</strong></div>)}</div></> : <div style={{ gridColumn: "1/-1" }}><EmptyState icon={Target} title="No active deals yet" detail="Add your first opportunity to see a stage breakdown."/></div>}</div></article>
    </section>
    <section className="crm-grid crm-grid-2"><article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>Recent activity</h2><p>Keep up with the latest relationship updates</p></div><button className="crm-panel-link" onClick={() => onNavigate("tasks")}>View all <ArrowRight size={14}/></button></div><div className="crm-activity-list">{recent.length ? recent.map((row,index) => <div className="crm-activity-row" key={row.id}><span className={`crm-activity-icon tone-${["green","blue","gold","violet"][index%4]}`}><Activity size={16}/></span><div className="crm-activity-text"><strong>{row.title}</strong><span>{row.company_name || row.contact_name || row.project_name || titleCase(row.kind)} · {String(row.details || "Activity recorded").slice(0,92)}</span></div><span className="crm-activity-time">{fmtDate(row.created_at)}</span></div>) : <EmptyState icon={Activity} title="No activity yet" detail="Calls, meetings, notes, and updates will show here."/>}</div></article><article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>My tasks</h2><p>Follow-ups and next actions</p></div><button className="crm-panel-link" onClick={() => onNavigate("tasks")}>View all <ArrowRight size={14}/></button></div><div className="crm-task-list">{tasks.length ? tasks.map(row => <button className="crm-list-row" key={row.id} onClick={() => onSelectTask(row)} style={{ width: "100%", border: 0, borderTop: "1px solid #edf0f5", background: "transparent", textAlign: "left" }}><span className="crm-metric-icon tone-gold" style={{ width: 32, height: 32 }}><CalendarDays size={15}/></span><span className="crm-list-content"><strong>{row.title}</strong><span>{row.company_name || row.contact_name || row.project_name || titleCase(row.kind)} · {fmtDate(row.due_at)}</span></span><Pill value={row.priority || "medium"}/></button>) : <EmptyState icon={CheckSquare2} title="Clear day" detail="No open tasks. You can add a reminder or follow-up."/>}</div></article></section>
    <article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>Work across the Group</h2><p>Open a product platform when work needs its specialist tools.</p></div><span className="crm-pill blue"><ExternalLink size={12}/>Connected platforms</span></div><div className="crm-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 9, marginTop: 15 }}>{data.dashboard?.ventures && Array.isArray(data.dashboard.ventures) ? (data.dashboard.ventures as Row[]).map(venture => <a className="crm-list-row" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, textDecoration: "none" }} key={String(venture.name)} href={String(venture.website || "#")} target="_blank" rel="noreferrer"><span className="crm-metric-icon tone-blue" style={{ width: 34, height: 34 }}><Building2 size={16}/></span><span className="crm-list-content"><strong>{venture.name}</strong><span>{venture.category}</span></span><ExternalLink size={14} color="#8090a8"/></a>) : <div style={{ color: "var(--muted)", fontSize: 12 }}>Select a business unit to see its product connection.</div>}</div></article>
  </div>;
}

function ContactsView({ mode, setMode, companies, contacts, rows, allCompanies, onCreate, onImportCsv, onSelect, search }: { mode: string; setMode: (value:string)=>void; companies: Row[]; contacts: Row[]; rows: Row[]; allCompanies: number; onCreate: (resource:string)=>void; onImportCsv:()=>void; onSelect: (row:Row,type:"company"|"contact")=>void; search:string }) {
  const [relationship,setRelationship]=useState("any");
  const [owner,setOwner]=useState("any");
  const [activity,setActivity]=useState("any");
  const owners=[...new Set(rows.map(row=>String(row.owner_name||"")).filter(Boolean))].sort();
  const today=new Date().toISOString().slice(0,10);
  const filteredRows=rows.filter(row=>{
    if(relationship!=="any"&&row.status!==relationship)return false;
    if(owner!=="any"&&row.owner_name!==owner)return false;
    const lastActivity=String(row.last_activity_at||row.updated_at||"").slice(0,10);
    if(activity==="follow_up"&&(!row.next_follow_up||String(row.next_follow_up).slice(0,10)>today))return false;
    if(activity==="recent"&&(!lastActivity||lastActivity<new Date(Date.now()-30*86400000).toISOString().slice(0,10)))return false;
    return true;
  });
  const counts = [{ label: "Organizations", value: allCompanies, tone: "blue", icon: Building2 }, { label: "People", value: contacts.length, tone: "green", icon: Users }, { label: "Clients", value: contacts.filter(row=>row.status==="client").length, tone: "violet", icon: Handshake }, { label: "Need follow-up", value: contacts.filter(row=>row.next_follow_up && String(row.next_follow_up).slice(0,10)<=new Date().toISOString().slice(0,10)).length, tone: "gold", icon: Clock3 }];
  return <div className="crm-grid" style={{ gap: 14 }}><div className="crm-grid crm-grid-4">{counts.map(item=>{const Icon=item.icon;return <article className="crm-card crm-metric" key={item.label} style={{ minHeight: 90, padding: 14 }}><div><span className="crm-metric-label">{item.label}</span><div className="crm-metric-value" style={{ marginTop: 8 }}>{item.value}</div></div><span className={`crm-metric-icon tone-${item.tone}`}><Icon size={18}/></span></article>;})}</div><section className="crm-card crm-card-pad"><div className="crm-tabs">{["All", "Organizations", "People"].map(label=><button key={label} className={`crm-tab ${mode===label?"active":""}`} onClick={()=>setMode(label)}>{label}{label==="Organizations"?` (${allCompanies})`:label==="People"?` (${contacts.length})`:""}</button>)}</div><div className="crm-toolbar"><button className="crm-filter" onClick={()=>{setRelationship("any");setOwner("any");setActivity("any");}}><Filter size={14}/> Clear filters</button><select className="crm-filter" aria-label="Relationship filter" value={relationship} onChange={event=>setRelationship(event.target.value)}><option value="any">Relationship: Any</option>{["lead","prospect","client","partner","inactive"].map(value=><option key={value} value={value}>{titleCase(value)}</option>)}</select><select className="crm-filter" aria-label="Contact owner filter" value={owner} onChange={event=>setOwner(event.target.value)}><option value="any">Owner: Any</option>{owners.map(value=><option key={value} value={value}>{value}</option>)}</select><select className="crm-filter" aria-label="Activity date filter" value={activity} onChange={event=>setActivity(event.target.value)}><option value="any">Activity: Any time</option><option value="recent">Last 30 days</option><option value="follow_up">Needs follow-up</option></select><button className="crm-secondary crm-button-small" onClick={onImportCsv}><Download size={13}/>Import contacts CSV</button><span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 10 }}>{filteredRows.length} results</span></div>{filteredRows.length ? <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Name</th><th>Organization / details</th><th>Relationship</th><th>Owner</th><th>Last activity</th><th>Next follow-up</th></tr></thead><tbody>{filteredRows.map(row=>{const company=Boolean(row.industry!==undefined || row.segment!==undefined);return <tr key={`${company?"co":"person"}-${row.id}`} onClick={()=>onSelect(row,company?"company":"contact")}><td><span className="crm-primary-cell"><span className="crm-avatar" style={{ width: 30, height: 30 }}>{initials(row.name)}</span><span>{row.name}</span></span></td><td>{company?[row.industry,row.segment].filter(Boolean).join(" · ")||row.website:row.company_name||row.job_title||row.email||"—"}</td><td><Pill value={row.status}/></td><td>{row.owner_name||"—"}</td><td>{fmtDate(row.last_activity_at||row.updated_at)}</td><td>{fmtDate(row.next_follow_up)}</td></tr>;})}</tbody></table></div> : <EmptyState icon={ContactRound} title={search?"No matching contacts":"Start with a relationship"} detail="Add an organization or contact. Each record stays private to the selected business unit." action={<button className="crm-primary" onClick={()=>onCreate("companies")}><Plus size={15}/>Add organization</button>}/>}</section></div>;
}

function PipelineView({ leads, stages, canSeeFinancials, onCreate, onImportCsv, onEdit, onUpdate, onSelect, busy }: { leads: Row[]; stages: Stage[]; canSeeFinancials:boolean; onCreate:()=>void; onImportCsv:()=>void; onEdit:(row:Row)=>void; onUpdate:(row:Row,stage:string)=>void; onSelect:(row:Row)=>void; busy:boolean }) {
  const [ownerFilter,setOwnerFilter]=useState("any");
  const [dateFilter,setDateFilter]=useState("any");
  const [sourceFilter,setSourceFilter]=useState("any");
  const today=new Date().toISOString().slice(0,10);
  const owners=[...new Set(leads.map(row=>String(row.owner_name||"")).filter(Boolean))].sort();
  const sources=[...new Set(leads.map(row=>String(row.source||"")).filter(Boolean))].sort();
  const filteredLeads=leads.filter(row=>{
    if(ownerFilter!=="any"&&row.owner_name!==ownerFilter)return false;
    if(sourceFilter!=="any"&&row.source!==sourceFilter)return false;
    const close=String(row.expected_close||"").slice(0,10);
    if(dateFilter==="overdue"&&(!close||close>=today||["won","lost"].includes(String(row.stage))))return false;
    if(dateFilter==="next30"&&(!close||close<today||close>new Date(Date.now()+30*86400000).toISOString().slice(0,10)))return false;
    if(dateFilter==="thismonth"&&(!close||close.slice(0,7)!==today.slice(0,7)))return false;
    return true;
  });
  const visibleStages = stages.filter(stage=>!stage.is_lost);
  return <div className="crm-grid" style={{ gap: 15 }}><div className="crm-toolbar"><select className="crm-filter" aria-label="Opportunity owner filter" value={ownerFilter} onChange={event=>setOwnerFilter(event.target.value)}><option value="any">Owner: Any</option>{owners.map(value=><option key={value} value={value}>{value}</option>)}</select><select className="crm-filter" aria-label="Expected close filter" value={dateFilter} onChange={event=>setDateFilter(event.target.value)}><option value="any">Expected close: Any time</option><option value="next30">Next 30 days</option><option value="thismonth">This month</option><option value="overdue">Past due</option></select><select className="crm-filter" aria-label="Opportunity source filter" value={sourceFilter} onChange={event=>setSourceFilter(event.target.value)}><option value="any">Source: All</option>{sources.map(value=><option key={value} value={value}>{value}</option>)}</select><button className="crm-secondary crm-button-small" onClick={onImportCsv}><Download size={13}/>Import CSV</button><span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11 }}>Pipeline value <strong style={{ color: "var(--ink)" }}>{canSeeFinancials?money(leads.filter(row=>!visibleStages.find(s=>s.slug===row.stage)?.is_won).reduce((sum,row)=>sum+Number(row.value_minor||0),0)):"Restricted"}</strong></span></div>{visibleStages.length ? <div className="crm-kanban">{visibleStages.map((stage,index)=>{const rows=filteredLeads.filter(row=>row.stage===stage.slug);const total=rows.reduce((sum,row)=>sum+Number(row.value_minor||0),0);return <section className="crm-kanban-column" key={stage.id}><div className="crm-kanban-head"><div><h3>{stage.name}</h3><p>{rows.length} opportunities · {canSeeFinancials?money(total):"Restricted"}</p></div><span className={`crm-pill ${["blue","violet","gold","red","green"][index%5]}`}>{rows.length}</span></div>{rows.map(row=><article className="crm-deal-card" key={row.id}><button onClick={()=>onSelect(row)} style={{ width:"100%", border:0, padding:0, background:"transparent", textAlign:"left" }}><strong>{row.company_name || row.title}</strong><p>{row.title}</p><div className="crm-deal-foot"><span>{canSeeFinancials?money(row.value_minor):"Restricted"}</span><span className="crm-avatar" style={{ width:27,height:27,fontSize:9 }}>{initials(row.owner_name)}</span></div><p style={{ margin:"9px 0 0" }}><CalendarDays size={12} style={{ verticalAlign:"-2px",marginRight:5 }}/>{fmtDate(row.expected_close)}</p></button><button className="crm-ghost crm-button-small" style={{marginTop:7}} onClick={()=>onEdit(row)}><Pencil size={13}/>Edit opportunity</button><select className="crm-board-select" aria-label={`Move ${row.title}`} disabled={busy} value={String(row.stage)} onChange={event=>onUpdate(row,event.target.value)}>{stages.map(option=><option key={option.id} value={option.slug}>{option.name}</option>)}</select></article>)}{!rows.length&&<button onClick={onCreate} className="crm-empty" style={{ width:"100%",minHeight:120,border:"1px dashed #cdd7e6",borderRadius:10,background:"transparent",fontSize:11 }}>No opportunities yet<br/>Add one</button>}</section>;})}</div> : <EmptyState icon={Target} title="Set up your pipeline" detail="Add stages and opportunities to follow deals from discovery to decision." action={<button className="crm-primary" onClick={onCreate}><Plus size={15}/>New opportunity</button>}/>}</div>;
}

function ProjectsView({ projects, projectMembers, members, canManageTeam, busy, onSaveTeam, milestones, deliverables, activities, selected, onSelect, onClear, onCreate, onEdit, onUpdate, onMilestoneStatus, onDeliverableStatus }: { projects: Row[]; projectMembers:Row[]; members:Row[]; canManageTeam:boolean; busy:boolean; onSaveTeam:(project:Row,userIds:string[])=>Promise<void>; milestones: Row[]; deliverables: Row[]; activities: Row[]; selected: Row | null; onSelect:(row:Row)=>void; onClear:()=>void; onCreate:(resource:string,parent?:Row|null)=>void; onEdit:(row:Row)=>void; onUpdate:(row:Row,status:string)=>void; onMilestoneStatus:(row:Row,status:string)=>void; onDeliverableStatus:(row:Row,status:string)=>void }) {
  const assigned=selected?projectMembers.filter(row=>row.project_id===selected.id):[];
  const assignedKey=assigned.map(row=>String(row.user_id)).sort().join(",");
  const [teamOpen,setTeamOpen]=useState(false);
  const [teamIds,setTeamIds]=useState<string[]>([]);
  useEffect(()=>{setTeamIds(assignedKey?assignedKey.split(","):[]);setTeamOpen(false);},[selected?.id,assignedKey]);
  const selectedUnitId=String(selected?.unit_id||"");
  const teammates=members.filter(member=>String(member.unit_ids||"").split(",").includes(selectedUnitId));
  if (selected) {
    const projectMilestones=milestones.filter(row=>row.project_id===selected.id).sort((a,b)=>Number(a.position||0)-Number(b.position||0));
    const projectDeliverables=deliverables.filter(row=>row.project_id===selected.id);
    const projectActivity=activities.filter(row=>row.project_id===selected.id).slice(0,5);
    const done=projectMilestones.filter(row=>row.status==="completed").length;
    const progress=Number(selected.progress ?? (projectMilestones.length?Math.round(done/projectMilestones.length*100):0));
    return <div className="crm-grid" style={{ gap: 15 }}><button className="crm-ghost crm-no-print" style={{ justifySelf:"start",paddingLeft:0 }} onClick={onClear}><ArrowDownRight size={15} style={{ transform:"rotate(90deg)" }}/>Projects</button><div className="crm-page-head" style={{ alignItems:"center",marginBottom:0 }}><div><p className="crm-eyebrow">{selected.company_name || "Engagement"} · {selected.engagement_type || "Project"}</p><h1>{selected.name}</h1></div><div style={{ display:"flex",gap:8,alignItems:"center" }}><Pill value={selected.status}/><button className="crm-secondary crm-no-print" onClick={()=>onEdit(selected)}><Pencil size={14}/>Edit project</button><button className="crm-secondary crm-no-print" onClick={()=>onCreate("activities",selected)}><Plus size={14}/>Add task</button></div></div><section className="crm-card crm-card-pad"><div className="crm-project-summary"><div><span className="crm-metric-label">Project owner</span><div className="crm-primary-cell" style={{ marginTop:8 }}><span className="crm-avatar">{initials(selected.owner_name)}</span><strong>{selected.owner_name||"Assign an owner"}</strong></div></div><div><span className="crm-metric-label">Client contact</span><div style={{ marginTop:12,fontWeight:650 }}>{selected.contact_name||"Add contact"}</div></div><div><span className="crm-metric-label">Start date</span><div style={{ marginTop:12,fontWeight:650 }}>{fmtDate(selected.start_date)}</div></div><div><span className="crm-metric-label">Target date</span><div style={{ marginTop:12,fontWeight:650 }}>{fmtDate(selected.due_date)}</div></div></div><div className="crm-list-row" style={{marginTop:8}}><Users size={17} color="#0876f9"/><span className="crm-list-content"><strong>Project team</strong><span>{assigned.length?assigned.map(row=>String(row.user_name||"Teammate")).join(", "):"No consultants assigned"}</span></span><div style={{display:"flex",alignItems:"center",gap:5}}>{assigned.slice(0,4).map(row=><span className="crm-avatar" key={row.id} title={String(row.user_name||"")} style={{width:28,height:28}}>{initials(row.user_name)}</span>)}{assigned.length>4&&<span className="crm-pill blue">+{assigned.length-4}</span>}</div>{canManageTeam&&<button className="crm-secondary crm-button-small crm-no-print" onClick={()=>setTeamOpen(value=>!value)}><Users size={14}/>{teamOpen?"Close":"Manage team"}</button>}</div>{teamOpen&&canManageTeam&&<div className="crm-card crm-card-pad" style={{background:"#f9fbff"}}><div className="crm-card-head"><div><h2>Assign consultants</h2><p>Only teammates with access to this business unit can join the project.</p></div></div>{teammates.length?teammates.map(member=>{const userId=String(member.user_id);const isOwner=userId===String(selected.owner_user_id||"");return <label key={userId} style={{display:"flex",alignItems:"center",gap:10,borderTop:"1px solid var(--line)",padding:"10px 0",fontSize:12}}><input type="checkbox" checked={teamIds.includes(userId)||isOwner} disabled={busy||isOwner} onChange={event=>setTeamIds(current=>event.target.checked?[...current,userId]:current.filter(id=>id!==userId))}/><span className="crm-avatar" style={{width:30,height:30}}>{initials(member.name)}</span><span style={{flex:1}}><strong>{String(member.name||member.email||"Teammate")}</strong><small style={{display:"block",color:"var(--muted)",marginTop:2}}>{String(member.email||"")}</small></span>{isOwner&&<span className="crm-pill blue">Project owner</span>}</label>;}):<EmptyState icon={Users} title="No eligible teammates" detail="Grant CRM access to this business unit before adding project consultants."/>}<div className="crm-form-actions"><button className="crm-secondary" onClick={()=>setTeamOpen(false)}>Cancel</button><button className="crm-primary" disabled={busy||!teammates.length} onClick={()=>void onSaveTeam(selected,teamIds)}>{busy?<LoaderCircle size={15} className="animate-spin"/>:<Check size={15}/>}Save team</button></div></div>}<div style={{ display:"flex",gap:14,alignItems:"center",marginTop:18 }}><span style={{ color:"var(--muted)",fontSize:11 }}>Progress</span><div className="crm-progress" style={{ flex:1 }}><span style={{ width:`${progress}%` }}/></div><strong>{progress}%</strong><select className="crm-filter crm-no-print" value={String(selected.status)} onChange={event=>onUpdate(selected,event.target.value)}><option value="planned">Planned</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div></section><section className="crm-project-panels"><article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>Milestone checklist</h2><p>Project stages and progress</p></div><button className="crm-panel-link crm-no-print" onClick={()=>onCreate("milestones",selected)}><Plus size={14}/>Add</button></div>{projectMilestones.length?projectMilestones.map((row,index)=><div className="crm-list-row" key={row.id}><span className={`crm-metric-icon tone-${row.status==="completed"?"green":row.status==="blocked"?"gold":"blue"}`} style={{ width:30,height:30 }}>{row.status==="completed"?<Check size={15}/>:index+1}</span><span className="crm-list-content"><strong>{row.title}</strong><span>{fmtDate(row.due_date)}</span></span><select className="crm-filter" aria-label={`Status for ${row.title}`} value={String(row.status)} onChange={event=>onMilestoneStatus(row,event.target.value)}>{["pending","in_progress","completed","blocked"].map(status=><option key={status} value={status}>{titleCase(status)}</option>)}</select></div>):<EmptyState icon={Target} title="Add milestones" detail="Break delivery into reviewable stages."/>}</article><article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>Deliverables</h2><p>Outputs for this engagement</p></div><button className="crm-panel-link crm-no-print" onClick={()=>onCreate("deliverables",selected)}><Plus size={14}/>Add</button></div>{projectDeliverables.length?projectDeliverables.map(row=><div className="crm-list-row" key={row.id}><span className="crm-metric-icon tone-blue" style={{ width:30,height:30 }}><FileText size={15}/></span><span className="crm-list-content"><strong>{row.title}</strong><span>{row.owner_name||"Unassigned"} · Due {fmtDate(row.due_date)}</span></span><select className="crm-filter" aria-label={`Status for ${row.title}`} value={String(row.status)} onChange={event=>onDeliverableStatus(row,event.target.value)}>{["not_started","in_progress","in_review","completed"].map(status=><option key={status} value={status}>{titleCase(status)}</option>)}</select></div>):<EmptyState icon={FileText} title="No deliverables yet" detail="Track reports, documents, and key work products."/>}</article><article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>Activity feed</h2><p>Recent project updates</p></div><button className="crm-panel-link crm-no-print" onClick={()=>onCreate("activities",selected)}><Plus size={14}/>Log</button></div>{projectActivity.length?projectActivity.map(row=><div className="crm-activity-row" key={row.id}><span className="crm-activity-icon tone-blue"><Activity size={15}/></span><span className="crm-activity-text"><strong>{row.title}</strong><span>{String(row.details||titleCase(row.kind)).slice(0,80)}</span></span></div>):<EmptyState icon={Activity} title="No updates yet" detail="Meetings, notes, and project tasks appear here."/>}</article></section><section className="crm-grid crm-grid-2"><article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>Client & opportunity</h2><p>Relationship context</p></div><span className="crm-pill green">{selected.company_status||"Client"}</span></div><p style={{ color:"#586984",fontSize:12,lineHeight:1.6 }}>{selected.description||"Add a clear engagement summary and scope."}</p><div className="crm-list-row"><Building2 size={18} color="#0876f9"/><span className="crm-list-content"><strong>{selected.company_name||"No organization linked"}</strong><span>{selected.owner_name||"Project team to be assigned"}</span></span></div></article><article className="crm-card crm-card-pad" style={{ background:"#fff9ec",borderColor:"#f8e7bf" }}><div className="crm-card-head"><div><h2>Risks & blockers</h2><p>Raise issues early</p></div><button className="crm-panel-link crm-no-print" onClick={()=>onCreate("activities",selected)}><Plus size={14}/>Log issue</button></div><p style={{ color:"#8b681e",fontSize:12,lineHeight:1.6 }}>Keep risks and decisions in the activity log so the team and client timeline stay clear.</p></article></section></div>;
  }
  return <div className="crm-grid" style={{ gridTemplateColumns:"repeat(auto-fill,minmax(255px,1fr))",gap:12 }}>{projects.length?projects.map(row=>{const projectMilestones=milestones.filter(item=>item.project_id===row.id);const progress=Number(row.progress||(projectMilestones.length?Math.round(projectMilestones.filter(item=>item.status==="completed").length/projectMilestones.length*100):0));return <article className="crm-card crm-project-card" key={row.id} onClick={()=>onSelect(row)}><div style={{ display:"flex",justifyContent:"space-between",gap:10 }}><span className="crm-metric-icon tone-blue"><BriefcaseBusiness size={18}/></span><Pill value={row.status}/></div><div><strong style={{ fontSize:14 }}>{row.name}</strong><div style={{ marginTop:4,color:"var(--muted)",fontSize:11 }}>{row.company_name||"No client linked"} · {row.engagement_type||"Engagement"}</div></div><div className="crm-progress"><span style={{ width:`${progress}%` }}/></div><div style={{ display:"flex",justifyContent:"space-between",color:"#78869c",fontSize:10 }}><span>{progress}% complete</span><span>Due {fmtDate(row.due_date)}</span></div><div style={{ display:"flex",alignItems:"center",gap:8,borderTop:"1px solid var(--line)",paddingTop:10 }}><span className="crm-avatar" style={{ width:28,height:28 }}>{initials(row.owner_name)}</span><span style={{ color:"#52627c",fontSize:11 }}>{row.owner_name||"Unassigned"}</span><span style={{ marginLeft:"auto",color:"#7f8ca1",fontSize:10 }}>{projectMilestones.length} milestones</span></div></article>;}):<div style={{ gridColumn:"1/-1" }}><EmptyState icon={BriefcaseBusiness} title="No engagements yet" detail="Turn a won opportunity into a project, then track the work and deliverables." action={<button className="crm-primary" onClick={()=>onCreate("projects")}><Plus size={15}/>Add project</button>}/></div>}</div>;
}

function TasksView({ tasks, onCreate, onEdit, onUpdate, onArchive, busy }: { tasks:Row[]; onCreate:()=>void; onEdit:(row:Row)=>void; onUpdate:(row:Row,status:string)=>void; onArchive:(row:Row)=>void; busy:boolean }) {
  const sorted=[...tasks].sort((a,b)=>String(a.due_at||"9999").localeCompare(String(b.due_at||"9999")));
  const overdue=sorted.filter(row=>row.status==="open"&&row.due_at&&String(row.due_at).slice(0,10)<new Date().toISOString().slice(0,10));
  const upcoming=sorted.filter(row=>!overdue.includes(row));
  const section=(title:string,rows:Row[],tone:string)=><article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>{title}</h2><p>{rows.length} items</p></div><span className={`crm-pill ${tone}`}>{rows.length}</span></div>{rows.length?rows.map(row=><div className="crm-list-row" key={row.id}><button className={`crm-icon-button ${row.status==="completed"?"tone-green":""}`} title="Mark complete" onClick={()=>onUpdate(row,row.status==="completed"?"open":"completed")} disabled={busy}>{row.status==="completed"?<Check size={16}/>:<CheckSquare2 size={16}/>}</button><span className="crm-list-content"><strong>{row.title}</strong><span>{row.company_name||row.contact_name||row.project_name||titleCase(row.kind)} · {row.owner_name||"Unassigned"}</span></span><span style={{ display:"grid",justifyItems:"end",gap:6 }}><Pill value={row.priority}/><small style={{ color:"var(--muted)",fontSize:10 }}>{fmtDate(row.due_at)}</small></span><button className="crm-icon-button" title="Edit task" onClick={()=>onEdit(row)}><Pencil size={14}/></button><button className="crm-icon-button" title="Archive task" onClick={()=>onArchive(row)}><Archive size={14}/></button></div>):<p style={{ color:"var(--muted)",fontSize:12 }}>Nothing to show.</p>}</article>;
  return <div className="crm-task-sections"><div style={{ gridColumn:"1/-1",display:"flex",justifyContent:"flex-end" }}><button className="crm-secondary" onClick={onCreate}><Plus size={15}/>Add task or activity</button></div>{section("Overdue",overdue,"red")}{section("Upcoming",upcoming,"blue")}</div>;
}

function ProposalsView({ proposals, convertedProposalIds, onCreate, onEdit, onConvert, onUpdate, onPrint, busy }: { proposals:Row[]; convertedProposalIds:string[]; onCreate:()=>void; onEdit:(row:Row)=>void; onConvert:(row:Row)=>void; onUpdate:(row:Row,status:string)=>void; onPrint:(row:Row)=>void; busy:boolean }) {
  const statuses=["draft","in_review","sent","accepted","rejected","expired"];
  return <div className="crm-card crm-card-pad">{proposals.length?<div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Proposal</th><th>Organization</th><th>Value</th><th>Valid until</th><th>Status</th><th>Actions</th></tr></thead><tbody>{proposals.map(row=><tr key={row.id} onClick={()=>onPrint(row)}><td><span className="crm-primary-cell"><span className="crm-metric-icon tone-blue" style={{width:30,height:30}}><FileText size={15}/></span>{row.title}</span></td><td>{row.company_name||"—"}</td><td>{money(row.amount_minor)}</td><td>{fmtDate(row.valid_until)}</td><td><select className="crm-filter" aria-label={`Status for ${row.title}`} disabled={busy} value={String(row.status)} onClick={event=>event.stopPropagation()} onChange={event=>onUpdate(row,event.target.value)}>{statuses.map(status=><option key={status} value={status}>{titleCase(status)}</option>)}</select></td><td><button className="crm-ghost crm-button-small" onClick={event=>{event.stopPropagation();onEdit(row);}}><Pencil size={14}/>Edit</button>{row.status==="accepted"&&<button className="crm-secondary crm-button-small" disabled={busy||convertedProposalIds.includes(String(row.id))} onClick={event=>{event.stopPropagation();onConvert(row);}}><BriefcaseBusiness size={14}/>{convertedProposalIds.includes(String(row.id))?"Engagement created":"Start engagement"}</button>}<button className="crm-ghost crm-button-small" onClick={event=>{event.stopPropagation();onPrint(row);}}><FileText size={14}/>Preview PDF</button></td></tr>)}</tbody></table></div>:<EmptyState icon={FileText} title="Create a proposal" detail="Draft a scope and quotation, keep versions, and record the client's decision." action={<button className="crm-primary" onClick={onCreate}><Plus size={15}/>New proposal</button>}/>}</div>;
}

function DocumentsView({ documents, companies, projects, onCreate, onDownload, onArchive }: { documents:Row[]; companies:Row[]; projects:Row[]; onCreate:()=>void; onDownload:(row:Row)=>void; onArchive:(row:Row)=>void }) {
  return <div className="crm-grid" style={{ gap:14 }}><article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>Client and project files</h2><p>Documents follow the access rules of their business unit and linked records.</p></div><button className="crm-primary" onClick={onCreate}><Plus size={15}/>Upload document</button></div>{documents.length?<div style={{ marginTop:12 }}>{documents.map(row=><div className="crm-list-row" key={row.id}><span className="crm-metric-icon tone-blue"><FileText size={17}/></span><span className="crm-list-content"><strong>{row.filename}</strong><span>{row.company_name||row.project_name||"General"} · {Math.max(1,Math.round(Number(row.size_bytes||0)/1024))} KB · {fmtDate(row.created_at)}</span></span><span className="crm-pill">{row.version_label||"File"}</span><button className="crm-secondary crm-button-small" onClick={()=>onDownload(row)}><Download size={14}/>Download</button><button className="crm-icon-button" onClick={()=>onArchive(row)} title="Archive"><Archive size={14}/></button></div>)}</div>:<EmptyState icon={Paperclip} title="No files uploaded" detail="Attach proposals, agreements, reports, and deliverables to the right client or project." action={<button className="crm-primary" onClick={onCreate}><Plus size={15}/>Upload document</button>}/>}</article><article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>Folders at a glance</h2><p>Files are linked to their CRM records.</p></div></div><div className="crm-grid" style={{ gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",marginTop:12 }}><div className="crm-list-row"><Building2 size={18} color="#0876f9"/><span className="crm-list-content"><strong>Organizations</strong><span>{companies.length} client folders</span></span></div><div className="crm-list-row"><BriefcaseBusiness size={18} color="#0876f9"/><span className="crm-list-content"><strong>Engagements</strong><span>{projects.length} project folders</span></span></div></div></article></div>;
}

function InvoicesView({ invoices, payments, financialUnitIds, canSeeFinancials, onCreate, onEdit, onPay, onUpdate, busy }: { invoices:Row[]; payments:Row[]; financialUnitIds:string[]; canSeeFinancials:boolean; onCreate:()=>void; onEdit:(row:Row)=>void; onPay:(row:Row)=>void; onUpdate:(row:Row,status:string)=>void; busy:boolean }) {
  const [historyInvoice,setHistoryInvoice]=useState<Row|null>(null);
  const amount=(status:string)=>invoices.filter(row=>row.status===status).reduce((sum,row)=>sum+Math.max(0,Number(row.amount_minor||0)-Number(row.paid_minor||0)),0);
  const printReceipt=(invoice:Row,payment:Row)=>{const popup=window.open("","_blank","width=800,height=760");if(!popup)return;popup.opener=null;popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Payment receipt - ${safeText(invoice.title)}</title><style>body{font:15px Arial,sans-serif;color:#172541;max-width:680px;margin:55px auto;line-height:1.6;padding:0 24px}header{border-bottom:3px solid #0866f5;padding-bottom:20px;margin-bottom:28px}.brand{font-size:13px;letter-spacing:3px;color:#bd8528}h1{font-size:30px;margin:7px 0}.amount{font-size:28px;font-weight:bold;color:#075dde;margin:24px 0}.row{display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding:12px 0}.muted{color:#71809a}@media print{body{margin:20mm auto}}</style></head><body><header><div class="brand">PANIGALE GROUP</div><h1>Payment receipt</h1><div class="muted">${safeText(invoice.title)} · ${safeText(invoice.company_name||invoice.contact_name||"Client")}</div></header><div class="amount">${safeText(money(payment.amount_minor))}</div><div class="row"><span>Payment date</span><b>${safeText(fmtDate(payment.paid_at))}</b></div><div class="row"><span>Method</span><b>${safeText(titleCase(payment.method||"manual"))}</b></div><div class="row"><span>Payment reference</span><b>${safeText(payment.reference||"—")}</b></div><div class="row"><span>Invoice reference</span><b>${safeText(invoice.external_reference||invoice.id)}</b></div>${payment.notes?`<p class="muted">${safeText(payment.notes)}</p>`:""}<p class="muted" style="margin-top:48px">Issued by Panigale Group CRM as a record of payment received.</p><script>window.onload=()=>window.print()</script></body></html>`);popup.document.close();};
  return <div className="crm-grid" style={{ gap:14 }}><div className="crm-grid crm-grid-4">{[{label:"Outstanding",value:amount("sent")+amount("overdue"),tone:"gold"},{label:"Overdue",value:amount("overdue"),tone:"red"},{label:"Paid",value:amount("paid"),tone:"green"},{label:"Invoice records",value:invoices.length,tone:"blue"}].map(item=><article className="crm-card crm-metric" style={{minHeight:88,padding:14}} key={item.label}><div><span className="crm-metric-label">{item.label}</span><div className="crm-metric-value" style={{fontSize:20}}>{canSeeFinancials?typeof item.value==="number"&&item.label!=="Invoice records"?money(item.value):item.value:"Restricted"}</div></div><span className={`crm-metric-icon tone-${item.tone}`}><WalletCards size={18}/></span></article>)}</div><div className="crm-card crm-card-pad">{invoices.length?<div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Invoice</th><th>Client</th><th>Issued</th><th>Due</th><th>Amount</th><th>Received</th><th>Status</th><th></th></tr></thead><tbody>{invoices.map(row=><tr key={row.id}><td><span className="crm-primary-cell"><FileText size={15} color="#0876f9"/>{row.title}</span><small style={{display:"block",marginTop:4,color:"var(--muted)"}}>{row.external_reference||"No reference"}</small></td><td>{row.company_name||row.contact_name||"—"}</td><td>{fmtDate(row.created_at)}</td><td>{fmtDate(row.due_date)}</td><td>{financialUnitIds.includes(String(row.unit_id))?money(row.amount_minor):"Restricted"}</td><td>{financialUnitIds.includes(String(row.unit_id))?money(row.paid_minor):"Restricted"}</td><td><select className="crm-filter" value={String(row.status)} disabled={busy} onChange={event=>onUpdate(row,event.target.value)}>{["draft","sent","overdue","paid","cancelled"].map(status=><option key={status} value={status}>{titleCase(status)}</option>)}</select></td><td style={{whiteSpace:"nowrap"}}><button className="crm-ghost crm-button-small" onClick={()=>onEdit(row)}><Pencil size={13}/>Edit</button>{financialUnitIds.includes(String(row.unit_id))&&<button className="crm-ghost crm-button-small" onClick={()=>setHistoryInvoice(row)}><Clock3 size={13}/>Payments</button>}{["sent","overdue"].includes(String(row.status))&&<button className="crm-secondary crm-button-small" onClick={()=>onPay(row)}><Plus size={13}/>Record payment</button>}</td></tr>)}</tbody></table></div>:<EmptyState icon={CircleDollarSign} title="Track your first invoice" detail="Record receivables here and link out to PaniPay when payment processing is needed." action={<button className="crm-primary" onClick={onCreate}><Plus size={15}/>New invoice</button>}/>}</div><p style={{color:"var(--muted)",fontSize:10,margin:"0 3px"}}>CRM records invoice status and manual reconciliation. Payment processing remains in PaniPay and connected finance systems.</p>{historyInvoice&&<div className="crm-overlay" onClick={event=>{if(event.target===event.currentTarget)setHistoryInvoice(null);}}><section className="crm-modal"><header className="crm-modal-head"><div><h2>Payment history</h2><p>{historyInvoice.title} · {historyInvoice.company_name||historyInvoice.contact_name||"Client"}</p></div><button className="crm-icon-button" aria-label="Close payment history" onClick={()=>setHistoryInvoice(null)}><X size={17}/></button></header><div style={{padding:18}}>{payments.filter(payment=>payment.invoice_id===historyInvoice.id).length?payments.filter(payment=>payment.invoice_id===historyInvoice.id).map(payment=><div className="crm-list-row" key={payment.id}><span className="crm-metric-icon tone-green"><CircleDollarSign size={17}/></span><span className="crm-list-content"><strong>{money(payment.amount_minor)}</strong><span>{fmtDate(payment.paid_at)} · {titleCase(payment.method||"manual")}</span><span>{payment.reference||"No reference"}{payment.notes?` · ${payment.notes}`:""}</span></span><button className="crm-secondary crm-button-small" onClick={()=>printReceipt(historyInvoice,payment)}><FileText size={14}/>Receipt</button></div>):<EmptyState icon={CircleDollarSign} title="No payments recorded" detail="Payments recorded against this invoice will appear here."/>}<div className="crm-form-actions"><button className="crm-secondary" onClick={()=>setHistoryInvoice(null)}>Close</button></div></div></section></div>}</div>;
}

function ReportsView({ data, stageRows, canSeeFinancials }: { data:typeof emptyData; stageRows:{stage:string;value:number;count:number}[]; canSeeFinancials:boolean }) {
  const csv=()=>{const rows=[["Metric","Value"],["Organizations",String(data.companies.length)],["Contacts",String(data.contacts.length)],["Active engagements",String(data.projects.filter(row=>row.status==="active").length)],["Open opportunities",String(data.leads.filter(row=>!['won','lost'].includes(String(row.stage))).length)],["Overdue tasks",String(data.activities.filter(row=>row.status==="open"&&row.due_at&&String(row.due_at).slice(0,10)<new Date().toISOString().slice(0,10)).length)]];if(canSeeFinancials)rows.push(["Outstanding invoices",String(data.invoices.filter(row=>["sent","overdue"].includes(String(row.status))).reduce((sum,row)=>sum+Math.max(0,Number(row.amount_minor||0)-Number(row.paid_minor||0)),0)/100)]);const blob=new Blob([rows.map(row=>row.map(value=>`"${value.replaceAll('"','""')}"`).join(",")).join("\n")],{type:"text/csv"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="panigale-crm-report.csv";link.click();URL.revokeObjectURL(link.href);};
  return <div className="crm-grid" style={{gap:14}}><div className="crm-page-head" style={{margin:0,justifyContent:"flex-end"}}><button className="crm-secondary" onClick={csv}><Download size={15}/>Export CSV</button></div><section className="crm-grid crm-grid-4">{[{label:"Lead-to-client",value:data.dashboard?.leadConversion||"—",tone:"blue"},{label:"Proposal turnaround",value:data.dashboard?.proposalTurnaround||"—",tone:"violet"},{label:"On-time delivery",value:data.dashboard?.onTimeDelivery||"—",tone:"green"},{label:"Collection time",value:canSeeFinancials?data.dashboard?.collectionDays||"—":"Restricted",tone:"gold"}].map(row=><article className="crm-card crm-metric" style={{minHeight:90,padding:14}} key={row.label}><div><span className="crm-metric-label">{row.label}</span><div className="crm-metric-value" style={{fontSize:21}}>{row.value}</div><div className="crm-metric-note">Current unit</div></div><span className={`crm-metric-icon tone-${row.tone}`}><TrendingUp size={18}/></span></article>)}</section><section className="crm-grid crm-grid-2"><article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>Opportunities by stage</h2><p>Count and estimated value</p></div></div>{stageRows.map((row,index)=><div className="crm-list-row" key={row.stage}><span className="crm-metric-icon" style={{width:30,height:30,background:`${CHART_COLORS[index%CHART_COLORS.length]}18`,color:CHART_COLORS[index%CHART_COLORS.length]}}><Target size={15}/></span><span className="crm-list-content"><strong>{row.stage}</strong><span>{row.count} opportunities</span></span><strong>{canSeeFinancials?money(row.value*100):"Restricted"}</strong></div>)}</article><article className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>Delivery pulse</h2><p>Projects, activity, and invoice health</p></div></div><div className="crm-list-row"><span className="crm-metric-icon tone-green"><BriefcaseBusiness size={16}/></span><span className="crm-list-content"><strong>Active engagements</strong><span>In progress or planned</span></span><b>{data.projects.filter(row=>["active","planned"].includes(String(row.status))).length}</b></div><div className="crm-list-row"><span className="crm-metric-icon tone-gold"><Clock3 size={16}/></span><span className="crm-list-content"><strong>Tasks overdue</strong><span>Needs a follow-up</span></span><b>{data.activities.filter(row=>row.status==="open"&&row.due_at&&String(row.due_at).slice(0,10)<new Date().toISOString().slice(0,10)).length}</b></div><div className="crm-list-row"><span className="crm-metric-icon tone-violet"><CircleDollarSign size={16}/></span><span className="crm-list-content"><strong>Receivables</strong><span>{data.invoices.filter(row=>["sent","overdue"].includes(String(row.status))).length} invoices awaiting payment</span></span><b>{canSeeFinancials?money(data.invoices.filter(row=>["sent","overdue"].includes(String(row.status))).reduce((sum,row)=>sum+Number(row.amount_minor||0)-Number(row.paid_minor||0),0)):"Restricted"}</b></div></article></section></div>;
}

function AccessView({ context, data, onGrant, onRevoke, busy }: { context:Context; data:typeof emptyData; onGrant:(event:FormEvent<HTMLFormElement>,role:string,units:string[],financialUnits:string[])=>void; onRevoke:(row:Row)=>void; busy:boolean }) {
  const [role,setRole]=useState("member");
  const [units,setUnits]=useState<string[]>([]);
  const [financialUnits,setFinancialUnits]=useState<string[]>([]);
  return <div className="crm-access-layout"><form className="crm-card crm-card-pad" onSubmit={event=>onGrant(event,role,units,financialUnits)}><div className="crm-card-head"><div><h2>Grant workspace access</h2><p>Select only the business units this teammate needs.</p></div><span className="crm-metric-icon tone-blue"><ShieldCheck size={18}/></span></div><label className="crm-field" style={{marginTop:16}}>Panigale account email<input name="email" type="email" required placeholder="name@example.com" maxLength={254}/></label><label className="crm-field" style={{marginTop:12}}>Role<select value={role} onChange={event=>setRole(event.target.value)}><option value="member">Member · assigned units</option><option value="unit_manager">Unit manager</option>{context.role==="superadmin"&&<option value="superadmin">CRM superadmin · all units</option>}</select></label><fieldset style={{border:0,padding:0,margin:"14px 0 0"}}><legend style={{fontSize:11,fontWeight:650,color:"#40516c"}}>Business units</legend><div style={{display:"grid",gap:7,marginTop:8}}>{context.units.map(unit=><label key={unit.id} style={{display:"flex",alignItems:"center",gap:9,border:"1px solid var(--line)",borderRadius:9,padding:"9px 11px",fontSize:11}}><input type="checkbox" checked={units.includes(unit.id)} onChange={event=>setUnits(value=>event.target.checked?[...value,unit.id]:value.filter(id=>id!==unit.id))}/>{unit.name}</label>)}</div><p style={{fontSize:10,color:"var(--muted)"}}>Members see only the units explicitly selected here. Grants are recorded in the audit log.</p></fieldset><fieldset style={{border:0,padding:0,margin:"12px 0 0"}}><legend style={{fontSize:11,fontWeight:650,color:"#40516c"}}>Financial visibility · optional</legend><div style={{display:"grid",gap:7,marginTop:8}}>{context.units.filter(unit=>units.includes(unit.id)).map(unit=><label key={unit.id} style={{display:"flex",alignItems:"center",gap:9,border:"1px solid var(--line)",borderRadius:9,padding:"9px 11px",fontSize:11}}><input type="checkbox" checked={financialUnits.includes(unit.id)} onChange={event=>setFinancialUnits(value=>event.target.checked?[...value,unit.id]:value.filter(id=>id!==unit.id))}/>View pipeline values and invoices · {unit.name}</label>)}</div><p style={{fontSize:10,color:"var(--muted)"}}>Financial records stay hidden unless you explicitly enable them for an assigned unit.</p></fieldset><button className="crm-primary" style={{width:"100%",marginTop:15}} disabled={busy}><Plus size={15}/>Grant access</button></form><section className="crm-card crm-card-pad"><div className="crm-card-head"><div><h2>Current CRM team</h2><p>{data.members.length} people · changes are audited</p></div></div>{data.members.length?data.members.map(member=><div className="crm-list-row" key={String(member.user_id)}><span className="crm-avatar">{initials(member.name||member.email)}</span><span className="crm-list-content"><strong>{member.name||member.email}</strong><span>{member.email} · {titleCase(member.role)}</span><span>{member.unit_names||"All business units"}</span><span>{member.financial_unit_names?`Financial visibility: ${member.financial_unit_names}`:"Financial values hidden"}</span></span><button className="crm-danger crm-button-small" onClick={()=>onRevoke(member)} disabled={busy}>Revoke</button></div>):<EmptyState icon={Users} title="No teammates yet" detail="Grant access to a verified Panigale account."/>}</section></div>;
}

function ContactDrawer({ row, activities, companies, onEdit, onFollowUp, mobileClose }: {row:Row;activities:Row[];companies:Row[];onEdit:(row:Row)=>void;onFollowUp:(row:Row)=>void;mobileClose:()=>void}) {
  const company=companies.find(item=>item.id===row.company_id);
  const history=activities.filter(item=>item.contact_id===row.id||item.company_id===row.company_id).slice(0,4);
  return <><button className="crm-drawer-backdrop" aria-label="Close contact" onClick={mobileClose}/><aside className="crm-card crm-contact-panel mobile-open"><div className="crm-contact-hero"><div className="crm-card-head"><span className="crm-contact-name"><span className="crm-avatar" style={{width:50,height:50,fontSize:15}}>{initials(row.name)}</span><span><h2>{row.name}</h2><p>{row.job_title||"Contact"}{company?` at ${company.name}`:""}</p></span></span><button className="crm-icon-button" onClick={mobileClose}><X size={16}/></button></div><div style={{marginTop:12}}><Pill value={row.status}/></div><div className="crm-contact-actions"><button onClick={()=>onEdit(row)}><Pencil size={14}/>Edit record</button><a href={row.email?`mailto:${row.email}`:undefined}><Mail size={14}/>Email</a><a href={row.phone?`tel:${row.phone}`:undefined}><Phone size={14}/>Call</a><button onClick={()=>onFollowUp(row)}><CalendarDays size={14}/>Follow up</button></div></div><div className="crm-contact-meta"><div className="crm-meta-row"><Mail size={15}/><span><strong>{row.email||"No email"}</strong>{row.phone||"No phone number"}</span></div><div className="crm-meta-row"><Building2 size={15}/><span><strong>{company?.name||row.company_name||"No organization linked"}</strong>{company?.industry||company?.segment||"Business relationship"}</span></div><div className="crm-meta-row"><Users size={15}/><span><strong>Owner</strong>{row.owner_name||"Unassigned"}</span></div><div className="crm-meta-row"><CalendarDays size={15}/><span><strong>Next follow-up</strong>{fmtDate(row.next_follow_up)}</span></div></div><div className="crm-contact-meta"><strong style={{fontSize:12}}>Relationship notes</strong><p style={{margin:0,color:"#65748d",fontSize:11,lineHeight:1.6}}>{row.notes||"Add notes to remember context, preferences, and relationship history."}</p><strong style={{fontSize:12,marginTop:5}}>Recent activity</strong>{history.length?history.map(item=><div className="crm-activity-row" key={item.id}><span className="crm-activity-icon tone-blue"><Activity size={14}/></span><span className="crm-activity-text"><strong>{item.title}</strong><span>{fmtDate(item.created_at)} · {item.details||titleCase(item.kind)}</span></span></div>):<span style={{color:"var(--muted)",fontSize:11}}>No activity recorded yet.</span>}</div></aside></>;
}

function CompanyDrawer({row,contacts,leads,activities,onEdit,onFollowUp,mobileClose}:{row:Row;contacts:Row[];leads:Row[];activities:Row[];onEdit:(row:Row)=>void;onFollowUp:(row:Row)=>void;mobileClose:()=>void}) {
  const relatedContacts=contacts.filter(item=>item.company_id===row.id);
  const relatedLeads=leads.filter(item=>item.company_id===row.id);
  const history=activities.filter(item=>item.company_id===row.id).slice(0,4);
  return <><button className="crm-drawer-backdrop" aria-label="Close organization" onClick={mobileClose}/><aside className="crm-card crm-contact-panel mobile-open"><div className="crm-contact-hero"><div className="crm-card-head"><span className="crm-contact-name"><span className="crm-avatar" style={{width:50,height:50}}><Building2 size={20}/></span><span><h2>{row.name}</h2><p>{row.industry||row.segment||"Organization"}</p></span></span><button className="crm-icon-button" onClick={mobileClose}><X size={16}/></button></div><div style={{marginTop:12}}><Pill value={row.status}/></div><div className="crm-contact-actions"><button onClick={()=>onEdit(row)}><Pencil size={14}/>Edit record</button><a href={row.email?`mailto:${row.email}`:undefined}><Mail size={14}/>Email</a><a href={row.phone?`tel:${row.phone}`:undefined}><Phone size={14}/>Call</a><button onClick={()=>onFollowUp(row)}><CalendarDays size={14}/>Log activity</button><a href={String(row.website||"")||undefined} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Website</a></div></div><div className="crm-contact-meta"><div className="crm-meta-row"><Building2 size={15}/><span><strong>{row.industry||"Industry not set"}</strong>{row.segment||"No segment"}</span></div><div className="crm-meta-row"><Users size={15}/><span><strong>{relatedContacts.length} contacts</strong>{relatedContacts.map(item=>item.name).slice(0,3).join(", ")||"Add relationship contacts"}</span></div><div className="crm-meta-row"><Target size={15}/><span><strong>{relatedLeads.length} opportunities</strong>{relatedLeads.slice(0,3).map(item=>item.title).join(", ")||"No active opportunities"}</span></div></div><div className="crm-contact-meta"><strong style={{fontSize:12}}>Organization notes</strong><p style={{margin:0,color:"#65748d",fontSize:11,lineHeight:1.6}}>{row.notes||"Add organization background and relationship context."}</p><strong style={{fontSize:12,marginTop:6}}>Recent activity</strong>{history.length?history.map(item=><div className="crm-activity-row" key={item.id}><span className="crm-activity-icon tone-green"><Activity size={14}/></span><span className="crm-activity-text"><strong>{item.title}</strong><span>{fmtDate(item.created_at)}</span></span></div>):<span style={{fontSize:11,color:"var(--muted)"}}>No activity recorded yet.</span>}</div></aside></>;
}

function LeadDrawer({row,canSeeFinancials,onEdit,mobileClose}:{row:Row;canSeeFinancials:boolean;onEdit:(row:Row)=>void;mobileClose:()=>void}) {
  return <><button className="crm-drawer-backdrop" aria-label="Close opportunity" onClick={mobileClose}/><aside className="crm-card crm-contact-panel mobile-open"><div className="crm-contact-hero"><div className="crm-card-head"><span className="crm-contact-name"><span className="crm-metric-icon tone-blue" style={{width:48,height:48}}><Target size={20}/></span><span><h2>{row.title}</h2><p>{row.company_name||"Opportunity"}</p></span></span><button className="crm-icon-button" onClick={mobileClose}><X size={16}/></button></div><div style={{marginTop:12,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}><Pill value={row.stage}/><button className="crm-secondary crm-button-small" onClick={()=>onEdit(row)}><Pencil size={14}/>Edit opportunity</button></div></div><div className="crm-contact-meta"><div className="crm-meta-row"><Building2 size={15}/><span><strong>{row.company_name||"No organization linked"}</strong>{row.contact_name||"No primary contact"}</span></div><div className="crm-meta-row"><CircleDollarSign size={15}/><span><strong>{canSeeFinancials?money(row.value_minor):"Restricted"}</strong>Expected opportunity value</span></div><div className="crm-meta-row"><CalendarDays size={15}/><span><strong>{fmtDate(row.expected_close)}</strong>Expected close</span></div><div className="crm-meta-row"><Users size={15}/><span><strong>{row.owner_name||"Unassigned"}</strong>Opportunity owner</span></div><div className="crm-meta-row"><Sparkles size={15}/><span><strong>{row.source||"No source recorded"}</strong>Lead source</span></div></div><div className="crm-contact-meta"><strong style={{fontSize:12}}>Next step</strong><p style={{margin:0,color:"#65748d",fontSize:11,lineHeight:1.6}}>{row.next_step||"Add a concrete next step."}</p><strong style={{fontSize:12,marginTop:5}}>Qualification</strong><p style={{margin:0,color:"#65748d",fontSize:11,lineHeight:1.6}}>{row.qualification||row.notes||"No qualification notes yet."}</p></div></aside></>;
}

function ImportCsvModal({resource,units,defaultUnit,busy,error,onClose,onImport}:{resource:"contacts"|"leads";units:Unit[];defaultUnit:string;busy:boolean;error:string;onClose:()=>void;onImport:(file:File,unitId:string)=>void}) {
  const [unitId,setUnitId]=useState(defaultUnit);const [file,setFile]=useState<File|null>(null);
  const isContacts=resource==="contacts";
  return <div className="crm-overlay" onClick={event=>{if(event.target===event.currentTarget)onClose();}}><section className="crm-modal"><header className="crm-modal-head"><div><h2>Import {isContacts?"contacts":"opportunities"}</h2><p>CSV files only · up to 250 rows and 2 MB. Invalid rows will be listed after import.</p></div><button className="crm-icon-button" aria-label="Close import" onClick={onClose}><X size={17}/></button></header><div className="crm-form"><label className="crm-field wide">Business unit<select required value={unitId} onChange={event=>setUnitId(event.target.value)}>{units.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label className="crm-field wide">CSV file<input type="file" accept=".csv,text/csv" onChange={event=>setFile(event.target.files?.[0]||null)}/><small style={{color:"var(--muted)",fontWeight:450}}>{isContacts?"Required column: name. Optional: email, phone, company_id, job_title, source, status, next_follow_up, notes, owner_user_id.":"Required column: title. Optional: stage, value, currency, expected_close, company_id, contact_id, source, next_step, qualification, owner_user_id, notes."}</small></label>{file&&<p className="crm-notice wide" style={{margin:0}}>{file.name} · {Math.ceil(file.size/1024)} KB</p>}{error&&<div role="alert" className="crm-alert wide" style={{margin:0}}>{error}</div>}<div className="crm-form-actions"><button type="button" className="crm-secondary" onClick={onClose}>Cancel</button><button className="crm-primary" disabled={busy||!file||!unitId} onClick={()=>file&&onImport(file,unitId)}>{busy?<LoaderCircle size={15} className="animate-spin"/>:<Download size={15}/>}Import CSV</button></div></div></section></div>;
}

function RecordModal({resource,parent,record,fields,units,fixedUnit,unitForForm,setUnitForForm,busy,error,onClose,onSubmit}:{resource:string;parent:Row|null;record:Row|null;fields:Field[];units:Unit[];fixedUnit:string;unitForForm:string;setUnitForForm:(id:string)=>void;busy:boolean;error:string;onClose:()=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}) {
  const [fileName,setFileName]=useState("");
  const name=resource==="activities"?"task or activity":resource.replaceAll("_"," ").replaceAll("-"," ");
  const valueFor=(field:Field)=>{let value=field.name==="value"?Number(record?.value_minor||0)/100:field.name==="amount"?Number(record?.amount_minor||0)/100:record?.[field.name];if(value==null&&parent&&resource==="activities"){if(field.name==="title")value=`Follow up with ${String(parent.name||parent.title||"client")}`;else if(field.name==="company_id"&&(parent.industry!==undefined||parent.segment!==undefined))value=parent.id;else if(field.name==="contact_id"&&(parent.job_title!==undefined||parent.email!==undefined))value=parent.id;else if(field.name==="project_id"&&parent.name!==undefined&&!parent.industry)value=parent.id;else if(field.name==="lead_id"&&parent.stage!==undefined)value=parent.id;}return field.type==="date"&&value?String(value).slice(0,10):value==null?"":String(value);};
  return <div className="crm-overlay" onClick={event=>{if(event.target===event.currentTarget)onClose();}}><section className="crm-modal"><header className="crm-modal-head"><div><h2>{resource==="payments"?"Record invoice payment":resource==="documents"?"Upload document":record?`Edit ${name}`:`Add ${name}`}</h2><p>{parent?`For ${parent.title||parent.name||"the selected record"}. `:""}Information is stored in the selected business unit.</p></div><button className="crm-icon-button" aria-label="Close dialog" onClick={onClose}><X size={17}/></button></header><form className="crm-form" onSubmit={onSubmit}><label className="crm-field wide">Business unit<select required value={unitForForm} disabled={!!fixedUnit} onChange={event=>setUnitForForm(event.target.value)}>{units.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>{resource==="documents"?<><label className="crm-field wide">File<input type="file" name="file" required onChange={event=>setFileName(event.target.files?.[0]?.name||"")} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg"/><small style={{color:"var(--muted)",fontWeight:450}}>PDF, Office, CSV, or image · up to 15 MB. {fileName}</small></label><label className="crm-field">Organization<select name="company_id"><option value="">No organization</option>{fields.find(field=>field.name==="company_id")?.options?.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="crm-field">Project<select name="project_id"><option value="">No project</option>{fields.find(field=>field.name==="project_id")?.options?.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="crm-field wide">Version label<input name="version_label" placeholder="e.g. Client review v2" maxLength={100}/></label></>:fields.map(field=><label className={`crm-field ${field.wide?"wide":""}`} key={field.name}>{field.label}{field.type==="textarea"?<textarea name={field.name} required={field.required} defaultValue={valueFor(field)} maxLength={field.name==="notes"||field.name==="details"||field.name==="scope"?6000:2000} placeholder={`Add ${field.label.toLowerCase()}...`}/>:field.type==="select"?<select name={field.name} required={field.required} defaultValue={valueFor(field)}><option value="">Select {field.label.toLowerCase()}</option>{(field.options||[]).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:<input name={field.name} type={field.type||"text"} required={field.required} min={field.type==="number"?0:undefined} step={field.type==="number"?"0.01":undefined} defaultValue={valueFor(field)} maxLength={field.type==="number"?undefined:500} placeholder={field.type==="number"?"0.00":`Enter ${field.label.toLowerCase()}`}/>}</label>)}{error&&<div role="alert" className="crm-alert" style={{gridColumn:"1/-1",margin:0}}>{error}</div>}<div className="crm-form-actions"><button type="button" className="crm-secondary" onClick={onClose}>Cancel</button><button className="crm-primary" disabled={busy}>{busy?<LoaderCircle size={15} className="animate-spin"/>:<Check size={15}/>}Save {record?"changes":resource==="activities"?"task":titleCase(resource).replaceAll("-"," ")}</button></div></form></section></div>;
}

function ProposalPrint({proposal,company,unit,onClose}:{proposal:Row;company?:Row;unit?:Unit;onClose:()=>void}) {
  const print=()=>{const popup=window.open("","_blank","noopener,noreferrer,width=900,height=900");if(!popup)return;popup.document.write(`<!doctype html><html><head><title>${safeText(proposal.title)}</title><style>body{font:15px Arial,sans-serif;color:#172541;max-width:760px;margin:60px auto;line-height:1.65}header{border-bottom:3px solid #0866f5;padding-bottom:25px;margin-bottom:35px}h1{font-size:34px;margin:0 0 7px}small{color:#71809a}.amount{font-size:24px;font-weight:bold;color:#075dde;margin:26px 0}.scope{white-space:pre-wrap}footer{margin-top:80px;border-top:1px solid #dce4ef;padding-top:20px;color:#71809a;font-size:12px}@media print{body{margin:25mm auto}}</style></head><body><header><small>${safeText(unit?.name||"Panigale Group")} · PROPOSAL</small><h1>${safeText(proposal.title)}</h1><small>${safeText(company?.name||proposal.company_name||"Prepared for client")} · Version ${safeText(proposal.version||1)}</small></header><p><b>Prepared for</b><br>${safeText(company?.name||proposal.company_name||"Client")}</p><div class="amount">${safeText(money(proposal.amount_minor))}</div><h2>Scope of work</h2><div class="scope">${safeText(proposal.scope||"Scope to be confirmed.")}</div><footer>Valid until ${safeText(fmtDate(proposal.valid_until))}. This proposal was prepared in Panigale Group CRM.</footer><script>window.onload=()=>window.print()</script></body></html>`);popup.document.close();};
  return <div className="crm-overlay crm-no-print" onClick={event=>{if(event.target===event.currentTarget)onClose();}}><section className="crm-modal"><header className="crm-modal-head"><div><h2>{proposal.title}</h2><p>{company?.name||proposal.company_name||"Proposal preview"} · Version {proposal.version||1}</p></div><button className="crm-icon-button" onClick={onClose}><X size={16}/></button></header><div style={{padding:22}}><div className="crm-grid crm-grid-2"><div><span className="crm-metric-label">Proposed value</span><div className="crm-metric-value">{money(proposal.amount_minor)}</div></div><div><span className="crm-metric-label">Valid until</span><div style={{marginTop:12,fontWeight:700}}>{fmtDate(proposal.valid_until)}</div></div></div><h3>Scope of work</h3><p style={{color:"#5f6e86",fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{proposal.scope||"No scope added yet."}</p><div className="crm-form-actions"><button className="crm-secondary" onClick={onClose}>Close</button><button className="crm-primary" onClick={print}><Download size={15}/>Print / Save PDF</button></div></div></section></div>;
}
