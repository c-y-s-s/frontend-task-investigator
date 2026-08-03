"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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
    source.onerror = () => { source.close(); setLoading(false); setNotice("Live updates disconnected. Refresh the analysis to try again."); };
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
      if (!response.ok) throw new Error(body.detail || "Could not start investigation");
      setInvestigation(body); subscribe(body.id);
    } catch (error) {
      setLoading(false); setNotice(error instanceof Error ? error.message : "Could not reach the API");
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
      if (!response.ok) throw new Error(body.detail || "Decision failed");
      setInvestigation(body); setNotice(action === "approve" ? "Draft approved and recorded in the audit log." : "Draft rejected and recorded in the audit log.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Decision failed"); }
    finally { setLoading(false); }
  }

  const report = investigation?.approved_report || investigation?.report;
  const inProgress = investigation && !terminalStatuses.has(investigation.status);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Task Investigator home"><span className="brand-mark"><Icon name="spark" /></span><span>Task Investigator</span></a>
        <nav aria-label="Primary navigation"><a href="#workspace">Workspace</a><a href="#architecture">Architecture</a><a href="https://github.com" target="_blank" rel="noreferrer">GitHub <Icon name="arrow" /></a></nav>
        <span className="build-badge"><span className="live-dot" /> MVP • v0.1</span>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><Icon name="spark" /> AGENT-POWERED ENGINEERING WORKFLOW</div>
        <h1>Turn a GitHub Issue into an<br /><em>evidence-backed plan.</em></h1>
        <p>Investigate requirements across code, pull requests, and CI. Review every claim, then approve the implementation draft.</p>
        <div className="proof-row"><span><Icon name="shield" /> Read-only tools</span><span><Icon name="check" /> Human approval</span><span><Icon name="repo" /> Source citations</span></div>
      </section>

      <section className="workspace" id="workspace">
        <div className="section-heading"><div><span className="section-number">01</span><h2>Start an investigation</h2></div><p>Use the replay case for a zero-cost, deterministic walkthrough.</p></div>
        <form className="investigation-form" onSubmit={startInvestigation}>
          <label><span><Icon name="repo" /> Repository</span><input value={repository} onChange={(e) => setRepository(e.target.value)} disabled={mode === "replay"} aria-label="GitHub repository" /></label>
          <label className="small-field"><span><Icon name="issue" /> Issue</span><input type="number" min="1" value={issueNumber} onChange={(e) => setIssueNumber(e.target.value)} disabled={mode === "replay"} aria-label="Issue number" /></label>
          <label className="small-field"><span><Icon name="branch" /> Branch</span><input value={branch} onChange={(e) => setBranch(e.target.value)} disabled={mode === "replay"} aria-label="Branch" /></label>
          <div className="mode-picker" role="group" aria-label="Analysis mode"><button type="button" className={mode === "replay" ? "selected" : ""} onClick={() => { setMode("replay"); setRepository("demo/frontend-agent-demo-shop"); setIssueNumber("128"); }}>Replay</button><button type="button" className={mode === "live" ? "selected" : ""} onClick={() => setMode("live")}>Live</button></div>
          <button className="run-button" type="submit" disabled={loading}>{loading ? "Investigating…" : <><Icon name="spark" /> Run analysis</>}</button>
        </form>
        {notice && <div className="notice" role="status">{notice}</div>}
      </section>

      {(investigation || loading) && <section className="results-shell" aria-live="polite">
        <aside className="timeline-panel">
          <div className="panel-kicker">AGENT TRACE</div>
          <h3>{investigation ? `${completedSteps}/${investigation.steps.length} steps` : "Starting…"}</h3>
          <div className="timeline">
            {investigation?.steps.map((step) => <div className={`timeline-step ${step.status}`} key={step.key}>
              <span className="step-marker">{step.status === "completed" ? "✓" : step.status === "running" ? "•" : ""}</span>
              <div><strong>{step.label}</strong>{step.summary && <p>{step.summary}</p>}{step.duration_ms != null && <small>{(step.duration_ms / 1000).toFixed(2)}s</small>}</div>
            </div>)}
          </div>
          {investigation && <div className="run-meta"><div><span>Mode</span><strong>{investigation.mode}</strong></div><div><span>Tokens</span><strong>{investigation.token_usage.toLocaleString()}</strong></div><div><span>Est. cost</span><strong>${investigation.estimated_cost_usd}</strong></div></div>}
        </aside>

        <div className="report-panel">
          <div className="report-tabs"><button className={activeTab === "report" ? "active" : ""} onClick={() => setActiveTab("report")}>Investigation report</button><button className={activeTab === "trace" ? "active" : ""} onClick={() => setActiveTab("trace")}>Tool calls</button><span className={`status-pill status-${investigation?.status}`}>{(investigation?.status || "queued").replaceAll("_", " ")}</span></div>
          {investigation?.error && <div className="error-card"><strong>Investigation stopped</strong><p>{investigation.error}</p></div>}
          {!report && !investigation?.error && <div className="analysis-loader"><span /><h3>{inProgress ? "Building an evidence graph…" : "Preparing analysis…"}</h3><p>The agent is gathering only the context it needs.</p></div>}
          {activeTab === "trace" && investigation && <div className="tool-table">{investigation.tool_calls.map((call, index) => <div key={`${call.tool_name}-${index}`}><code>{call.tool_name}</code><span>{call.duration_ms} ms</span></div>)}</div>}
          {activeTab === "report" && report && <ReportView report={report} />}
          {report && investigation?.status === "waiting_approval" && <div className="approval-bar"><div><span>HUMAN CHECKPOINT</span><strong>Review the evidence before accepting this draft.</strong></div><button className="reject-button" onClick={() => decide("reject")} disabled={loading}>Reject</button><button className="approve-button" onClick={() => decide("approve")} disabled={loading}><Icon name="check" /> Approve draft</button></div>}
        </div>
      </section>}

      <section className="architecture" id="architecture">
        <div className="section-heading"><div><span className="section-number">02</span><h2>Built for explainability</h2></div><p>One bounded workflow. Every transition is observable.</p></div>
        <div className="architecture-grid"><article><span>01</span><h3>Constrained tools</h3><p>The model selects only backend-defined, read-only GitHub operations.</p></article><article><span>02</span><h3>Grounded output</h3><p>Files, tasks, and risks require citations or an explicit inference label.</p></article><article><span>03</span><h3>Human control</h3><p>No external state changes. Approval records a reviewed draft and audit event.</p></article></div>
      </section>
      <footer><div className="brand"><span className="brand-mark"><Icon name="spark" /></span><span>Task Investigator</span></div><p>Next.js · FastAPI · OpenAI Responses API · PostgreSQL</p><span>Portfolio MVP / 2026</span></footer>
    </main>
  );
}

