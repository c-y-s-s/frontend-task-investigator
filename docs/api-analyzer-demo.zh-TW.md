# API Analyzer 面試 Demo

## 一句話定位

API Analyzer 不是用單一 Response 猜出完整 API 規格，而是整理前端目前能確認的結構、標出尚未確認的契約，並把後端或 PM 的答案帶回下一輪分析。

## 展示前準備

1. 啟動 FastAPI、PostgreSQL 與 Next.js。
2. 開啟 `http://localhost:3000/api-analyzer`。
3. 面試現場優先使用 Replay，Live 結果預先跑好並保留畫面或截圖。
4. 確認畫面仍保留預設的申請列表 Response JSON。

## 3–5 分鐘講稿

### 0:00–0:40｜問題情境

> 前端實務上不一定能立即拿到完整 Swagger。有時只有一段成功的 Response、需求說明，以及散落在對話中的 enum 或分頁規則。直接開始開發，很容易漏掉 nullable、錯誤格式、權限和個資處理。

### 0:40–1:40｜第一次分析：只有 Response

1. 清空「已知 API 契約／規則」。
2. 保留功能用途、Method、Path 與 Response JSON。
3. 執行 Replay 或已準備好的 Live 分析。
4. 指出三類結果：
   - 可直接觀察：欄位、型別、nullable、分頁結構。
   - 前端風險：個資、empty/error 狀態、日期解析。
   - 無法由成功 Response 證明：enum、驗證方式、錯誤格式。

講法：

> Agent 沒有假裝知道完整契約。它把觀察結果和待確認事項分開，讓我知道下一步該問誰、問什麼。

### 1:40–2:40｜第二次分析：補入已知契約

貼入預設 Demo 契約：

```text
application_kind: personal | company
mail_status: pending | sent | failed
分頁參數: page、page_size；page 預設 1，page_size 預設 30、最大 100
分頁參數無效或超過範圍時回傳 HTTP 422，格式: { "error": { "code": string, "message": string } }
超出總頁數時回傳 HTTP 200，data 為空陣列，meta 保留實際分頁資訊
驗證方式: Bearer Token；未驗證回傳 401、權限不足回傳 403，沿用相同 error 格式
此端點目前不支援篩選、排序或搜尋；預設依 created_at 由新到舊排序
created_at 保證為包含時區位移的 RFC 3339 字串
```

再次分析後指出：

- 報告列出「已採用的使用者契約」。
- 已回答的問題不再出現。
- TypeScript 型別只是草稿，不冒充正式 code generation。

講法：

> 這是一個小型 feedback loop：Agent 提問，工程師確認，答案成為下一輪的明確上下文。

### 2:40–3:30｜安全與人工核准

> Live 模式送給模型前會遮罩常見個資；分析完成後，原始 JSON 和原始契約不留在資料庫。最後仍由工程師核准，AI 不會自行修改後端或部署程式碼。

點擊「核准報告」，展示 Human-in-the-loop。

### 3:30–4:30｜效率證據

不要只說「比較快」，現場展示或口頭說明以下紀錄：

| 指標 | 第一次：只有 Response | 第二次：補入契約 |
|---|---:|---:|
| 待確認問題數 | 現場記錄 | 現場記錄 |
| 已辨識欄位數 | 現場記錄 | 現場記錄 |
| 人工整理時間 | 現場記錄 | 現場記錄 |
| Agent 分析時間 | 現場記錄 | 現場記錄 |
| Token | 畫面顯示 | 畫面顯示 |
| 是否需要修改報告 | 是／否 | 是／否 |

重點不是證明 AI 永遠正確，而是證明它能降低整理成本、讓缺漏更早被看見，並保留人工判斷。

## 面試官可能追問

### 為什麼不直接用 Swagger？

有完整 OpenAPI 時應優先使用正式規格，本工具也支援 OpenAPI 模式。Response 模式處理的是文件缺漏或前端剛取得範例資料的早期階段。

### 為什麼不直接產生 API client？

單一 Response 無法證明必填欄位、完整 enum 和 Error Response。直接產生可執行 client 會把推測包裝成事實；MVP 只提供型別草稿與檢查清單。

### 使用者填錯契約怎麼辦？

報告會把它標示為使用者提供的契約，不會宣稱來自 Swagger。正式採用前仍需人工核准。

### 這算 Agent 還是一般 LLM 表單？

它有受控輸入、確定性前處理、個資遮罩、結構化輸出、狀態保存與人工核准。範圍刻意保持單一工作流，不宣稱是自主 Multi-Agent。

## 停止邊界

API Analyzer 到此只修 Bug 和展示問題。不加入自動呼叫任意 API、自動產生並提交程式碼、向量資料庫或 Multi-Agent；這些功能會擴大安全與評估範圍，卻不會讓目前的面試故事更清楚。
