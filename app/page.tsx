"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import zhTW from "@/messages/zh-TW.json";
import en from "@/messages/en.json";
import replayReportZhTW from "@/messages/replay-report.zh-TW.json";

type Locale = "zh-TW" | "en";
const localeMessages = { "zh-TW": zhTW, en };

type Citation = { url: string; label: string; kind: string };
type Report = {
  requirement_summary: string;
  clarification_questions: string[];
  impacted_files: { path: string; reason: string; risk_level: string; citations: Citation[] }[];
  implementation_tasks: { title: string; description: string; affected_files: string[]; acceptance_criteria: string[]; citations: Citation[] }[];
  acceptance_criteria: string[];
  risks: { title: string; severity: string; explanation: string; evidence_type: string; citations: Citation[] }[];
  confidence: { level: string; reason: string };
};
type Step = { key: string; label: string; status: string; summary?: string; duration_ms?: number };
type Investigation = {
  id: string; repository: string; issue_number: number; mode: string; status: string;
  report?: Report; approved_report?: Report; error?: string; token_usage: number;
  estimated_cost_usd: string; steps: Step[];
  tool_calls: { tool_name: string; duration_ms: number }[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const terminalStatuses = new Set(["waiting_approval", "approved", "rejected", "failed"]);

function Icon({ name }: { name: "repo" | "issue" | "branch" | "spark" | "check" | "arrow" | "shield" }) {
  const symbols = { repo: "◇", issue: "#", branch: "⑂", spark: "✦", check: "✓", arrow: "↗", shield: "◆" };
  return <span className={`icon icon-${name}`} aria-hidden="true">{symbols[name]}</span>;
}

function CitationLink({ citation }: { citation: Citation }) {
  return <a className="citation" href={citation.url} target="_blank" rel="noreferrer">{citation.label} <Icon name="arrow" /></a>;
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("zh-TW");

  function changeLocale(next: Locale) {
    setLocale(next);
    document.documentElement.lang = next;
  }

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  return <NextIntlClientProvider locale={locale} messages={localeMessages[locale]} timeZone="Asia/Taipei">
    <TaskInvestigator locale={locale} onLocaleChange={changeLocale} />
  </NextIntlClientProvider>;
}

function TaskInvestigator({ locale, onLocaleChange }: { locale: Locale; onLocaleChange: (locale: Locale) => void }) {
  const t = useTranslations("App");
  const [repository, setRepository] = useState("demo/frontend-agent-demo-shop");
  const [issueNumber, setIssueNumber] = useState("128");
  const [branch, setBranch] = useState("main");
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<"report" | "trace">("report");
  const eventSource = useRef<EventSource | null>(null);

  const completedSteps = useMemo(() => investigation?.steps.filter((step) => step.status === "completed").length || 0, [investigation]);

  useEffect(() => () => eventSource.current?.close(), []);

  function subscribe(id: string) {
    eventSource.current?.close();
    const source = new EventSource(`${API_URL}/api/v1/investigations/${id}/events`);
    eventSource.current = source;
    source.addEventListener("investigation", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as Investigation;
      setInvestigation(next);
      if (terminalStatuses.has(next.status)) setLoading(false);
    });
    source.addEventListener("done", () => { source.close(); setLoading(false); });
    source.onerror = () => { source.close(); setLoading(false); setNotice(t("errors.disconnected")); };
  }

  async function startInvestigation(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setNotice(""); setInvestigation(null); setActiveTab("report");
    try {
      const response = await fetch(`${API_URL}/api/v1/investigations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository, issue_number: Number(issueNumber), branch, include_pull_requests: true, mode }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || t("errors.start"));
      setInvestigation(body); subscribe(body.id);
    } catch (error) {
      setLoading(false); setNotice(error instanceof Error ? error.message : t("errors.unreachable"));
    }
  }

  async function decide(action: "approve" | "reject") {
    if (!investigation) return;
    setLoading(true); setNotice("");
    const payload = action === "approve" ? { actor: "portfolio-reviewer" } : { actor: "portfolio-reviewer", reason: "Needs revision before implementation" };
    try {
      const response = await fetch(`${API_URL}/api/v1/investigations/${investigation.id}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || t("errors.decision"));
      setInvestigation(body); setNotice(action === "approve" ? t("notices.approved") : t("notices.rejected"));
    } catch (error) { setNotice(error instanceof Error ? error.message : t("errors.decision")); }
    finally { setLoading(false); }
  }

  const sourceReport = investigation?.approved_report || investigation?.report;
  const report = sourceReport && locale === "zh-TW" && investigation?.mode === "replay"
    ? replayReportZhTW as Report
    : sourceReport;
  const inProgress = investigation && !terminalStatuses.has(investigation.status);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label={t("navigation.home")}><span className="brand-mark"><Icon name="spark" /></span><span>Task Investigator</span></a>
        <nav aria-label={t("navigation.aria")}><a href="#workspace">{t("navigation.workspace")}</a><a href="#architecture">{t("navigation.architecture")}</a><a href="https://github.com" target="_blank" rel="noreferrer">GitHub <Icon name="arrow" /></a></nav>
        <div className="topbar-actions"><div className="locale-switcher" role="group" aria-label={t("language.label")}><button className={locale === "zh-TW" ? "active" : ""} onClick={() => onLocaleChange("zh-TW")} aria-pressed={locale === "zh-TW"}>{t("language.zh")}</button><button className={locale === "en" ? "active" : ""} onClick={() => onLocaleChange("en")} aria-pressed={locale === "en"}>{t("language.en")}</button></div><span className="build-badge"><span className="live-dot" /> MVP • v0.1</span></div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><Icon name="spark" /> {t("hero.eyebrow")}</div>
        <h1>{t("hero.title")}<br /><em>{t("hero.emphasis")}</em></h1>
        <p>{t("hero.description")}</p>
        <div className="proof-row"><span><Icon name="shield" /> {t("hero.readOnly")}</span><span><Icon name="check" /> {t("hero.approval")}</span><span><Icon name="repo" /> {t("hero.citations")}</span></div>
      </section>

      <section className="workspace" id="workspace">
        <div className="section-heading"><div><span className="section-number">01</span><h2>{t("form.title")}</h2></div><p>{t("form.description")}</p></div>
        <form className="investigation-form" onSubmit={startInvestigation}>
          <label><span><Icon name="repo" /> {t("form.repository")}</span><input value={repository} onChange={(e) => setRepository(e.target.value)} disabled={mode === "replay"} aria-label={t("form.repoAria")} /></label>
          <label className="small-field"><span><Icon name="issue" /> {t("form.issue")}</span><input type="number" min="1" value={issueNumber} onChange={(e) => setIssueNumber(e.target.value)} disabled={mode === "replay"} aria-label={t("form.issueAria")} /></label>
          <label className="small-field"><span><Icon name="branch" /> {t("form.branch")}</span><input value={branch} onChange={(e) => setBranch(e.target.value)} disabled={mode === "replay"} aria-label={t("form.branchAria")} /></label>
          <div className="mode-picker" role="group" aria-label={t("form.modeAria")}><button type="button" className={mode === "replay" ? "selected" : ""} onClick={() => { setMode("replay"); setRepository("demo/frontend-agent-demo-shop"); setIssueNumber("128"); }}>{t("form.replay")}</button><button type="button" className={mode === "live" ? "selected" : ""} onClick={() => setMode("live")}>{t("form.live")}</button></div>
          <button className="run-button" type="submit" disabled={loading}>{loading ? t("form.running") : <><Icon name="spark" /> {t("form.run")}</>}</button>
        </form>
        {notice && <div className="notice" role="status">{notice}</div>}
      </section>

      {(investigation || loading) && <section className="results-shell" aria-live="polite">
        <aside className="timeline-panel">
          <div className="panel-kicker">{t("trace.title")}</div>
          <h3>{investigation ? t("trace.steps", { completed: completedSteps, total: investigation.steps.length }) : t("trace.starting")}</h3>
          <div className="timeline">
            {investigation?.steps.map((step) => <div className={`timeline-step ${step.status}`} key={step.key}>
              <span className="step-marker">{step.status === "completed" ? "✓" : step.status === "running" ? "•" : ""}</span>
              <div><strong>{t(`trace.stepLabels.${step.key}`)}</strong>{step.summary && <p>{locale === "zh-TW" ? t(`trace.stepSummaries.${step.key}`) : step.summary}</p>}{step.duration_ms != null && <small>{(step.duration_ms / 1000).toFixed(2)}s</small>}</div>
            </div>)}
          </div>
          {investigation && <div className="run-meta"><div><span>{t("trace.mode")}</span><strong>{t(`mode.${investigation.mode}`)}</strong></div><div><span>{t("trace.tokens")}</span><strong>{investigation.token_usage.toLocaleString(locale)}</strong></div><div><span>{t("trace.cost")}</span><strong>${investigation.estimated_cost_usd}</strong></div></div>}
        </aside>

        <div className="report-panel">
          <div className="report-tabs"><button className={activeTab === "report" ? "active" : ""} onClick={() => setActiveTab("report")}>{t("report.tab")}</button><button className={activeTab === "trace" ? "active" : ""} onClick={() => setActiveTab("trace")}>{t("report.toolsTab")}</button><span className={`status-pill status-${investigation?.status}`}>{t(`status.${investigation?.status || "queued"}`)}</span></div>
          {investigation?.error && <div className="error-card"><strong>{t("report.stopped")}</strong><p>{investigation.error}</p></div>}
          {!report && !investigation?.error && <div className="analysis-loader"><span /><h3>{inProgress ? t("report.building") : t("report.preparing")}</h3><p>{t("report.gathering")}</p></div>}
          {activeTab === "trace" && investigation && <div className="tool-table">{investigation.tool_calls.map((call, index) => <div key={`${call.tool_name}-${index}`}><code>{call.tool_name}</code><span>{call.duration_ms} ms</span></div>)}</div>}
          {activeTab === "report" && report && <ReportView report={report} />}
          {report && investigation?.status === "waiting_approval" && <div className="approval-bar"><div><span>{t("approval.checkpoint")}</span><strong>{t("approval.description")}</strong></div><button className="reject-button" onClick={() => decide("reject")} disabled={loading}>{t("approval.reject")}</button><button className="approve-button" onClick={() => decide("approve")} disabled={loading}><Icon name="check" /> {t("approval.approve")}</button></div>}
        </div>
      </section>}

      <section className="architecture" id="architecture">
        <div className="section-heading"><div><span className="section-number">02</span><h2>{t("architecture.title")}</h2></div><p>{t("architecture.description")}</p></div>
        <div className="architecture-grid"><article><span>01</span><h3>{t("architecture.toolsTitle")}</h3><p>{t("architecture.toolsBody")}</p></article><article><span>02</span><h3>{t("architecture.groundedTitle")}</h3><p>{t("architecture.groundedBody")}</p></article><article><span>03</span><h3>{t("architecture.controlTitle")}</h3><p>{t("architecture.controlBody")}</p></article></div>
      </section>
      <footer><div className="brand"><span className="brand-mark"><Icon name="spark" /></span><span>Task Investigator</span></div><p>Next.js · FastAPI · OpenAI Responses API · PostgreSQL</p><span>{t("footer")}</span></footer>
    </main>
  );
}

