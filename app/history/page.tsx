"use client";

import { useEffect, useState } from "react";
import { WorkspaceBanner } from "../components/WorkspaceBanner";
import { WorkspaceHeader } from "../components/WorkspaceHeader";

type HistoryItem = {
  id: string;
  kind: "task" | "api" | "bug" | "review";
  target: string;
  mode: string;
  locale: string;
  status: string;
  token_usage: number;
  approved: boolean;
  created_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const labels = { task: "Task", api: "API", bug: "Bug", review: "Review" };

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/v1/history`)
      .then(async (response) => {
        if (!response.ok) throw new Error("無法載入執行紀錄");
        return response.json();
      })
      .then(setItems)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main>
      <WorkspaceHeader active="history" />
      <section className="workspace history-workspace">
        <WorkspaceBanner
          eyebrow="WORKFLOW HISTORY · READ ONLY"
          title="查看 Agent 實際保存了什麼"
          description="集中顯示最近的 Agent 執行紀錄、狀態、Token 與人工核准結果，不公開原始輸入或完整報告。"
          tags={["PostgreSQL", "Audit metadata", "Read only"]}
          steps={["Agent run", "Persist state", "Human check", "History"]}
          activeStep={3}
        />

        <div className="history-summary">
          <div><span>RECENT RUNS</span><strong>{items.length}</strong></div>
          <div><span>APPROVED</span><strong>{items.filter((item) => item.approved).length}</strong></div>
          <div><span>LIVE MODE</span><strong>{items.filter((item) => item.mode === "live").length}</strong></div>
          <p>只顯示最近 50 筆非敏感 metadata。</p>
        </div>

        {loading ? <div className="history-state">正在讀取 PostgreSQL…</div> : null}
        {error ? <div className="notice">{error}</div> : null}
        {!loading && !error && items.length === 0 ? <div className="history-state">目前還沒有執行紀錄。</div> : null}

        {items.length > 0 ? (
          <div className="history-table-shell">
            <div className="history-table-head"><span>TYPE</span><span>TARGET</span><span>STATUS</span><span>USAGE</span><span>CREATED</span></div>
            {items.map((item) => (
              <article className="history-row" key={`${item.kind}-${item.id}`}>
                <div><b className={`history-kind history-kind-${item.kind}`}>{labels[item.kind]}</b><small>{item.mode}</small></div>
                <div className="history-target"><strong>{item.target}</strong><code>{item.id.slice(0, 8)}</code></div>
                <div><span className={`history-status history-status-${item.status}`}>{item.status.replaceAll("_", " ")}</span>{item.approved ? <small>Human approved</small> : null}</div>
                <div><strong>{item.token_usage.toLocaleString()}</strong><small>tokens</small></div>
                <time dateTime={item.created_at}>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
