"use client";

import { FormEvent, useRef, useState } from "react";
import { WorkspaceBanner } from "../components/WorkspaceBanner";
import { WorkspaceHeader } from "../components/WorkspaceHeader";

type Citation = { url: string; label: string };
type Report = {
  bug_summary: string;
  observed_facts: string[];
  missing_information: string[];
  stop_condition: string;
  confidence: { level: string; reason: string };
  affected_files: {
    path: string;
    reason: string;
    risk_level: string;
    citations: Citation[];
  }[];
  hypotheses: {
    rank: number;
    title: string;
    explanation: string;
    confidence: string;
    evidence: { source: string; observation: string; citation?: Citation }[];
  }[];
  verification_actions: {
    order: number;
    action: string;
    expected_signal: string;
  }[];
};
type Step = {
  key: string;
  label: string;
  status: string;
  summary?: string;
  duration_ms?: number;
};
type ToolCall = {
  tool_name: string;
  output_summary: Record<string, unknown>;
  duration_ms: number;
};
type Investigation = {
  id: string;
  status: string;
  steps: Step[];
  tool_calls: ToolCall[];
  report?: Report;
  approved_report?: Report;
  rejection_reason?: string;
  error?: string;
  token_usage: number;
};
type Locale = "zh-TW" | "en";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const REPLAY_REPOSITORY = "demo/frontend-agent-demo-shop";
const LIVE_REPOSITORY =
  process.env.NEXT_PUBLIC_LIVE_DEMO_REPOSITORY ||
  "c-y-s-s/frontend-agent-demo-shop";
const terminal = new Set([
  "waiting_approval",
  "approved",
  "rejected",
  "failed",
]);
const samples = {
  "zh-TW": `readCart 遇到損壞的購物車 JSON 時會拋出 SyntaxError

預期：資料損壞時應回傳 null，不應中斷流程。

錯誤：SyntaxError: Unexpected token 'b', "broken-cart-data" is not valid JSON
at JSON.parse
at readCart (src/cart/cartStorage.ts:6)

這是 localStorage 解析錯誤，沒有 Network Request。`,
  en: `readCart throws SyntaxError for malformed cart JSON

Expected: Return null for corrupted data without interrupting the flow.

Error: SyntaxError: Unexpected token 'b', "broken-cart-data" is not valid JSON
at JSON.parse
at readCart (src/cart/cartStorage.ts:6)

This is a localStorage parsing failure. No network request was made.`,
};
const copy = {
  "zh-TW": {
    title: "貼上錯誤，先找出下一步",
    intro:
      "不用先分類 Console 或 Network。把你知道的內容全部貼進來，Agent 會整理證據並提出可驗證的方向。",
    input: "問題與錯誤資訊",
    inputHint:
      "可以混合貼上問題描述、預期行為、Error、Console 和 Network Response。",
    advanced: "進階設定（選填）",
    expected: "預期行為補充",
    console: "Console log 補充",
    network: "Network Response 補充",
    run: "開始調查",
    running: "調查中…",
    safety: "唯讀分析，不會修改程式碼或建立 PR。",
    cause: "最可能原因",
    next: "下一步驗證",
    signal: "看到什麼代表假設成立",
    confidence: "信心程度",
    details: "查看完整證據與其他假設",
    trace: "查看 Agent 執行軌跡",
    facts: "已觀察事實",
    hypotheses: "所有可能原因",
    actions: "完整驗證步驟",
    missing: "仍缺少的資訊",
    files: "受影響檔案",
    tools: "工具呼叫",
    stop: "停止條件",
    checkpoint: "採用後只保存調查方向，不會修改程式碼。",
    reject: "需要更多證據",
    approve: "採用這個方向",
    rejectReason: "請說明還缺少什麼證據",
    cancel: "取消",
    confirmReject: "保存原因",
    stopped: "調查已停止",
    loading: "正在搜尋程式碼並整理證據",
    disconnected: "即時連線中斷，請重新執行。",
  },
  en: {
    title: "Paste the error. Find the next step.",
    intro:
      "No need to classify Console or Network first. Paste what you know and let the Agent organize evidence into a verifiable direction.",
    input: "Problem and error context",
    inputHint:
      "Mix the description, expected behavior, Error, Console, and Network Response here.",
    advanced: "Advanced details (optional)",
    expected: "Expected behavior notes",
    console: "Additional Console log",
    network: "Additional Network Response",
    run: "Start investigation",
    running: "Investigating…",
    safety: "Read-only analysis. No code edits or pull requests.",
    cause: "Most likely cause",
    next: "Next verification",
    signal: "Signal that supports it",
    confidence: "Confidence",
    details: "View complete evidence and other hypotheses",
    trace: "View Agent trace",
    facts: "Observed facts",
    hypotheses: "All hypotheses",
    actions: "All verification actions",
    missing: "Missing information",
    files: "Affected files",
    tools: "Tool calls",
    stop: "Stop condition",
    checkpoint:
      "Adopting this direction only saves the report. It does not edit code.",
    reject: "Need more evidence",
    approve: "Use this direction",
    rejectReason: "Describe the missing evidence",
    cancel: "Cancel",
    confirmReject: "Save reason",
    stopped: "Investigation stopped",
    loading: "Searching code and organizing evidence",
    disconnected: "Live updates disconnected. Run again.",
  },
};