function ReportView({ report }: { report: Report }) {
  const t = useTranslations("App.report");
  return <div className="report-content">
    <section className="summary-block"><span className="report-label">{t("summary")}</span><h2>{report.requirement_summary}</h2><div className="confidence"><span className={`confidence-dot ${report.confidence.level}`} /> <strong>{t("confidence", { level: t(`levels.${report.confidence.level}`) })}</strong><p>{report.confidence.reason}</p></div></section>
    {report.clarification_questions.length > 0 && <section><div className="report-section-title"><span>{t("questions")}</span><b>{report.clarification_questions.length}</b></div><ol className="question-list">{report.clarification_questions.map((question) => <li key={question}>{question}</li>)}</ol></section>}
    <section><div className="report-section-title"><span>{t("files")}</span><b>{report.impacted_files.length}</b></div><div className="file-list">{report.impacted_files.map((file) => <article key={file.path}><div className="file-heading"><code>{file.path}</code><span className={`risk-tag ${file.risk_level}`}>{t(`levels.${file.risk_level}`)}</span></div><p>{file.reason}</p><div className="citations">{file.citations.map((citation) => <CitationLink citation={citation} key={citation.url} />)}</div></article>)}</div></section>
    <section><div className="report-section-title"><span>{t("plan")}</span><b>{report.implementation_tasks.length}</b></div><div className="task-list">{report.implementation_tasks.map((task, index) => <article key={task.title}><span className="task-number">{String(index + 1).padStart(2, "0")}</span><div><h3>{task.title}</h3><p>{task.description}</p><ul>{task.acceptance_criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul><div className="citations">{task.citations.map((citation) => <CitationLink citation={citation} key={citation.url} />)}</div></div></article>)}</div></section>
    <section><div className="report-section-title"><span>{t("risks")}</span><b>{report.risks.length}</b></div><div className="risk-list">{report.risks.map((risk) => <article key={risk.title}><div><span className={`risk-indicator ${risk.severity}`} /><h3>{risk.title}</h3><span className="evidence-tag">{t(`evidence.${risk.evidence_type}`)}</span></div><p>{risk.explanation}</p><div className="citations">{risk.citations.map((citation) => <CitationLink citation={citation} key={citation.url} />)}</div></article>)}</div></section>
  </div>;
}
