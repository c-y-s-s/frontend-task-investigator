"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";

type Citation = { url: string; label: string };
type Report = {
  bug_summary: string; observed_facts: string[]; missing_information: string[]; stop_condition: string;
  confidence: { level: string; reason: string };
  affected_files: { path: string; reason: string; risk_level: string; citations: Citation[] }[];
  hypotheses: { rank: number; title: string; explanation: string; confidence: string; evidence: { source: string; observation: string; citation?: Citation }[] }[];
  verification_actions: { order: number; action: string; expected_signal: string }[];
};
type Step = { key: string; label: string; status: string; summary?: string; duration_ms?: number };
type ToolCall = { tool_name: string; output_summary: Record<string, unknown>; duration_ms: number };
type Investigation = { id: string; status: string; steps: Step[]; tool_calls: ToolCall[]; report?: Report; approved_report?: Report; rejection_reason?: string; error?: string; token_usage: number };
type Locale = "zh-TW" | "en";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const terminal = new Set(["waiting_approval", "approved", "rejected", "failed"]);
const copy = {
  "zh-TW": { title: "先驗證，再修 Bug", intro: "整合錯誤訊號與唯讀 GitHub 證據，提出排序後的可能原因和下一個驗證動作。", bugTitle: "Bug 標題", expected: "預期行為", run: "開始調查", running: "調查中…", safety: "不會自動修改程式碼或建立 PR。", waiting: "等待執行", facts: "已觀察事實", hypotheses: "可能原因（不是已確認根因）", actions: "下一個驗證動作", signal: "預期訊號", missing: "仍缺少的資訊", files: "受影響檔案", tools: "工具呼叫", stop: "停止條件", checkpoint: "先確認證據，再採用調查方向", reject: "證據不足", approve: "核准調查方向", rejectReason: "請說明缺少哪項證據", cancel: "取消", confirmReject: "確認拒絕", stopped: "調查已停止", loading: "正在整理證據", disconnected: "即時連線中斷，請重新執行。" },
  en: { title: "Verify before fixing", intro: "Combine error signals with read-only GitHub evidence to rank likely causes and propose the next verification action.", bugTitle: "Bug title", expected: "Expected behavior", run: "Start investigation", running: "Investigating…", safety: "This workflow never edits code or creates a PR.", waiting: "Waiting", facts: "Observed facts", hypotheses: "Possible causes (not confirmed root causes)", actions: "Next verification actions", signal: "Expected signal", missing: "Missing information", files: "Affected files", tools: "Tool calls", stop: "Stop condition", checkpoint: "Review the evidence before adopting this direction", reject: "Insufficient evidence", approve: "Approve direction", rejectReason: "Describe which evidence is missing", cancel: "Cancel", confirmReject: "Reject direction", stopped: "Investigation stopped", loading: "Organizing evidence", disconnected: "Live updates disconnected. Run the investigation again." },
};

