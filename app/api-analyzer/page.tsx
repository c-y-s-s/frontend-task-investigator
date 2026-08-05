"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";

type Locale = "zh-TW" | "en";
type Endpoint = { method: string; path: string; summary: string; responses: string[]; request_fields: string[] };
type Finding = { severity: string; title: string; explanation: string; location: string };
type ResponseField = { path: string; inferred_type: string; nullable: boolean };
type Report = { analysis_type: "response" | "openapi"; api_title: string; api_version: string; summary: string; endpoints: Endpoint[]; findings: Finding[]; clarification_questions: string[]; frontend_checklist: string[]; response_fields: ResponseField[]; typescript_draft: string; privacy_warnings: string[]; confidence: { reason: string } };
type Analysis = { id: string; status: string; report?: Report; approved_report?: Report; error?: string; token_usage: number };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const RESPONSE_SAMPLE = `{
  "data": [
    {
      "id": 2,
      "application_kind": "personal",
      "name": "Demo User",
      "email": "demo@example.com",
      "company": null,
      "mail_status": "sent",
      "created_at": "2026-07-31T13:49:07+08:00"
    },
    {
      "id": 1,
      "application_kind": "company",
      "name": "Sample Company",
      "email": "company@example.com",
      "company": "Example Ltd.",
      "mail_status": "sent",
      "created_at": "2026-07-31T13:48:31+08:00"
    }
  ],
  "meta": {
    "current_page": 1,
    "page_size": 30,
    "total": 2,
    "total_pages": 1
  }
}`;

