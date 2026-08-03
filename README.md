# Task Investigator

An explainable engineering agent that turns a GitHub Issue into an evidence-backed frontend implementation plan. It retrieves only the required repository context, cites every material claim, and pauses at a human approval checkpoint.

> 中文說明請見下方「中文摘要」。

## Why this exists

Requirement analysis often means manually jumping between an Issue, repository search, old pull requests, and CI. Task Investigator turns that scattered investigation into one observable workflow without allowing the model to mutate GitHub.

```text
GitHub Issue → Plan → Code search → File inspection → PR/CI context
             → Structured report → Human approval → Audit event
```

## Product behavior

- **Replay mode:** deterministic, zero-cost portfolio demo that works without external credentials.
- **Live mode:** allowlisted GitHub repository analysis using read-only tools and OpenAI Responses API.
- **Grounding:** impacted files, tasks, and risks require source citations; unsupported claims are labelled inference.
- **Human control:** approval and rejection are stored locally. Version 0.1 never writes to GitHub.
- **Observable execution:** SSE streams workflow state, summaries, tool latency, token usage, and failure status.

## Architecture

- Web: Next.js 16, React 19, TypeScript
- API: Python 3.12, FastAPI, Pydantic
- Data: PostgreSQL, SQLAlchemy, Alembic
- AI: OpenAI Responses API with Pydantic Structured Outputs
- External tools: GitHub REST API, server-side read-only allowlist
- Local infrastructure: Docker Compose
- Deployment targets: Vercel (web), Render (API and PostgreSQL)

The web surface lives at the repository root for a standard Vercel-compatible Next.js build. The independently deployable backend lives in `apps/api`.

## Prerequisites

Install these before starting:

- Node.js 22.13 or newer and npm
- Docker Desktop with Docker Compose
- Git
- Python 3.12 or newer only if you want to run the API without Docker

Verify the required commands:

```bash
node --version
npm --version
docker --version
docker compose version
```

## Quick start

The recommended local setup runs PostgreSQL and FastAPI in Docker, while Next.js runs directly on your machine for fast frontend reloads.

### 1. Open the project

```bash
cd "/Users/leochang/Desktop/frontend-task-investigator"
```

If the project was cloned elsewhere, replace the path with your clone location.

### 2. Create the local environment file

```bash
cp .env.example .env
```

Replay Mode does not need a GitHub token or OpenAI API key. Leave both values empty until you configure Live Mode.

### 3. Start PostgreSQL and FastAPI

```bash
docker compose up --build
```

Keep this terminal open. Wait until the API reports that it is running, then verify:

- API health: `http://localhost:8000/health`
- API documentation: `http://localhost:8000/docs`

### 4. Start Next.js in a second terminal

```bash
cd "/Users/leochang/Desktop/frontend-task-investigator"
npm ci
npm run dev
```

Open `http://localhost:3000`, keep **Replay** selected, and click **Run analysis**. The fixed Issue #128 case should reach `waiting approval`, after which you can approve or reject the draft.

### 5. Stop the project

Stop Next.js with `Control-C` in its terminal. Stop the API and PostgreSQL with:

```bash
docker compose down
```

To also delete the local PostgreSQL volume and all investigation records:

```bash
docker compose down --volumes
```

The `--volumes` command deletes local database data and cannot be undone.

## Run without Docker

Use this option when Docker Desktop is unavailable. The API defaults to a local SQLite database.

Terminal 1 — FastAPI:

```bash
cd "/Users/leochang/Desktop/frontend-task-investigator/apps/api"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Terminal 2 — Next.js:

```bash
cd "/Users/leochang/Desktop/frontend-task-investigator"
npm ci
npm run dev
```

## Local setup details

### Replay-only development

Replay Mode uses a deterministic stored result and does not call GitHub or OpenAI. It is the recommended interview path because it has no network, credential, API-cost, or rate-limit dependency.

The API is available at `http://localhost:8000`; interactive documentation is at `/docs`.

### Live mode

Set these only in your local `.env` and hosting provider secrets:

```env
GITHUB_ALLOWED_REPOS=your-user/frontend-agent-demo-shop
GITHUB_TOKEN=your-fine-grained-read-only-token
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-5.6-terra
```

