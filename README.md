# StratifyAI 🧠
Strategic Thinking Assistant that puts you in control. Choose exactly which steps the AI executes across multiple thinking approaches, visualize progress, and fold CSV insights directly into the conversation — all in a fast, local desktop app.

**Why it’s different**
- Approach-first workflow with controllable steps (cumulative ▶ and multi-select) — you decide depth and direction.
- Conversation-aware CSV analysis that stays in the same chat and powers follow-ups automatically.
- Local-first desktop experience (Electron) for immediacy and privacy, instead of a generic web chatbot.
- A first-of-its-kind combination of multi-approach thinking, precise step execution, and in-chat data context — built to reduce token waste and over-information.

## Highlights

- Guided thinking approaches generated for every question.
- Run steps cumulatively (▶) or select any combination of steps (e.g., 1 and 3 only).
- CSV analysis appears directly in chat and remains part of the same conversation.
- Clean, professional UI with a sidebar of conversations and a dedicated thinking panel.

## The Problem We Solve

**Before StratifyAI:**
- ❌ Token waste: AI generates full responses when you only need part of the analysis
- ❌ Over-information: Getting overwhelmed with details you didn’t ask for
- ❌ No control: Can’t pause AI mid-thought to explore different directions
- ❌ Linear thinking: Stuck with one approach, can’t easily switch perspectives
- ❌ High costs: Paying for tokens you don’t need or want

**With StratifyAI:**
- ✅ Precision control: Get exactly the depth of analysis you need
- ✅ Cost efficiency: Pay only for the thinking steps you choose
- ✅ Strategic flexibility: Switch between different approaches dynamically
- ✅ Incremental discovery: Build understanding step-by-step
- ✅ Complete privacy: Everything runs locally on your machine

## 🚀 Key Features

- Multi-approach thinking: Analytical, creative, practical, and comprehensive angles per question
- Step-wise execution: Run cumulatively (▶) or select any combination of steps
- Conversation-aware context: Follow-ups refine approaches automatically
- CSV insights: Upload a small CSV for quick analysis that stays in the chat
- Professional formatting: Bold highlights, lists, and clear structure

## 📊 Cost Comparison

| Scenario              | Traditional Chat | StratifyAI | Savings |
|-----------------------|------------------|------------|---------|
| Quick clarification   | 500 tokens       | 150 tokens | 70%     |
| Partial analysis      | 1200 tokens      | 400 tokens | 67%     |
| Exploring options     | 2000 tokens      | 600 tokens | 70%     |
| Complex strategy      | 3500 tokens      | 1000 tokens| 71%     |

Demo figures based on typical usage where users only need partial analysis. Actual token usage varies by provider, model, and prompt.

## 💡 How It Works

- Ask a question: The app generates multiple thinking approaches tailored to your prompt.
- Choose steps: Execute steps cumulatively (1..N) or select any subset (e.g., 1 and 3).
- Review structured output: Responses emphasize clarity and key takeaways.
- Continue the conversation: New approaches are generated based on prior context.
- Bring in data: Upload a small CSV; its summary and context automatically enrich follow-up questions without starting a new chat.

This approach gives you control over depth and direction, reduces unnecessary tokens, and keeps your reasoning organized and transparent.

## Features

- Thinking Approaches
  - Multiple approaches per question, each with three clear steps.
  - Cumulative execution: click ▶ on a step to execute from step 1 up to that step.
  - Multi-select execution: choose any steps with checkboxes and click “Run Selected Steps”.
  - Structured responses using bold highlights and lists for readability.

- Conversation Awareness
  - Conversations persist in the sidebar with titles.
  - Follow-ups auto-update approaches based on context.
  - CSV insights are included in follow-up questions automatically; no new chat is created after analysis.

- CSV Insights (MVP)
  - Upload small CSV files (≤ 200 KB) for a quick, structured analysis in markdown.
  - The analysis summaries are stored in the current conversation for follow-ups.

- UI/UX
  - Modern layout with a status bar and window controls.
  - Keyboard shortcuts: `Ctrl+W` close window, `Ctrl+M` minimize.