export default function BugInvestigatorPage() {
  const [locale, setLocale] = useState<Locale>("zh-TW");
  const [repository, setRepository] = useState(REPLAY_REPOSITORY);
  const [incident, setIncident] = useState(samples["zh-TW"]);
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [consoleLog, setConsoleLog] = useState("");
  const [networkContext, setNetworkContext] = useState("");
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const [item, setItem] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const events = useRef<EventSource | null>(null);
  const t = copy[locale];

  function changeLocale(next: Locale) {
    setLocale(next);
    if (incident === samples[locale]) setIncident(samples[next]);
  }
  function changeMode(next: "replay" | "live") {
    setMode(next);
    if (next === "live" && repository === REPLAY_REPOSITORY)
      setRepository(LIVE_REPOSITORY);
    if (next === "replay" && repository === LIVE_REPOSITORY)
      setRepository(REPLAY_REPOSITORY);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    setItem(null);
    setShowReject(false);
    events.current?.close();
    const title = incident.trim().split("\n")[0].slice(0, 300);
    try {
      const response = await fetch(`${API_URL}/api/v1/bug-investigations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          repository,
          branch: "main",
          error_message: incident,
          console_log: consoleLog,
          network_context: networkContext,
          expected_behavior: expectedBehavior,
          mode,
          locale,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.detail || "Could not start investigation");
      setItem(body);
      const source = new EventSource(
        `${API_URL}/api/v1/bug-investigations/${body.id}/events`,
      );
      events.current = source;
      source.addEventListener("investigation", (message) => {
        const next = JSON.parse(
          (message as MessageEvent).data,
        ) as Investigation;
        setItem(next);
        if (terminal.has(next.status)) setLoading(false);
      });
      source.addEventListener("done", () => {
        source.close();
        setLoading(false);
      });
      source.onerror = () => {
        source.close();
        setLoading(false);
        setNotice(t.disconnected);
      };
    } catch (error) {
      setLoading(false);
      setNotice(error instanceof Error ? error.message : "Request failed");
    }
  }

  async function decide(action: "approve" | "reject") {
    if (!item) return;
    if (action === "reject" && rejectionReason.trim().length < 3) {
      setNotice(t.rejectReason);
      return;
    }
    const payload =
      action === "approve"
        ? { actor: "portfolio-reviewer" }
        : { actor: "portfolio-reviewer", reason: rejectionReason.trim() };
    const response = await fetch(
      `${API_URL}/api/v1/bug-investigations/${item.id}/${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const body = await response.json();
    if (response.ok) {
      setItem(body);
      setShowReject(false);
    } else setNotice(body.detail || "Request failed");
  }

  const report = item?.approved_report || item?.report;
  const topCause = report?.hypotheses[0];
  const nextAction = report?.verification_actions[0];
  return (
    <main>
      <WorkspaceHeader active="bug" locale={locale} onLocaleChange={changeLocale} />
      <section className="workspace bug-workspace">
        <WorkspaceBanner
          eyebrow="BUG INVESTIGATOR · READ ONLY"
          title={t.title}
          description={t.intro}
          tags={["Repository", "Evidence", "Verification"]}
          steps={
            locale === "zh-TW"
              ? ["錯誤資訊", "程式碼搜尋", "原因假設", "人工核准"]
              : ["Bug input", "Code search", "Hypotheses", "Human"]
          }
        />
        <form className="bug-quick-form" onSubmit={submit}>
          <div className="bug-quick-top">
            <label>
              <span>Repository</span>
              <input
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
              />
            </label>
            <div className="mode-picker">
              <button
                type="button"
                className={mode === "replay" ? "selected" : ""}
                onClick={() => changeMode("replay")}
              >
                Replay
              </button>
              <button
                type="button"
                className={mode === "live" ? "selected" : ""}
                onClick={() => changeMode("live")}
              >
                Live AI
              </button>
            </div>
          </div>
          <label className="bug-incident">
            <span>{t.input}</span>
            <small>{t.inputHint}</small>
            <textarea
              value={incident}
              onChange={(e) => setIncident(e.target.value)}
              required
              minLength={5}
            />
          </label>
          <details className="bug-advanced">
            <summary>{t.advanced}</summary>
            <div>
              <label>
                <span>{t.expected}</span>
                <textarea
                  value={expectedBehavior}
                  onChange={(e) => setExpectedBehavior(e.target.value)}
                />
              </label>
              <label>
                <span>{t.console}</span>
                <textarea
                  value={consoleLog}
                  onChange={(e) => setConsoleLog(e.target.value)}
                />
              </label>
              <label>
                <span>{t.network}</span>
                <textarea
                  value={networkContext}
                  onChange={(e) => setNetworkContext(e.target.value)}
                />
              </label>
            </div>
          </details>
          <div className="bug-quick-action">
            <p>{t.safety}</p>
            <button className="run-button" disabled={loading}>
              {loading ? t.running : t.run}
            </button>
          </div>
        </form>
        {notice && <div className="notice">{notice}</div>}
      </section>
      {item && (
        <section className="bug-simple-results">
          <div className="bug-result-status">
            <span>{item.status.replaceAll("_", " ")}</span>
            <span>
              {item.steps.filter((step) => step.status === "completed").length}/
              {item.steps.length} steps · {item.token_usage} tokens
            </span>
          </div>
          {item.error && (
            <div className="error-card">
              <strong>{t.stopped}</strong>
              <p>{item.error}</p>
            </div>
          )}
          {!report && !item.error && (
            <div className="analysis-loader">
              <span />
              <h3>{t.loading}</h3>
            </div>
          )}
          {item.rejection_reason && (
            <div className="rejection-note">
              <strong>{t.reject}</strong>
              <p>{item.rejection_reason}</p>
            </div>
          )}
          {report && topCause && nextAction && (
            <>
              <div className="bug-answer-grid">
                <article className="bug-primary-answer">
                  <span>{t.cause}</span>
                  <h2>{topCause.title}</h2>
                  <p>{topCause.explanation}</p>
                </article>
                <article>
                  <span>{t.next}</span>
                  <h3>{nextAction.action}</h3>
                  <p>
                    <b>{t.signal}：</b>
                    {nextAction.expected_signal}
                  </p>
                </article>
                <article className="bug-confidence-card">
                  <span>{t.confidence}</span>
                  <strong>{report.confidence.level}</strong>
                  <p>{report.confidence.reason}</p>
                </article>
              </div>
              <details className="bug-detail-panel">
                <summary>
                  {t.details}
                  <span>
                    {report.observed_facts.length +
                      report.affected_files.length +
                      report.hypotheses.length}
                  </span>
                </summary>
                <div className="bug-detail-content">
                  <section>
                    <div className="report-section-title">
                      <span>{t.facts}</span>
                      <b>{report.observed_facts.length}</b>
                    </div>
                    <ul className="checklist-list">
                      {report.observed_facts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <div className="report-section-title">
                      <span>{t.hypotheses}</span>
                      <b>{report.hypotheses.length}</b>
                    </div>
                    <div className="hypothesis-list">
                      {report.hypotheses.map((hypothesis) => (
                        <article key={hypothesis.rank}>
                          <header>
                            <b>#{hypothesis.rank}</b>
                            <div>
                              <h3>{hypothesis.title}</h3>
                              <span>{hypothesis.confidence}</span>
                            </div>
                          </header>
                          <p>{hypothesis.explanation}</p>
                          <ul>
                            {hypothesis.evidence.map((evidence, index) => (
                              <li key={`${evidence.source}-${index}`}>
                                <span>{evidence.source}</span>
                                {evidence.observation}
                                {evidence.citation && (
                                  <>
                                    {" "}
                                    ·{" "}
                                    <a
                                      href={evidence.citation.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {evidence.citation.label} ↗
                                    </a>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section>
                    <div className="report-section-title">
                      <span>{t.files}</span>
                      <b>{report.affected_files.length}</b>
                    </div>
                    <div className="bug-file-list">
                      {report.affected_files.map((file) => (
                        <article key={file.path}>
                          <div>
                            <code>{file.path}</code>
                            <span>{file.risk_level}</span>
                          </div>
                          <p>{file.reason}</p>
                          {file.citations.map((citation) => (
                            <a
                              key={citation.url}
                              href={citation.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {citation.label} ↗
                            </a>
                          ))}
                        </article>
                      ))}
                    </div>
                  </section>
                  {report.missing_information.length > 0 && (
                    <section>
                      <div className="report-section-title">
                        <span>{t.missing}</span>
                        <b>{report.missing_information.length}</b>
                      </div>
                      <ul className="question-list">
                        {report.missing_information.map((question) => (
                          <li key={question}>{question}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <div className="stop-condition">
                    <strong>{t.stop}</strong>
                    <p>{report.stop_condition}</p>
                  </div>
                </div>
              </details>
              <details className="bug-detail-panel">
                <summary>
                  {t.trace}
                  <span>{item.tool_calls.length}</span>
                </summary>
                <div className="bug-trace-grid">
                  {item.steps.map((step) => (
                    <article key={step.key}>
                      <i>{step.status === "completed" ? "✓" : "○"}</i>
                      <div>
                        <strong>{step.label}</strong>
                        <p>{step.summary || "—"}</p>
                      </div>
                      <small>{step.duration_ms || 0}ms</small>
                    </article>
                  ))}
                </div>
                {item.tool_calls.length > 0 && (
                  <div className="bug-inline-tools">
                    <span>{t.tools}</span>
                    {item.tool_calls.map((tool, index) => (
                      <code key={`${tool.tool_name}-${index}`}>
                        {tool.tool_name} · {tool.duration_ms}ms
                      </code>
                    ))}
                  </div>
                )}
              </details>
            </>
          )}
          {report && item.status === "waiting_approval" && (
            <div className="approval-bar bug-simple-approval">
              <div>
                <span>HUMAN CHECKPOINT</span>
                <strong>{t.checkpoint}</strong>
              </div>
              {showReject ? (
                <div className="reject-reason">
                  <input
                    value={rejectionReason}
                    placeholder={t.rejectReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                  />
                  <button
                    className="reject-button"
                    onClick={() => setShowReject(false)}
                  >
                    {t.cancel}
                  </button>
                  <button
                    className="approve-button"
                    onClick={() => decide("reject")}
                  >
                    {t.confirmReject}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="reject-button"
                    onClick={() => setShowReject(true)}
                  >
                    {t.reject}
                  </button>
                  <button
                    className="approve-button"
                    onClick={() => decide("approve")}
                  >
                    {t.approve}
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