Never commit tokens. The GitHub token needs repository Contents, Issues, Pull Requests, and Actions read access only.

Publish `examples/frontend-agent-demo-shop` as a separate repository and create the fixture Issue before enabling Live mode.

Restart the API after changing `.env`. In the UI, select **Live**, enter the allowlisted `owner/repository`, Issue number, and branch, then start the investigation.

## Troubleshooting

### The page opens but Run analysis fails

Confirm FastAPI is running:

```bash
curl http://localhost:8000/health
```

If the request fails, restart `docker compose up --build` or the local `uvicorn` process.

### Port 3000 or 8000 is already in use

Stop the previous Next.js, FastAPI, or Docker process before restarting. The frontend currently expects the API at `http://localhost:8000`.

### Live Mode returns repository not allowed

Set `GITHUB_ALLOWED_REPOS` to the exact lowercase-compatible `owner/repository` value, then restart FastAPI.

### Live Mode fails but Replay works

Check that `GITHUB_TOKEN` has read access to Contents, Issues, Pull Requests, and Actions, and confirm that `OPENAI_API_KEY` has API billing enabled. ChatGPT subscriptions do not provide API credit.

### Reset the local SQLite database

When running without Docker, stop FastAPI and remove `apps/api/investigator.db`. This deletes all local investigations and approvals.

## API contract

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/v1/investigations` | Creates replay or live analysis |
| GET | `/api/v1/investigations/{id}` | Returns current state and report |
| GET | `/api/v1/investigations/{id}/events` | Streams state changes with SSE |
| POST | `/api/v1/investigations/{id}/approve` | Stores approved report and audit event |
| POST | `/api/v1/investigations/{id}/reject` | Stores rejection reason and audit event |
| GET | `/health` | Deployment health check |

## Safety and cost controls

- Live mode accepts only explicitly allowlisted repositories.
- File reads are capped at 10 files and 40 KB per file.
- Secrets, build output, binaries, lockfiles, and suspicious paths are excluded.
- Live runs have per-IP hourly and global daily limits.
- Model output is schema-validated before persistence.
- The model receives no GitHub token and cannot construct arbitrary HTTP requests.
- Hidden chain-of-thought is never stored or exposed.

The in-process limiter is suitable for this single-instance portfolio MVP. A horizontally scaled deployment needs a shared counter such as Redis or a database-backed quota table.

## Testing

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest
```

The suite covers replay completion, citation validation, approval state guards, rejection validation, repository allowlisting, and health checks. External calls are not required.

## Evaluation

Fixture Issue #128 includes ground truth in the demo repository README. Record these metrics across at least three Issues before claiming productivity gains:

- impacted-file precision and recall
- accepted versus edited implementation tasks
- unsupported-claim rate
- manual investigation time versus agent-assisted review time
- total latency, tool calls, tokens, and estimated cost

The replay metrics in the UI are representative fixture values, not a pricing claim.

## Known limits

- GitHub Code Search completeness depends on GitHub indexing and token access.
- Keyword planning is deterministic in v0.1; semantic repository indexing is intentionally out of scope.
- Free hosting may cold-start. Replay mode remains the reliable interview path.
- Approval records review; it does not update an Issue.

## 中文摘要

Task Investigator 是一個面試作品用的前端工程 Agent。輸入 GitHub Issue 後，系統會依序讀取需求、搜尋程式碼、檢查相關 PR 與 CI，產生附來源連結的影響分析、Task 拆解與風險清單，最後停在人工核准。

第一版刻意不寫回 GitHub：模型只能使用後端允許的唯讀工具；所有寫入行為都留待後續版本。公開展示預設使用 Replay Mode，因此沒有 API Key 也能穩定演示完整流程。Live Mode 僅接受 allowlist 內的 Repo，並限制每次讀取檔案數量、單檔大小、IP 呼叫次數和每日總量。

面試時請強調：這不是單次 Prompt，而是具備工具邊界、狀態管理、來源引用、結構化輸出、人工核准、Audit Log、錯誤處理與評估設計的完整 Agent Workflow。