export default function BugInvestigatorPage() {
  const [locale, setLocale] = useState<Locale>("zh-TW");
  const [repository, setRepository] = useState("demo/frontend-agent-demo-shop");
  const [title, setTitle] = useState("付款遇到 503 後立即失敗，沒有自動重試");
  const [errorMessage, setErrorMessage] = useState("PaymentError: provider unavailable");
  const [consoleLog, setConsoleLog] = useState("Payment request failed: retryable=true");
  const [networkContext, setNetworkContext] = useState('POST /api/payments → HTTP 503\n{ "code": "provider_unavailable" }');
  const [expectedBehavior, setExpectedBehavior] = useState("暫時性錯誤最多總共嘗試三次，重試期間顯示目前次數。");
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const [item, setItem] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const events = useRef<EventSource | null>(null);
  const t = copy[locale];

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setNotice(""); setItem(null); setShowReject(false); events.current?.close();
    try {
      const response = await fetch(`${API_URL}/api/v1/bug-investigations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, repository, branch: "main", error_message: errorMessage, console_log: consoleLog, network_context: networkContext, expected_behavior: expectedBehavior, mode, locale }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.detail || "Could not start investigation"); setItem(body);
      const source = new EventSource(`${API_URL}/api/v1/bug-investigations/${body.id}/events`); events.current = source;
      source.addEventListener("investigation", message => { const next = JSON.parse((message as MessageEvent).data) as Investigation; setItem(next); if (terminal.has(next.status)) setLoading(false); });
      source.addEventListener("done", () => { source.close(); setLoading(false); });
      source.onerror = () => { source.close(); setLoading(false); setNotice(t.disconnected); };
    } catch (error) { setLoading(false); setNotice(error instanceof Error ? error.message : "Request failed"); }
  }

  async function decide(action: "approve" | "reject") {
    if (!item) return;
    if (action === "reject" && rejectionReason.trim().length < 3) { setNotice(t.rejectReason); return; }
    const payload = action === "approve" ? { actor: "portfolio-reviewer" } : { actor: "portfolio-reviewer", reason: rejectionReason.trim() };
    const response = await fetch(`${API_URL}/api/v1/bug-investigations/${item.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); if (response.ok) { setItem(body); setShowReject(false); } else setNotice(body.detail || "Request failed");
  }

  const report = item?.approved_report || item?.report;
  return <main>
    <header className="topbar"><Link className="brand" href="/bug-investigator"><span className="brand-mark">!</span><span>Bug Investigator</span></Link><nav className="topbar-actions"><Link className="module-link" href="/">Task Investigator</Link><Link className="module-link" href="/api-analyzer">API Analyzer</Link><div className="locale-switcher"><button className={locale === "zh-TW" ? "active" : ""} onClick={() => setLocale("zh-TW")}>中文</button><button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>EN</button></div></nav></header>
    <section className="workspace bug-workspace"><div className="workspace-heading"><div><span>DEVELOPER TOOL · BUG INVESTIGATOR</span><h1>{t.title}</h1><p>{t.intro}</p></div><div className="bug-scope"><span>READ ONLY</span><b>Evidence → Hypothesis → Verify</b></div></div>
      <form className="bug-form" onSubmit={submit}><div className="bug-form-main"><label><span>{t.bugTitle}</span><input value={title} onChange={e => setTitle(e.target.value)} /></label><div className="bug-row"><label><span>Repository</span><input value={repository} onChange={e => setRepository(e.target.value)} /></label><label><span>{t.expected}</span><input value={expectedBehavior} onChange={e => setExpectedBehavior(e.target.value)} /></label></div><div className="bug-input-grid"><label><span>Error message</span><textarea value={errorMessage} onChange={e => setErrorMessage(e.target.value)} /></label><label><span>Console log</span><textarea value={consoleLog} onChange={e => setConsoleLog(e.target.value)} /></label><label><span>Network Response</span><textarea value={networkContext} onChange={e => setNetworkContext(e.target.value)} /></label></div></div><div className="bug-submit"><div className="mode-picker"><button type="button" className={mode === "replay" ? "selected" : ""} onClick={() => setMode("replay")}>Replay</button><button type="button" className={mode === "live" ? "selected" : ""} onClick={() => setMode("live")}>Live AI</button></div><p>{t.safety}</p><button className="run-button" disabled={loading}>{loading ? t.running : t.run}</button></div></form>{notice && <div className="notice">{notice}</div>}
    </section>
    {item && <section className="bug-results"><aside className="bug-timeline"><div><span>AGENT TRACE</span><b>{item.steps.filter(step => step.status === "completed").length}/{item.steps.length}</b></div>{item.steps.map(step => <article key={step.key} className={step.status}><i>{step.status === "completed" ? "✓" : step.status === "running" ? "●" : "○"}</i><section><strong>{step.label}</strong><p>{step.summary || t.waiting}</p></section><small>{step.duration_ms ? `${(step.duration_ms / 1000).toFixed(2)}s` : ""}</small></article>)}{item.tool_calls.length > 0 && <div className="bug-tools"><span>{t.tools}</span>{item.tool_calls.map((tool, index) => <article key={`${tool.tool_name}-${index}`}><code>{tool.tool_name}</code><small>{tool.duration_ms}ms · {String(tool.output_summary.items ?? tool.output_summary.tokens ?? "—")}</small></article>)}</div>}</aside>
      <div className="bug-report"><div className="bug-report-meta"><span>{item.status.replaceAll("_", " ")}</span><span>{item.token_usage} tokens</span></div>{item.error && <div className="error-card"><strong>{t.stopped}</strong><p>{item.error}</p></div>}{item.rejection_reason && <div className="rejection-note"><strong>{t.reject}</strong><p>{item.rejection_reason}</p></div>}{!report && !item.error && <div className="analysis-loader"><span /><h3>{t.loading}</h3></div>}{report && <><section className="summary-block"><span className="report-label">BUG SUMMARY · {report.confidence.level.toUpperCase()} CONFIDENCE</span><h2>{report.bug_summary}</h2><p>{report.confidence.reason}</p></section>
        <section><div className="report-section-title"><span>{t.facts}</span><b>{report.observed_facts.length}</b></div><ul className="checklist-list">{report.observed_facts.map(fact => <li key={fact}>{fact}</li>)}</ul></section>
        <section><div className="report-section-title"><span>{t.hypotheses}</span><b>{report.hypotheses.length}</b></div><div className="hypothesis-list">{report.hypotheses.map(hypothesis => <article key={hypothesis.rank}><header><b>#{hypothesis.rank}</b><div><h3>{hypothesis.title}</h3><span>{hypothesis.confidence} confidence</span></div></header><p>{hypothesis.explanation}</p><ul>{hypothesis.evidence.map((evidence, index) => <li key={`${evidence.source}-${index}`}><span>{evidence.source}</span>{evidence.observation}{evidence.citation && <> · <a href={evidence.citation.url} target="_blank" rel="noreferrer">{evidence.citation.label} ↗</a></>}</li>)}</ul></article>)}</div></section>
        <section><div className="report-section-title"><span>{t.actions}</span><b>{report.verification_actions.length}</b></div><div className="verification-list">{report.verification_actions.map(action => <article key={action.order}><b>{String(action.order).padStart(2, "0")}</b><div><h3>{action.action}</h3><p>{t.signal}: {action.expected_signal}</p></div></article>)}</div></section>
        <section><div className="report-section-title"><span>{t.files}</span><b>{report.affected_files.length}</b></div><div className="bug-file-list">{report.affected_files.map(file => <article key={file.path}><div><code>{file.path}</code><span>{file.risk_level}</span></div><p>{file.reason}</p>{file.citations.map(citation => <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer">{citation.label} ↗</a>)}</article>)}</div></section>
        {report.missing_information.length > 0 && <section><div className="report-section-title"><span>{t.missing}</span><b>{report.missing_information.length}</b></div><ul className="question-list">{report.missing_information.map(question => <li key={question}>{question}</li>)}</ul></section>}<div className="stop-condition"><strong>{t.stop}</strong><p>{report.stop_condition}</p></div></>}</div>
      {report && item.status === "waiting_approval" && <div className="approval-bar bug-approval"><div><span>HUMAN CHECKPOINT</span><strong>{t.checkpoint}</strong></div>{showReject ? <div className="reject-reason"><input value={rejectionReason} placeholder={t.rejectReason} onChange={e => setRejectionReason(e.target.value)} /><button className="reject-button" onClick={() => setShowReject(false)}>{t.cancel}</button><button className="approve-button" onClick={() => decide("reject")}>{t.confirmReject}</button></div> : <><button className="reject-button" onClick={() => setShowReject(true)}>{t.reject}</button><button className="approve-button" onClick={() => decide("approve")}>{t.approve}</button></>}</div>}
    </section>}
  </main>;
}
