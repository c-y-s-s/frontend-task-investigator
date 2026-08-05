"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";

type Citation = { url: string; label: string };
type Report = {
  bug_summary: string; observed_facts: string[]; missing_information: string[]; stop_condition: string;
  confidence: { level: string; reason: string };
  affected_files: { path: string; reason: string; risk_level: string; citations: Citation[] }[];
  hypotheses: { rank: number; title: string; explanation: string; confidence: string; evidence: { source: string; observation: string; citation?: Citation }[] }[];
  verification_actions: { order: number; action: string; expected_signal: string; related_hypothesis_rank: number }[];
};
type Investigation = { id: string; status: string; steps: { key: string; label: string; status: string; summary?: string; duration_ms?: number }[]; report?: Report; approved_report?: Report; error?: string; token_usage: number };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function BugInvestigatorPage() {
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
  const events = useRef<EventSource | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setNotice(""); setItem(null); events.current?.close();
    try {
      const response = await fetch(`${API_URL}/api/v1/bug-investigations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, repository, branch: "main", error_message: errorMessage, console_log: consoleLog, network_context: networkContext, expected_behavior: expectedBehavior, mode, locale: "zh-TW" }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.detail || "無法開始調查"); setItem(body);
      const source = new EventSource(`${API_URL}/api/v1/bug-investigations/${body.id}/events`); events.current = source;
      source.addEventListener("investigation", (message) => { const next = JSON.parse((message as MessageEvent).data); setItem(next); if (["waiting_approval", "approved", "rejected", "failed"].includes(next.status)) setLoading(false); });
      source.addEventListener("done", () => { source.close(); setLoading(false); }); source.onerror = () => { source.close(); setLoading(false); };
    } catch (error) { setLoading(false); setNotice(error instanceof Error ? error.message : "請求失敗"); }
  }

  async function decide(action: "approve" | "reject") {
    if (!item) return;
    const payload = action === "approve" ? { actor: "portfolio-reviewer" } : { actor: "portfolio-reviewer", reason: "需要更多證據" };
    const response = await fetch(`${API_URL}/api/v1/bug-investigations/${item.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); if (response.ok) setItem(body); else setNotice(body.detail || "操作失敗");
  }

  const report = item?.approved_report || item?.report;
  return <main>
    <header className="topbar"><Link className="brand" href="/bug-investigator"><span className="brand-mark">!</span><span>Bug Investigator</span></Link><nav className="topbar-actions"><Link className="module-link" href="/">Task Investigator</Link><Link className="module-link" href="/api-analyzer">API Analyzer</Link></nav></header>
    <section className="workspace bug-workspace"><div className="workspace-heading"><div><span>DEVELOPER TOOL · BUG INVESTIGATOR</span><h1>先驗證，再修 Bug</h1><p>整合錯誤訊號與唯讀 GitHub 證據，提出排序後的可能原因和下一個驗證動作。</p></div></div>
      <form className="bug-form" onSubmit={submit}><div className="bug-form-main">
        <label><span>Bug 標題</span><input value={title} onChange={e => setTitle(e.target.value)} /></label>
        <div className="bug-row"><label><span>Repository</span><input value={repository} onChange={e => setRepository(e.target.value)} /></label><label><span>預期行為</span><input value={expectedBehavior} onChange={e => setExpectedBehavior(e.target.value)} /></label></div>
        <div className="bug-input-grid"><label><span>Error message</span><textarea value={errorMessage} onChange={e => setErrorMessage(e.target.value)} /></label><label><span>Console log</span><textarea value={consoleLog} onChange={e => setConsoleLog(e.target.value)} /></label><label><span>Network Response</span><textarea value={networkContext} onChange={e => setNetworkContext(e.target.value)} /></label></div>
      </div><div className="bug-submit"><div className="mode-picker"><button type="button" className={mode === "replay" ? "selected" : ""} onClick={() => setMode("replay")}>Replay</button><button type="button" className={mode === "live" ? "selected" : ""} onClick={() => setMode("live")}>Live AI</button></div><p>不會自動修改程式碼或建立 PR。</p><button className="run-button" disabled={loading}>{loading ? "調查中…" : "開始調查"}</button></div></form>{notice && <div className="notice">{notice}</div>}
    </section>
    {item && <section className="bug-results"><aside className="bug-timeline"><div><span>AGENT TRACE</span><b>{item.steps.filter(s => s.status === "completed").length}/{item.steps.length}</b></div>{item.steps.map(step => <article key={step.key} className={step.status}><i>{step.status === "completed" ? "✓" : step.status === "running" ? "●" : "○"}</i><section><strong>{step.label}</strong><p>{step.summary || "等待執行"}</p></section><small>{step.duration_ms ? `${(step.duration_ms / 1000).toFixed(2)}s` : ""}</small></article>)}</aside>
      <div className="bug-report">{item.error && <div className="error-card"><strong>調查已停止</strong><p>{item.error}</p></div>}{!report && !item.error && <div className="analysis-loader"><span /><h3>正在整理證據</h3></div>}{report && <>
        <section className="summary-block"><span className="report-label">BUG SUMMARY · {report.confidence.level.toUpperCase()} CONFIDENCE</span><h2>{report.bug_summary}</h2><p>{report.confidence.reason}</p></section>
        <section><div className="report-section-title"><span>已觀察事實</span><b>{report.observed_facts.length}</b></div><ul className="checklist-list">{report.observed_facts.map(x => <li key={x}>{x}</li>)}</ul></section>
        <section><div className="report-section-title"><span>可能原因（不是已確認根因）</span><b>{report.hypotheses.length}</b></div><div className="hypothesis-list">{report.hypotheses.map(h => <article key={h.rank}><header><b>#{h.rank}</b><div><h3>{h.title}</h3><span>{h.confidence} confidence</span></div></header><p>{h.explanation}</p><ul>{h.evidence.map((e, i) => <li key={`${e.source}-${i}`}><span>{e.source}</span>{e.observation}{e.citation && <> · <a href={e.citation.url} target="_blank" rel="noreferrer">{e.citation.label} ↗</a></>}</li>)}</ul></article>)}</div></section>
        <section><div className="report-section-title"><span>下一個驗證動作</span><b>{report.verification_actions.length}</b></div><div className="verification-list">{report.verification_actions.map(a => <article key={a.order}><b>{String(a.order).padStart(2, "0")}</b><div><h3>{a.action}</h3><p>預期訊號：{a.expected_signal}</p></div></article>)}</div></section>
        {report.missing_information.length > 0 && <section><div className="report-section-title"><span>仍缺少的資訊</span><b>{report.missing_information.length}</b></div><ul className="question-list">{report.missing_information.map(x => <li key={x}>{x}</li>)}</ul></section>}
        <div className="stop-condition"><strong>停止條件</strong><p>{report.stop_condition}</p></div>
      </>}</div>
      {report && item.status === "waiting_approval" && <div className="approval-bar bug-approval"><div><span>HUMAN CHECKPOINT</span><strong>先確認證據，再採用調查方向</strong></div><button className="reject-button" onClick={() => decide("reject")}>證據不足</button><button className="approve-button" onClick={() => decide("approve")}>核准調查方向</button></div>}
    </section>}
  </main>;
}