## Requirements

- Node.js 18+ recommended.
- An LLM API key configured via environment variables.
- Windows/macOS desktop (Electron); browser preview is supported for UI testing.

## Installation

```bash
npm install
```

## Running the App (Desktop)

```bash
npm start
```

This launches the Electron desktop app with full functionality (thinking approaches, CSV analysis, IPC).

## Optional: Browser Preview

```bash
node server.js
# Open the printed URL (e.g., http://localhost:5500/)
```

Notes:
- Browser preview is for UI only. CSV analysis and some desktop-only features are disabled because they rely on Electron IPC.

## Usage

1) Ask a Question
- Type your question (e.g., `what is ml?`).
- The app generates multiple thinking approaches with three steps each.

2) Execute Steps
- Cumulative execution (▶): run steps 1..N for quick progress.
- Multi-select execution:
  - Expand an approach.
  - Tick any steps you want (e.g., 1 and 3).
  - Click “Run Selected Steps”.
  - The response contains only the selected steps’ reasoning — no future steps are proposed.

3) CSV Analysis
- Upload a small CSV via the CSV panel.
- A structured analysis appears in the chat (summary + insights).
- Ask follow-up questions; the app automatically includes CSV context and keeps everything in the same chat.

## 🎯 Use Cases

**💻 Software Development & Debugging**
- Model debugging with controllable depth of analysis
- Architecture planning with multiple technical approaches
- Code review with focused, step-by-step examination
- Performance optimization with systematic investigation

**🤖 Machine Learning & AI**
- Training issue diagnosis without information overflow
- Hyperparameter tuning with guided experimentation
- Model architecture exploration step by step
- Data pipeline debugging with structured approaches

**📊 Data Science**
- Exploratory data analysis with multiple perspectives
- Feature engineering with incremental discovery
- Statistical analysis with controlled complexity
- Visualization planning with step-by-step breakdown

**💼 Technical Leadership**
- System architecture decisions with guided analysis
- Technology stack evaluation with structured comparison
- Technical debt assessment with focused investigation
- Team problem-solving with methodical approaches

## Configuration

Create a `.env` file in the project root and set one of the following keys:

```env
GEMINI_API_KEY=your_api_key_here
# or
GROQ_API_KEY=your_api_key_here
```

Notes:
- The app looks for `GEMINI_API_KEY` first, then `GROQ_API_KEY`.
- Do not hardcode provider model names in user-facing docs; keep configuration generic.

## Project Structure

- `index.html` — Renderer UI (chat, thinking panel, CSV panel, step selection).
- `main.js` — Electron main process; handles window controls and IPC:
  - `generate-thinking-paths` — create approaches for a question.
  - `execute-thinking-path` — execute steps cumulatively (up to N).
  - `generate-updated-paths` — auto-update approaches based on conversation progress.
  - `analyze-csv` — analyze uploaded CSV and return a markdown summary.
  - `execute-thinking-steps` — execute exactly the selected steps (multi-select mode).
- `server.js` — Simple static server for browser preview.
- `package.json` — Scripts and dependencies.

## Development

- Start in development:
  ```bash
  npm start
  ```
- Optional watch/dev combo (requires `concurrently` and `nodemon` configured):
  ```bash
  npm run dev
  ```

## Troubleshooting

- “Disconnected” status or no responses
  - Ensure your `.env` contains a valid API key.
  - Check network connectivity and any corporate proxies.

- CSV button disabled
  - CSV analysis requires the Electron app. In browser preview, it is disabled.

- Port already in use (browser preview)
  - Set a different `PORT` env var before starting `server.js`.

## Roadmap

- Export conversations as structured documents.
- Save custom thinking templates.
- Collaboration and shared sessions.
- Voice input and richer modalities.

## 🔮 Future Development

- Deeper dataset tools (joins, schema inference, visual summaries)
- Custom approach templates and saved thinking styles
- Collaboration features (shared sessions, review annotations)
- Export and report generation (Markdown/HTML/PDF)