const OPENAPI_SAMPLE = `{
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
  "zh-TW": { title: "API Response 分析台", description: "貼上回應資料，快速整理型別、空值、分頁與前端風險。", source: "Response JSON", openapiSource: "OpenAPI 文件", purpose: "功能用途", purposeHint: "例如：管理後台申請列表，支援分頁與狀態查看。", inputResponse: "Response JSON", inputOpenapi: "OpenAPI Document", method: "Method", path: "API Path", fields: "Response 欄位", privacy: "個資風險欄位", typeDraft: "TypeScript 型別草稿", run: "開始分析", running: "分析中…", replay: "Replay", live: "Live AI", endpoints: "Endpoints", findings: "分析發現", questions: "待確認問題", checklist: "前端串接清單", approve: "核准報告", reject: "拒絕", back: "Task Investigator", waiting: "等待人工核准", tokens: "Tokens", guideTitle: "這次會得到什麼", guideItems: ["欄位型別與 nullable 判斷", "分頁結構與個資風險", "TypeScript 草稿與待確認問題"], privacyNote: "Live AI 前會先遮罩常見個資值，原始 JSON 分析後不保留。", copyQuestions: "複製問題", copied: "待確認問題已複製", questionHelp: "交給後端或 PM 確認；取得答案後更新 API 規格或功能用途，再重新分析。" },
  en: { title: "API Response workspace", description: "Paste response data to map types, nullability, pagination, and frontend risks.", source: "Response JSON", openapiSource: "OpenAPI document", purpose: "Feature purpose", purposeHint: "Example: Admin application list with pagination and status display.", inputResponse: "Response JSON", inputOpenapi: "OpenAPI Document", method: "Method", path: "API path", fields: "Response fields", privacy: "Personal-data fields", typeDraft: "TypeScript type draft", run: "Run analysis", running: "Analyzing…", replay: "Replay", live: "Live AI", endpoints: "Endpoints", findings: "Findings", questions: "Questions", checklist: "Frontend checklist", approve: "Approve report", reject: "Reject", back: "Task Investigator", waiting: "Waiting for approval", tokens: "Tokens", guideTitle: "What you will get", guideItems: ["Field types and nullable detection", "Pagination and personal-data risks", "TypeScript draft and open questions"], privacyNote: "Common personal values are redacted before Live AI and the original JSON is not retained.", copyQuestions: "Copy questions", copied: "Questions copied", questionHelp: "Send these to the backend engineer or PM. Update the contract or purpose with their answers, then run the analysis again." },
};

export default function ApiAnalyzerPage() {
  const [locale, setLocale] = useState<Locale>("zh-TW");
  const [inputType, setInputType] = useState<"response" | "openapi">("response");
  const [document, setDocument] = useState(RESPONSE_SAMPLE);
  const [purpose, setPurpose] = useState("在管理後台顯示申請列表，支援分頁與狀態查看。");
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/applications");
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const source = useRef<EventSource | null>(null);
  const t = copy[locale];

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setNotice(""); setAnalysis(null); source.current?.close();
    try {
      const response = await fetch(`${API_URL}/api/v1/api-analyses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document, input_type: inputType, purpose: inputType === "response" ? purpose : "", method: inputType === "response" && method ? method : null, path: inputType === "response" && path ? path : null, mode, locale }) });
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

  async function copyQuestions(items: string[]) {
    await navigator.clipboard.writeText(items.map((item, index) => `${index + 1}. ${item}`).join("\n"));
    setNotice(t.copied);
  }

  const report = analysis?.approved_report || analysis?.report;
  return <main>
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">✦</span><span>API Analyzer</span></Link><div className="topbar-actions"><Link className="module-link" href="/">{t.back}</Link><div className="locale-switcher"><button className={locale === "zh-TW" ? "active" : ""} onClick={() => setLocale("zh-TW")}>中文</button><button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>EN</button></div></div></header>
    <section className="workspace api-workspace"><div className="workspace-heading api-heading"><div><span>DEVELOPER TOOL · API ANALYZER</span><h1>{t.title}</h1><p>{t.description}</p></div><div className="api-heading-badge"><i /> OpenAPI 3.x · JSON</div></div><div className="api-editor-layout"><form className="api-form" onSubmit={submit}>
      <div className="api-input-type"><button type="button" className={inputType === "response" ? "selected" : ""} onClick={() => { setInputType("response"); setDocument(RESPONSE_SAMPLE); }}>{t.inputResponse}</button><button type="button" className={inputType === "openapi" ? "selected" : ""} onClick={() => { setInputType("openapi"); setDocument(OPENAPI_SAMPLE); }}>{t.inputOpenapi}</button></div>
      {inputType === "response" && <div className="api-context"><label><span>{t.purpose}</span><input value={purpose} maxLength={500} placeholder={t.purposeHint} onChange={(event) => setPurpose(event.target.value)} /></label><label><span>{t.method}</span><select value={method} onChange={(event) => setMethod(event.target.value)}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label><label><span>{t.path}</span><input value={path} placeholder="/applications" onChange={(event) => setPath(event.target.value)} /></label></div>}
      <label><span>{inputType === "response" ? t.source : t.openapiSource}</span><textarea value={document} onChange={(event) => setDocument(event.target.value)} spellCheck={false} /></label><div className="api-form-actions"><div className="mode-picker"><button type="button" className={mode === "replay" ? "selected" : ""} onClick={() => setMode("replay")}>{t.replay}</button><button type="button" className={mode === "live" ? "selected" : ""} onClick={() => setMode("live")}>{t.live}</button></div><button className="run-button" disabled={loading}>{loading ? t.running : t.run}</button></div></form><aside className="api-guide"><div className="api-guide-icon">{"{}"}</div><span>ANALYSIS OUTPUT</span><h2>{t.guideTitle}</h2><ol>{t.guideItems.map((item, index) => <li key={item}><b>{String(index + 1).padStart(2, "0")}</b><p>{item}</p></li>)}</ol><div className="api-privacy-note"><strong>◆ PRIVACY</strong><p>{t.privacyNote}</p></div></aside></div>{notice && <div className="notice">{notice}</div>}</section>
    {(analysis || loading) && <section className="api-results">
      <div className="api-status"><span className={`status-pill status-${analysis?.status}`}>{analysis?.status || "queued"}</span><span>{t.tokens}: {analysis?.token_usage || 0}</span></div>
      {analysis?.error && <div className="error-card"><strong>Analysis stopped</strong><p>{analysis.error}</p></div>}
      {!report && !analysis?.error && <div className="analysis-loader"><span /><h3>{t.running}</h3></div>}
      {report && <div className="api-report">
        <section className="summary-block"><span className="report-label">{report.api_title} · {report.api_version}</span><h2>{report.summary}</h2><p>{report.confidence.reason}</p></section>
        {report.analysis_type === "response" && <><section><div className="report-section-title"><span>{t.fields}</span><b>{report.response_fields.length}</b></div><div className="response-field-list">{report.response_fields.map((field) => <div key={field.path}><code>{field.path}</code><span>{field.inferred_type}{field.nullable ? " · nullable" : ""}</span></div>)}</div></section><section className="api-two-columns"><div><div className="report-section-title"><span>{t.typeDraft}</span></div><pre className="type-draft"><code>{report.typescript_draft}</code></pre></div><div><div className="report-section-title"><span>{t.privacy}</span><b>{report.privacy_warnings.length}</b></div><ul className="question-list">{report.privacy_warnings.map((field) => <li key={field}><code>{field}</code></li>)}</ul></div></section></>}
        {report.endpoints.length > 0 && <section><div className="report-section-title"><span>{t.endpoints}</span><b>{report.endpoints.length}</b></div><div className="endpoint-list">{report.endpoints.map((item) => <article key={`${item.method}-${item.path}`}><div><code className="method">{item.method}</code><code>{item.path}</code></div><h3>{item.summary}</h3><p>Responses: {item.responses.join(", ") || "—"}</p><small>{item.request_fields.join(" · ") || "No request fields"}</small></article>)}</div></section>}
        <section><div className="report-section-title"><span>{t.findings}</span><b>{report.findings.length}</b></div><div className="risk-list">{report.findings.map((item) => <article key={`${item.location}-${item.title}`}><div><span className={`risk-indicator ${item.severity}`} /><h3>{item.title}</h3></div><p>{item.explanation}</p><code>{item.location}</code></article>)}</div></section>
        <section className="api-two-columns"><div><div className="report-section-title question-heading"><span>{t.questions}</span><div><b>{report.clarification_questions.length}</b><button onClick={() => copyQuestions(report.clarification_questions)}>{t.copyQuestions}</button></div></div><p className="question-help">{t.questionHelp}</p><ol className="question-list">{report.clarification_questions.map((item) => <li key={item}>{item}</li>)}</ol></div><div><div className="report-section-title"><span>{t.checklist}</span><b>{report.frontend_checklist.length}</b></div><ul className="question-list checklist-list">{report.frontend_checklist.map((item) => <li key={item}>{item}</li>)}</ul></div></section>
      </div>}
      {report && analysis?.status === "waiting_approval" && <div className="approval-bar"><div><span>HUMAN CHECKPOINT</span><strong>{t.waiting}</strong></div><button className="reject-button" onClick={() => decide("reject")}>{t.reject}</button><button className="approve-button" onClick={() => decide("approve")}>{t.approve}</button></div>}
    </section>}
  </main>;
}