function ReportView({ report }: { report: Report }) {
  return <div className="report-content">
    <section className="summary-block"><span className="report-label">REQUIREMENT SUMMARY</span><h2>{report.requirement_summary}</h2><div className="confidence"><span className={`confidence-dot ${report.confidence.level}`} /> <strong>{report.confidence.level} confidence</strong><p>{report.confidence.reason}</p></div></section>
    {report.clarification_questions.length > 0 && <section><div className="report-section-title"><span>Open questions</span><b>{report.clarification_questions.length}</b></div><ol className="question-list">{report.clarification_questions.map((question) => <li key={question}>{question}</li>)}</ol></section>}
    <section><div className="report-section-title"><span>Impacted files</span><b>{report.impacted_files.length}</b></div><div className="file-list">{report.impacted_files.map((file) => <article key={file.path}><div className="file-heading"><code>{file.path}</code><span className={`risk-tag ${file.risk_level}`}>{file.risk_level}</span></div><p>{file.reason}</p><div className="citations">{file.citations.map((citation) => <CitationLink citation={citation} key={citation.url} />)}</div></article>)}</div></section>
    <section><div className="report-section-title"><span>Implementation plan</span><b>{report.implementation_tasks.length}</b></div><div className="task-list">{report.implementation_tasks.map((task, index) => <article key={task.title}><span className="task-number">{String(index + 1).padStart(2, "0")}</span><div><h3>{task.title}</h3><p>{task.description}</p><ul>{task.acceptance_criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul><div className="citations">{task.citations.map((citation) => <CitationLink citation={citation} key={citation.url} />)}</div></div></article>)}</div></section>
    <section><div className="report-section-title"><span>Risk register</span><b>{report.risks.length}</b></div><div className="risk-list">{report.risks.map((risk) => <article key={risk.title}><div><span className={`risk-indicator ${risk.severity}`} /><h3>{risk.title}</h3><span className="evidence-tag">{risk.evidence_type}</span></div><p>{risk.explanation}</p><div className="citations">{risk.citations.map((citation) => <CitationLink citation={citation} key={citation.url} />)}</div></article>)}</div></section>
  </div>;
}

