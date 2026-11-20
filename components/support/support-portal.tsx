"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, CheckCircle2, ChevronDown, Globe, LockKeyhole, Moon, Paperclip, Send, Shield, ShieldCheck, Sparkles, Sun, Users, Zap } from "lucide-react";

type Portal = { service: string; unitName: string; categories: string[] };
type Theme = "light" | "dark";
type Language = "en" | "fr" | "it";

const copy = {
  en: {
    clientSupport: "Client support", groupEyebrow: "PANIGALE GROUP SUPPORT", eurozaEyebrow: "EUROZA · CLIENT CARE", panipayEyebrow: "PANIPAY · CUSTOMER CARE", zedpreneursEyebrow: "ZEDPRENEURS · VENTURE SUPPORT",
    received: "We’ve received your request.", eurozaTitle: "How can EUROZA help?", zedpreneursTitle: "How can ZedPreneurs help?", title: "How can we help?", receivedDetail: "Your request is with the right team. We’ll continue the conversation by email.",
    eurozaIntro: "Tell us about your application, compliance, project, or service request. Our team will take it from here.", zedpreneursIntro: "Tell us about your venture, training, opportunity, or partnership enquiry. We’ll route it to the ZedPreneurs team.", intro: "Tell us what you need and we’ll get your message to the right team.",
    requestSent: "Request sent successfully", referenceNumber: "Your reference number is", keepReference: "Keep this number handy. We’ll reply to the email address you provided.", anotherRequest: "Send another request",
    eurozaUnit: "EUROZA Consulting · Compliance · Project delivery", zedpreneursUnit: "ZedPreneurs · Zambia", zedpreneursBrand: "Support", groupUnit: "Panigale Group business unit", secure: "Secure", name: "Your name", email: "Email address", topic: "What can we help with?", selectTopic: "Select a topic", reference: "Reference", optional: "(optional)",
    panipayReference: "Payment, invoice, or escrow reference", eurozaReference: "Application or project reference", subject: "Subject", subjectPlaceholder: "A short summary of your request", message: "Message", messagePlaceholder: "Share the details we’ll need to help you…",
    fullName: "Your full name", consentEuroza: "We’ll use your details only to respond to your EUROZA request and keep the conversation connected.", consentZedPreneurs: "We’ll use your details only to respond to your ZedPreneurs request and keep the conversation connected.", consent: "We’ll use your details to respond to this request and keep the conversation connected.",
    shareDocument: "Need to share a document?", shareDocumentDetail: "Add your ticket number if you need to share a document later.", send: "Send request", private: "Your request is only visible to the relevant support team.",
    next: "What happens next", route: "We route your request", routeDetail: "Your message goes to the right product and team.", ticketNumber: "You receive a ticket number", ticketDetail: "Your request stays connected to a reference number.",
    byEmail: "Continue by email", byEmailDetail: "Reply directly when you need to add more information.", common: "Common requests", permit: "Permit and application support", permitDetail: "Application status, required documents or permit guidance",
    compliance: "Compliance and project support", complianceDetail: "Statutory compliance, delivery, or service concerns", payment: "Payment and invoice help", paymentDetail: "Payment status, invoice questions or escrow issues",
    account: "Account and technical help", accountDetail: "Wallet, account access, API or webhooks", clearPath: "A clear path to resolution", oneTeam: "One team, clear follow-through", caseDetail: "Your case stays connected from the first message to resolution.",
    confidential: "Secure and confidential support", secureSupport: "Secure support", eurozaBrand: "EUROZA · Client care", panipayBrand: "PaniPay customer care", groupBrand: "Panigale Group",
    languageName: "English", dark: "Dark", light: "Light", switchToDark: "Switch to dark mode", switchToLight: "Switch to light mode", error: "Support is temporarily unavailable.", sendError: "Unable to send your request. Please try again.",
  },
  fr: {
    clientSupport: "Assistance client", groupEyebrow: "ASSISTANCE PANIGALE GROUP", eurozaEyebrow: "EUROZA · SERVICE CLIENT", panipayEyebrow: "PANIPAY · SERVICE CLIENT", zedpreneursEyebrow: "ZEDPRENEURS · ASSISTANCE AUX ENTREPRENEURS",
    received: "Votre demande a bien été reçue.", eurozaTitle: "Comment EUROZA peut-elle vous aider ?", zedpreneursTitle: "Comment ZedPreneurs peut-il vous aider ?", title: "Comment pouvons-nous vous aider ?", receivedDetail: "Votre demande est transmise à la bonne équipe. Nous poursuivrons par e-mail.",
    eurozaIntro: "Décrivez votre demande concernant une démarche, la conformité, un projet ou un service. Notre équipe prend le relais.", zedpreneursIntro: "Parlez-nous de votre entreprise, d’une formation, d’une opportunité ou d’un partenariat. Nous transmettrons votre demande à l’équipe ZedPreneurs.", intro: "Dites-nous ce dont vous avez besoin afin que nous transmettions votre message à la bonne équipe.",
    requestSent: "Demande envoyée", referenceNumber: "Votre numéro de référence", keepReference: "Conservez ce numéro. Nous répondrons à l’adresse e-mail indiquée.", anotherRequest: "Envoyer une autre demande",
    eurozaUnit: "EUROZA Conseil · Conformité · Gestion de projets", zedpreneursUnit: "ZedPreneurs · Zambie", zedpreneursBrand: "Assistance", groupUnit: "Entité du groupe Panigale", secure: "Sécurisé", name: "Votre nom", email: "Adresse e-mail", topic: "Comment pouvons-nous vous aider ?", selectTopic: "Choisissez un sujet", reference: "Référence", optional: "(facultatif)",
    panipayReference: "Référence de paiement, facture ou séquestre", eurozaReference: "Référence de dossier ou de projet", subject: "Objet", subjectPlaceholder: "Résumez brièvement votre demande", message: "Message", messagePlaceholder: "Indiquez les détails nécessaires pour vous aider…",
    fullName: "Votre nom complet", consentEuroza: "Vos coordonnées serviront uniquement à répondre à votre demande EUROZA et à suivre l’échange.", consentZedPreneurs: "Vos coordonnées serviront uniquement à répondre à votre demande ZedPreneurs et à suivre l’échange.", consent: "Vos coordonnées serviront à répondre à votre demande et à assurer le suivi de l’échange.",
    shareDocument: "Vous souhaitez transmettre un document ?", shareDocumentDetail: "Indiquez votre numéro de ticket pour joindre un document ultérieurement.", send: "Envoyer la demande", private: "Votre demande est visible uniquement par l’équipe concernée.",
    next: "Que se passe-t-il ensuite ?", route: "Votre demande est transmise", routeDetail: "Votre message est envoyé au bon produit et à la bonne équipe.", ticketNumber: "Vous recevez un numéro de ticket", ticketDetail: "Votre demande reste liée à un numéro de référence.",
    byEmail: "Poursuivez par e-mail", byEmailDetail: "Répondez directement pour ajouter des informations.", common: "Demandes fréquentes", permit: "Démarches et permis", permitDetail: "Suivi de dossier, pièces requises ou conseils sur les permis",
    compliance: "Conformité et projets", complianceDetail: "Conformité réglementaire, livraison ou questions de service", payment: "Paiements et factures", paymentDetail: "Statut d’un paiement, facture ou question de séquestre",
    account: "Compte et assistance technique", accountDetail: "Portefeuille, accès au compte, API ou webhooks", clearPath: "Un suivi clair jusqu’à la résolution", oneTeam: "Une équipe, un suivi continu", caseDetail: "Votre dossier reste suivi du premier message jusqu’à sa résolution.",
    confidential: "Assistance sécurisée et confidentielle", secureSupport: "Assistance sécurisée", eurozaBrand: "EUROZA · Service client", panipayBrand: "Service client PaniPay", groupBrand: "Panigale Group",
    languageName: "Français", dark: "Sombre", light: "Clair", switchToDark: "Activer le mode sombre", switchToLight: "Activer le mode clair", error: "Le service d’assistance est momentanément indisponible.", sendError: "Impossible d’envoyer votre demande. Veuillez réessayer.",
  },
  it: {
    clientSupport: "Assistenza clienti", groupEyebrow: "ASSISTENZA PANIGALE GROUP", eurozaEyebrow: "EUROZA · ASSISTENZA CLIENTI", panipayEyebrow: "PANIPAY · ASSISTENZA CLIENTI", zedpreneursEyebrow: "ZEDPRENEURS · SUPPORTO IMPRENDITORIALE",
    received: "Abbiamo ricevuto la tua richiesta.", eurozaTitle: "Come può aiutarti EUROZA?", zedpreneursTitle: "Come può aiutarti ZedPreneurs?", title: "Come possiamo aiutarti?", receivedDetail: "La tua richiesta è stata inoltrata al team corretto. Continueremo la conversazione via e-mail.",
    eurozaIntro: "Descrivi la tua richiesta relativa a pratiche, conformità, progetti o servizi. Il nostro team ti assisterà.", zedpreneursIntro: "Raccontaci della tua iniziativa, di una formazione, di un’opportunità o di una partnership. Inoltreremo la richiesta al team ZedPreneurs.", intro: "Dicci di cosa hai bisogno e inoltreremo il messaggio al team corretto.",
    requestSent: "Richiesta inviata", referenceNumber: "Il tuo numero di riferimento", keepReference: "Conserva questo numero. Risponderemo all’indirizzo e-mail indicato.", anotherRequest: "Invia un’altra richiesta",
    eurozaUnit: "EUROZA Consulenza · Conformità · Progetti", zedpreneursUnit: "ZedPreneurs · Zambia", zedpreneursBrand: "Assistenza", groupUnit: "Società del gruppo Panigale", secure: "Protetto", name: "Nome", email: "Indirizzo e-mail", topic: "Come possiamo aiutarti?", selectTopic: "Seleziona un argomento", reference: "Riferimento", optional: "(facoltativo)",
    panipayReference: "Riferimento pagamento, fattura o escrow", eurozaReference: "Riferimento pratica o progetto", subject: "Oggetto", subjectPlaceholder: "Un breve riepilogo della richiesta", message: "Messaggio", messagePlaceholder: "Inserisci i dettagli utili per poterti aiutare…",
    fullName: "Nome e cognome", consentEuroza: "Useremo i tuoi dati solo per rispondere alla richiesta EUROZA e mantenere la conversazione collegata.", consentZedPreneurs: "Useremo i tuoi dati solo per rispondere alla richiesta ZedPreneurs e mantenere la conversazione collegata.", consent: "Useremo i tuoi dati per rispondere alla richiesta e mantenere la conversazione collegata.",
    shareDocument: "Devi inviare un documento?", shareDocumentDetail: "Aggiungi il numero del ticket se desideri inviare un documento in seguito.", send: "Invia richiesta", private: "La richiesta è visibile solo al team di assistenza interessato.",
    next: "Cosa succede ora", route: "Inoltriamo la richiesta", routeDetail: "Il messaggio arriva al prodotto e al team corretti.", ticketNumber: "Ricevi un numero di ticket", ticketDetail: "La richiesta resta collegata a un numero di riferimento.",
    byEmail: "Continua via e-mail", byEmailDetail: "Rispondi direttamente per aggiungere altre informazioni.", common: "Richieste frequenti", permit: "Pratiche e permessi", permitDetail: "Stato della pratica, documenti richiesti o indicazioni sui permessi",
    compliance: "Conformità e progetti", complianceDetail: "Conformità normativa, consegne o richieste sui servizi", payment: "Pagamenti e fatture", paymentDetail: "Stato del pagamento, fatture o questioni escrow",
    account: "Account e assistenza tecnica", accountDetail: "Wallet, accesso account, API o webhook", clearPath: "Un percorso chiaro verso la soluzione", oneTeam: "Un team, un seguito costante", caseDetail: "La pratica resta collegata dal primo messaggio fino alla risoluzione.",
    confidential: "Assistenza sicura e riservata", secureSupport: "Assistenza sicura", eurozaBrand: "EUROZA · Assistenza clienti", panipayBrand: "Assistenza clienti PaniPay", groupBrand: "Panigale Group",
    languageName: "Italiano", dark: "Scuro", light: "Chiaro", switchToDark: "Attiva la modalità scura", switchToLight: "Attiva la modalità chiara", error: "Il servizio di assistenza non è momentaneamente disponibile.", sendError: "Impossibile inviare la richiesta. Riprova.",
  },
} satisfies Record<Language, Record<string, string>>;

