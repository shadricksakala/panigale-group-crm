"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Globe, LockKeyhole, Moon, Paperclip, Send, Shield, ShieldCheck, Sparkles, Sun, Users, Zap } from "lucide-react";

type Portal = { service: string; unitName: string; categories: string[] };
type Theme = "light" | "dark";

export function SupportPortal({ portalSlug }: { portalSlug: string }) {
  const [portal, setPortal] = useState<Portal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const panipay = portalSlug === "panipay";
  const euroza = portalSlug === "euroza";

  useEffect(() => {
    const saved = window.localStorage.getItem("pg-support-theme");
    setTheme(saved === "dark" || saved === "light" ? saved : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    fetch(`/api/support/v1/tickets?portal=${encodeURIComponent(portalSlug)}`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json() as Portal & { error?: string };
        if (!response.ok) throw new Error(data.error || "Support is unavailable.");
        setPortal(data);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : "Support is unavailable."));
  }, [portalSlug]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("pg-support-theme", next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/support/v1/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portalSlug, customerName: form.get("name"), customerEmail: form.get("email"), category: form.get("category"), reference: form.get("reference"), subject: form.get("subject"), message: form.get("message"), website: form.get("website") }),
      });
      const data = await response.json() as { ticketNumber?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to send request.");
      setTicket(data.ticketNumber || "");
      formElement.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send your request.");
    } finally {
      setBusy(false);
    }
  }

  const serviceName = portal?.service || (euroza ? "EUROZA" : panipay ? "PaniPay" : "Client support");
  const brandName = euroza ? "EUROZA" : panipay ? "PaniPay" : "Panigale Group";

  return <main className="support-portal" data-theme={theme} data-brand={euroza ? "euroza" : panipay ? "panipay" : "group"}>
    <header className="support-portal-header">
      <a className={`support-portal-brand${euroza ? " euroza" : ""}`} href={euroza ? "https://euroza.panigale.tech" : panipay ? "https://panipay.panigale.tech" : "https://panigale.tech"} aria-label={`${brandName} support`}>
        {euroza ? <span className="support-euroza-logo-wrap"><img src="/brands/euroza-logo.png" alt="EUROZA Consulting"/></span> : <span className="support-portal-mark">{panipay ? "P" : "P"}</span>}
        <span className="support-brand-caption">{euroza ? "Client care" : panipay ? "PaniPay" : "Panigale Group"}</span>
      </a>
      <div className="support-portal-header-side"><span>Client support</span><i/>
        <button type="button" className="support-language-button" aria-label="Language: English"><Globe size={15}/>English</button>
        <button type="button" className="support-theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-pressed={theme === "dark"}>
          {theme === "dark" ? <Sun size={15}/> : <Moon size={15}/>}<span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </div>
    </header>

    <section className="support-portal-hero">
      <span className="support-portal-eyebrow"><Sparkles size={14}/>{euroza ? "EUROZA · CLIENT CARE" : panipay ? "PANIPAY · CUSTOMER CARE" : "PANIGALE GROUP SUPPORT"}</span>
      <h1>{ticket ? "We’ve received your request." : euroza ? "How can EUROZA help?" : "How can we help?"}</h1>
      <p>{ticket ? "Your request is with the right team. We’ll continue the conversation by email." : euroza ? "Tell us about your application, compliance, project, or service request. Our team will take it from here." : "Tell us what you need and we’ll get your message to the right team."}</p>
    </section>

    {ticket ? <section className="support-portal-success">
      <span><CheckCircle2 size={28}/></span><h2>Request sent successfully</h2><p>Your reference number is</p><strong>{ticket}</strong>
      <small>Keep this number handy. We’ll reply to <b>the email address you provided</b>.</small>
      <a href={`/support/${portalSlug}`}>Send another request</a>
    </section> : <section className="support-portal-layout">
      <form className="support-portal-form" onSubmit={event => void submit(event)}>
        <div className="support-portal-unit">
          <span className="support-service-mark">{panipay ? "P" : euroza ? "E" : "P"}</span>
          <div><strong>{serviceName}</strong><span>{portal?.unitName || (euroza ? "Consultancy · Compliance · Project delivery" : "Panigale Group business unit")}</span></div>
          <span className="support-portal-lock"><LockKeyhole size={13}/>Secure</span>
        </div>
        {error && <div className="support-portal-error" role="alert">{error}</div>}
        <div className="support-portal-fields">
          <label><b>Your name <em>*</em></b><input required name="name" autoComplete="name" placeholder="Your full name"/></label>
          <label><b>Email address <em>*</em></b><input required type="email" name="email" autoComplete="email" placeholder="you@example.com"/></label>
          <label><b>What can we help with? <em>*</em></b><select required name="category" defaultValue=""><option value="" disabled>Select a topic</option>{(portal?.categories || []).map(value => <option key={value}>{value}</option>)}</select></label>
          <label><b>Reference <span>(optional)</span></b><input name="reference" placeholder={panipay ? "Payment, invoice, or escrow reference" : "Application or project reference"}/></label>
          <label className="span-two"><b>Subject <em>*</em></b><input required name="subject" maxLength={250} placeholder="A short summary of your request"/></label>
          <label className="span-two"><b>Message <em>*</em></b><textarea required name="message" minLength={10} maxLength={10000} rows={6} placeholder="Share the details we’ll need to help you…"/></label>
          <label className="support-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label>
        </div>
        <div className="support-portal-upload"><Paperclip size={16}/><span><strong>Need to share a document?</strong><small>Add your ticket number if you need to share a document later.</small></span><CheckCircle2 size={16}/></div>
        <p className="support-portal-consent"><ShieldCheck size={15}/>{euroza ? "We’ll use your details only to respond to your EUROZA request and keep the conversation connected." : "We’ll use your details to respond to this request and keep the conversation connected."}</p>
        <button className="support-portal-submit" disabled={busy || !portal}>{busy ? <span className="support-portal-spinner"/> : <Send size={15}/>}Send request</button>
        <p className="support-portal-private"><LockKeyhole size={12}/>Your request is only visible to the relevant support team.</p>
      </form>

      <aside className="support-portal-aside">
        <section><h2>What happens next</h2><ol>
          <li><b>01</b><span><strong>We route your request</strong><small>Your message goes to the right product and team.</small></span></li>
          <li><b>02</b><span><strong>You receive a ticket number</strong><small>Your request stays connected to a reference number.</small></span></li>
          <li><b>03</b><span><strong>Continue by email</strong><small>Reply directly when you need to add more information.</small></span></li>
        </ol></section>
        <section className="support-portal-shortcuts"><h2>Common requests</h2>
          <article><span className="support-shortcut-icon blue"><Shield size={16}/></span><span><strong>{panipay ? "Payment and invoice help" : "Permit and application support"}</strong><small>{panipay ? "Payment status, invoice questions or escrow issues" : "Application status, required documents or permit guidance"}</small></span></article>
          <article><span className="support-shortcut-icon purple"><Users size={16}/></span><span><strong>{panipay ? "Account and technical help" : "Compliance and project support"}</strong><small>{panipay ? "Wallet, account access, API or webhooks" : "Statutory compliance, delivery, or service concerns"}</small></span></article>
          <div className="support-portal-note"><Zap size={16}/><span><strong>{euroza ? "A clear path to resolution" : "One team, clear follow-through"}</strong><small>Your case stays connected from the first message to resolution.</small></span></div>
        </section>
        <footer><ShieldCheck size={14}/> Secure and confidential support</footer>
      </aside>
    </section>}

    <footer className="support-portal-footer"><span>© {brandName}</span><span>Secure support · {serviceName}</span></footer>
  </main>;
}
