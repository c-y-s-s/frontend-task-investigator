"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";

type Locale = "zh-TW" | "en";
type Endpoint = { method: string; path: string; summary: string; responses: string[]; request_fields: string[] };
type Finding = { severity: string; title: string; explanation: string; location: string };
type Report = { api_title: string; api_version: string; summary: string; endpoints: Endpoint[]; findings: Finding[]; clarification_questions: string[]; frontend_checklist: string[]; confidence: { reason: string } };
type Analysis = { id: string; status: string; report?: Report; approved_report?: Report; error?: string; token_usage: number };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SAMPLE = `{
  "openapi": "3.0.3",
  "info": {
    "title": "Demo Orders API",
    "version": "1.0.0"
  },
  "paths": {
    "/orders": {
      "get": {
        "summary": "List orders",
        "responses": {
          "200": { "description": "Orders" }
        }
      },
      "post": {
        "operationId": "createOrder",
        "summary": "Create an order",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "productId": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "201": { "description": "Created" },
          "400": { "description": "Invalid request" }
        }
      }
    }
  }
}`;

const copy = {
  "zh-TW": { title: "分析 API 規格", description: "貼上 OpenAPI JSON 或 YAML，取得前端串接所需的契約、缺漏與檢查清單。", source: "OpenAPI 文件", run: "開始分析", running: "分析中…", replay: "Replay", live: "Live AI", endpoints: "Endpoints", findings: "契約缺漏", questions: "待確認問題", checklist: "前端串接清單", approve: "核准報告", reject: "拒絕", back: "Task Investigator", waiting: "等待人工核准", tokens: "Tokens" },
  en: { title: "Analyze an API contract", description: "Paste OpenAPI JSON or YAML to identify endpoints, contract gaps, and frontend integration work.", source: "OpenAPI document", run: "Run analysis", running: "Analyzing…", replay: "Replay", live: "Live AI", endpoints: "Endpoints", findings: "Contract gaps", questions: "Questions", checklist: "Frontend checklist", approve: "Approve report", reject: "Reject", back: "Task Investigator", waiting: "Waiting for approval", tokens: "Tokens" },
};

export default function ApiAnalyzerPage() {
  const [locale, setLocale] = useState<Locale>("zh-TW");
  const [document, setDocument] = useState(SAMPLE);
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const source = useRef<EventSource | null>(null);
  const t = copy[locale];

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setNotice(""); setAnalysis(null); source.current?.close();
    try {
      const response = await fetch(`${API_URL}/api/v1/api-analyses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document, mode, locale }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "Could not start analysis");
      setAnalysis(body);
      const events = new EventSource(`${API_URL}/api/v1/api-analyses/${body.id}/events`); source.current = events;
      events.addEventListener("analysis", (message) => { const next = JSON.parse((message as MessageEvent).data) as Analysis; setAnalysis(next); if (["waiting_approval", "approved", "rejected", "failed"].includes(next.status)) setLoading(false); });
      events.addEventListener("done", () => { events.close(); setLoading(false); });
      events.onerror = () => { events.close(); setLoading(false); };
    } catch (error) { setLoading(false); setNotice(error instanceof Error ? error.message : "Request failed"); }
  }

  async function decide(action: "approve" | "reject") {
    if (!analysis) return;
    const payload = action === "approve" ? { actor: "portfolio-reviewer" } : { actor: "portfolio-reviewer", reason: "Needs API contract clarification" };
    const response = await fetch(`${API_URL}/api/v1/api-analyses/${analysis.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (response.ok) setAnalysis(body); else setNotice(body.detail || "Request failed");
  }

  const report = analysis?.approved_report || analysis?.report;
  return <main>
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">✦</span><span>API Analyzer</span></Link><div className="topbar-actions"><Link className="module-link" href="/">{t.back}</Link><div className="locale-switcher"><button className={locale === "zh-TW" ? "active" : ""} onClick={() => setLocale("zh-TW")}>中文</button><button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>EN</button></div></div></header>
    <section className="workspace api-workspace"><div className="workspace-heading"><div><span>API CONTRACT AGENT</span><h1>{t.title}</h1><p>{t.description}</p></div></div><form className="api-form" onSubmit={submit}><label><span>{t.source}</span><textarea value={document} onChange={(event) => setDocument(event.target.value)} spellCheck={false} /></label><div className="api-form-actions"><div className="mode-picker"><button type="button" className={mode === "replay" ? "selected" : ""} onClick={() => setMode("replay")}>{t.replay}</button><button type="button" className={mode === "live" ? "selected" : ""} onClick={() => setMode("live")}>{t.live}</button></div><button className="run-button" disabled={loading}>{loading ? t.running : t.run}</button></div></form>{notice && <div className="notice">{notice}</div>}</section>
    {(analysis || loading) && <section className="api-results"><div className="api-status"><span className={`status-pill status-${analysis?.status}`}>{analysis?.status || "queued"}</span><span>{t.tokens}: {analysis?.token_usage || 0}</span></div>{analysis?.error && <div className="error-card"><strong>Analysis stopped</strong><p>{analysis.error}</p></div>}{!report && !analysis?.error && <div className="analysis-loader"><span /><h3>{t.running}</h3></div>}{report && <div className="api-report"><section className="summary-block"><span className="report-label">{report.api_title} · {report.api_version}</span><h2>{report.summary}</h2><p>{report.confidence.reason}</p></section><section><div className="report-section-title"><span>{t.endpoints}</span><b>{report.endpoints.length}</b></div><div className="endpoint-list">{report.endpoints.map((item) => <article key={`${item.method}-${item.path}`}><div><code className="method">{item.method}</code><code>{item.path}</code></div><h3>{item.summary}</h3><p>Responses: {item.responses.join(", ") || "—"}</p><small>{item.request_fields.join(" · ") || "No request fields"}</small></article>)}</div></section><section><div className="report-section-title"><span>{t.findings}</span><b>{report.findings.length}</b></div><div className="risk-list">{report.findings.map((item) => <article key={`${item.location}-${item.title}`}><div><span className={`risk-indicator ${item.severity}`} /><h3>{item.title}</h3></div><p>{item.explanation}</p><code>{item.location}</code></article>)}</div></section><section className="api-two-columns"><div><div className="report-section-title"><span>{t.questions}</span><b>{report.clarification_questions.length}</b></div><ol className="question-list">{report.clarification_questions.map((item) => <li key={item}>{item}</li>)}</ol></div><div><div className="report-section-title"><span>{t.checklist}</span><b>{report.frontend_checklist.length}</b></div><ul className="question-list">{report.frontend_checklist.map((item) => <li key={item}>{item}</li>)}</ul></div></section></div>}{report && analysis?.status === "waiting_approval" && <div className="approval-bar"><div><span>HUMAN CHECKPOINT</span><strong>{t.waiting}</strong></div><button className="reject-button" onClick={() => decide("reject")}>{t.reject}</button><button className="approve-button" onClick={() => decide("approve")}>{t.approve}</button></div>}</section>}
  </main>;
}