const categoryCopy: Record<Language, Record<string, string>> = {
  en: {},
  fr: {
    "Permit or application": "Démarches ou permis", "Tax or statutory registration": "Fiscalité ou immatriculation légale", "Compliance support": "Assistance en conformité", "Project delivery": "Réalisation de projet", "Billing or service concern": "Facturation ou question sur un service", "Payment or invoice": "Paiement ou facture", "Failed payment": "Échec de paiement", "Wallet or payout": "Portefeuille ou retrait", "Escrow dispute": "Litige lié au séquestre", "Account access": "Accès au compte", "API or webhook": "API ou webhook", Other: "Autre",
  },
  it: {
    "Permit or application": "Pratica o permesso", "Tax or statutory registration": "Registrazione fiscale o legale", "Compliance support": "Assistenza normativa", "Project delivery": "Realizzazione del progetto", "Billing or service concern": "Fatturazione o richiesta sul servizio", "Payment or invoice": "Pagamento o fattura", "Failed payment": "Pagamento non riuscito", "Wallet or payout": "Wallet o prelievo", "Escrow dispute": "Contestazione escrow", "Account access": "Accesso all’account", "API or webhook": "API o webhook", Other: "Altro",
  },
};

export function SupportPortal({ portalSlug }: { portalSlug: string }) {
  const [portal, setPortal] = useState<Portal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const [language, setLanguage] = useState<Language>("en");
  const [languageOpen, setLanguageOpen] = useState(false);
  const panipay = portalSlug === "panipay";
  const euroza = portalSlug === "euroza";
  const zedpreneurs = portalSlug === "zedpreneurs";
  const zedLogoSrc = theme === "dark" ? "/brands/zedpreneurs-logo-dark.png" : "/brands/zedpreneurs-logo-light.png";
  const c = copy[language];

  useEffect(() => {
    const saved = window.localStorage.getItem("pg-support-theme");
    setTheme(saved === "dark" || saved === "light" ? saved : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const savedLanguage = window.localStorage.getItem("pg-support-language");
    const browserLanguage = navigator.languages.find(value => value.startsWith("fr") || value.startsWith("it"))?.slice(0, 2);
    const initialLanguage = savedLanguage === "fr" || savedLanguage === "it" || savedLanguage === "en" ? savedLanguage : browserLanguage === "fr" || browserLanguage === "it" ? browserLanguage : "en";
    setLanguage(initialLanguage);
    fetch(`/api/support/v1/tickets?portal=${encodeURIComponent(portalSlug)}`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json() as Portal & { error?: string };
        if (!response.ok) throw new Error(data.error || "Support is unavailable.");
        setPortal(data);
      })
      .catch(() => setError("unavailable"));
  }, [portalSlug]);

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem("pg-support-language", language);
  }, [language]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("pg-support-theme", next);
  }

  function changeLanguage(next: Language) {
    setLanguage(next);
    setLanguageOpen(false);
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
      if (!response.ok) throw new Error("support-submit-failed");
      setTicket(data.ticketNumber || "");
      formElement.reset();
    } catch {
      setError(c.sendError);
    } finally {
      setBusy(false);
    }
  }

  const serviceName = portal?.service || (zedpreneurs ? "ZedPreneurs" : euroza ? "EUROZA" : panipay ? "PaniPay" : "Client support");
  const brandName = zedpreneurs ? "ZedPreneurs" : euroza ? "EUROZA" : panipay ? "PaniPay" : "Panigale Group";
  const brandCaption = zedpreneurs ? c.zedpreneursBrand : euroza ? c.eurozaBrand : panipay ? c.panipayBrand : c.groupBrand;
  const eyebrow = zedpreneurs ? c.zedpreneursEyebrow : euroza ? c.eurozaEyebrow : panipay ? c.panipayEyebrow : c.groupEyebrow;
  const unitName = zedpreneurs ? c.zedpreneursUnit : euroza && portal?.unitName === "Euroza Consultancy" ? c.eurozaUnit : portal?.unitName || (euroza ? c.eurozaUnit : c.groupUnit);

  return <main className="support-portal" lang={language} data-theme={theme} data-brand={zedpreneurs ? "zedpreneurs" : euroza ? "euroza" : panipay ? "panipay" : "group"}>
    <header className="support-portal-header">
      <a className={`support-portal-brand${euroza ? " euroza" : ""}${zedpreneurs ? " zedpreneurs" : ""}`} href={zedpreneurs ? "https://zedprenuers.com" : euroza ? "https://euroza.panigale.tech" : panipay ? "https://panipay.panigale.tech" : "https://panigale.tech"} aria-label={`${brandName} support`}>
        {euroza ? <span className="support-euroza-logo-wrap"><img src="/brands/euroza-logo.png" alt="EUROZA Consulting"/></span> : zedpreneurs ? <span className="support-zedpreneurs-logo-wrap"><img src={zedLogoSrc} alt="ZedPreneurs · Innovate, Build, Scale"/></span> : <span className="support-portal-mark">{panipay ? "P" : "P"}</span>}
        <span className="support-brand-caption">{brandCaption}</span>
      </a>
      <div className="support-portal-header-side"><span>{c.clientSupport}</span><i/>
        <div className="support-language-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setLanguageOpen(false); }}>
          <button type="button" className="support-language-button" aria-haspopup="menu" aria-expanded={languageOpen} onClick={() => setLanguageOpen(open => !open)}><Globe size={15}/>{c.languageName}<ChevronDown size={13}/></button>
          {languageOpen && <div className="support-language-menu" role="menu" aria-label="Choose language">
            {([ ["en", "English"], ["fr", "Français"], ["it", "Italiano"] ] as const).map(([value, label]) => <button type="button" role="menuitemradio" aria-checked={language === value} key={value} onClick={() => changeLanguage(value)}>{label}{language === value && <Check size={14}/>}</button>)}
          </div>}
        </div>
        <button type="button" className="support-theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? c.switchToLight : c.switchToDark} aria-pressed={theme === "dark"}>
          {theme === "dark" ? <Sun size={15}/> : <Moon size={15}/>}<span>{theme === "dark" ? c.light : c.dark}</span>
        </button>
      </div>
    </header>

    <section className="support-portal-hero">
      <span className="support-portal-eyebrow"><Sparkles size={14}/>{eyebrow}</span>
      <h1>{ticket ? c.received : zedpreneurs ? c.zedpreneursTitle : euroza ? c.eurozaTitle : c.title}</h1>
      <p>{ticket ? c.receivedDetail : zedpreneurs ? c.zedpreneursIntro : euroza ? c.eurozaIntro : c.intro}</p>
    </section>

    {ticket ? <section className="support-portal-success">
      <span><CheckCircle2 size={28}/></span><h2>{c.requestSent}</h2><p>{c.referenceNumber}</p><strong>{ticket}</strong>
      <small>{c.keepReference}</small>
      <a href={`/support/${portalSlug}`}>{c.anotherRequest}</a>
    </section> : <section className="support-portal-layout">
      <form className="support-portal-form" onSubmit={event => void submit(event)}>
        <div className="support-portal-unit">
          <span className={`support-service-mark${zedpreneurs ? " zedpreneurs" : ""}`}>{zedpreneurs ? "ZP" : panipay ? "P" : euroza ? "E" : "P"}</span>
          <div><strong>{serviceName}</strong><span>{unitName}</span></div>
          <span className="support-portal-lock"><LockKeyhole size={13}/>{c.secure}</span>
        </div>
        {error && <div className="support-portal-error" role="alert">{error === "unavailable" ? c.error : error}</div>}
        <div className="support-portal-fields">
          <label><b>{c.name} <em>*</em></b><input required name="name" autoComplete="name" placeholder={c.fullName}/></label>
          <label><b>{c.email} <em>*</em></b><input required type="email" name="email" autoComplete="email" placeholder="you@example.com"/></label>
          <label><b>{c.topic} <em>*</em></b><select required name="category" defaultValue=""><option value="" disabled>{c.selectTopic}</option>{(portal?.categories || []).map(value => <option key={value} value={value}>{categoryCopy[language][value] || value}</option>)}</select></label>
          <label><b>{c.reference} <span>{c.optional}</span></b><input name="reference" placeholder={panipay ? c.panipayReference : c.eurozaReference}/></label>
          <label className="span-two"><b>{c.subject} <em>*</em></b><input required name="subject" maxLength={250} placeholder={c.subjectPlaceholder}/></label>
          <label className="span-two"><b>{c.message} <em>*</em></b><textarea required name="message" minLength={10} maxLength={10000} rows={6} placeholder={c.messagePlaceholder}/></label>
          <label className="support-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label>
        </div>
        <div className="support-portal-upload"><Paperclip size={16}/><span><strong>{c.shareDocument}</strong><small>{c.shareDocumentDetail}</small></span><CheckCircle2 size={16}/></div>
        <p className="support-portal-consent"><ShieldCheck size={15}/>{zedpreneurs ? c.consentZedPreneurs : euroza ? c.consentEuroza : c.consent}</p>
        <button className="support-portal-submit" disabled={busy || !portal}>{busy ? <span className="support-portal-spinner"/> : <Send size={15}/>}<span>{c.send}</span></button>
        <p className="support-portal-private"><LockKeyhole size={12}/>{c.private}</p>
      </form>

      <aside className="support-portal-aside">
        <section><h2>{c.next}</h2><ol>
          <li><b>01</b><span><strong>{c.route}</strong><small>{c.routeDetail}</small></span></li>
          <li><b>02</b><span><strong>{c.ticketNumber}</strong><small>{c.ticketDetail}</small></span></li>
          <li><b>03</b><span><strong>{c.byEmail}</strong><small>{c.byEmailDetail}</small></span></li>
        </ol></section>
        <section className="support-portal-shortcuts"><h2>{c.common}</h2>
          <article><span className="support-shortcut-icon blue"><Shield size={16}/></span><span><strong>{panipay ? c.payment : c.permit}</strong><small>{panipay ? c.paymentDetail : c.permitDetail}</small></span></article>
          <article><span className="support-shortcut-icon purple"><Users size={16}/></span><span><strong>{panipay ? c.account : c.compliance}</strong><small>{panipay ? c.accountDetail : c.complianceDetail}</small></span></article>
          <div className="support-portal-note"><Zap size={16}/><span><strong>{euroza ? c.clearPath : c.oneTeam}</strong><small>{c.caseDetail}</small></span></div>
        </section>
        <footer><ShieldCheck size={14}/>{c.confidential}</footer>
      </aside>
    </section>}

    <footer className="support-portal-footer"><span>© {brandName}</span><span>{c.secureSupport} · {serviceName}</span></footer>
  </main>;
}
