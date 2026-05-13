# Asana Sync Tool

An AI-powered Asana dashboard built with Next.js. It syncs Asana tasks, analyzes them with Ollama, stores enriched task data in Neon PostgreSQL, and shows the results in a dashboard with task analytics, AI insights, and detail views.

## Features

- Asana task sync
- Asana webhook ingestion
- Ollama-based task summaries
- AI priority detection
- Neon PostgreSQL task persistence
- Dashboard analytics and task detail panel
- Login, register, and logout flow
- Optional Slack notifications
- Optional Google Sheets helpers

## Current Flow

```text
Asana
  ->
Webhook or manual sync
  ->
Next.js API routes
  ->
Ollama
  ->
Neon PostgreSQL
  ->
Dashboard
```

## Tech Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS
- Recharts
- PostgreSQL via `pg`
- Ollama
- Neon PostgreSQL

## Main Routes

Frontend:
- `/`
- `/login`
- `/register`
- `/dashboard`

API:
- `/api/asana/tasks`
- `/api/asana/task/[taskId]`
- `/api/asana-webhook`
- `/api/cron/asana-sync`
- `/api/login`
- `/api/register`

## Project Structure

```text
src/
  app/
    api/
      asana/
      asana-webhook/
      cron/asana-sync/
      login/
      register/
    dashboard/
    login/
    register/
  components/
    tasks/
  lib/
    db.js
  services/
    aiPriority.js
    aiSummary.js
    asana.js
    priority.js
    slack.js
    taskStore.js
```

## Environment Variables

Create `.env` or `.env.local` with the values you use:

```env
ASANA_API_TOKEN=your_asana_api_token
ASANA_PROJECT_ID=your_asana_project_id
DATABASE_URL=your_neon_postgres_connection_string
CRON_SECRET=your_optional_cron_secret
SLACK_WEBHOOK_URL=your_optional_slack_webhook
TASK_STORE_PATH=.data/task-records.jsonl
OPENAI_API_KEY=optional
GEMINI_API_KEY=optional
```

Notes:
- `DATABASE_URL` is used for Neon PostgreSQL.
- `TASK_STORE_PATH` is only used as a fallback if `DATABASE_URL` is not set.
- `OPENAI_API_KEY` and `GEMINI_API_KEY` are not the active task AI path right now.
- Ollama is currently the active AI path for task summary and priority analysis.

## Required Local Services

Before running the app locally, make sure:

1. PostgreSQL on Neon is reachable through `DATABASE_URL`
2. Ollama is installed and running locally
3. The required Ollama model is available

This project currently calls Ollama on:

```text
http://localhost:11434/api/generate
```

## Install and Run

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Auth Behavior

- `/` serves the login experience
- successful login redirects to `/dashboard`
- the dashboard includes logout
- logout clears the client-side stored user and returns to `/login`

Current auth is client-side only and is not production-grade session auth.

## Database Tables

The app can create its task tables automatically through `src/services/taskStore.js`, but you can also create them manually in Neon.

```sql
CREATE TABLE IF NOT EXISTS asana_tasks (
  asana_gid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  due_on DATE,
  assignee_name TEXT,
  created_at TIMESTAMPTZ,
  modified_at TIMESTAMPTZ,
  priority TEXT,
  ai_summary TEXT,
  last_event_action TEXT,
  source TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asana_task_events (
  id BIGSERIAL PRIMARY KEY,
  task_gid TEXT NOT NULL,
  event_action TEXT,
  event_source TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asana_tasks_modified_at
ON asana_tasks (modified_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_asana_task_events_task_gid
ON asana_task_events (task_gid, received_at DESC);
```

## How Data Loads

### Dashboard tasks

1. `/api/asana/tasks` checks Neon first
2. If stored tasks exist, the dashboard uses database results
3. If Neon is empty, the route fetches from Asana, analyzes with Ollama, stores the results, then returns them

### Task details

1. `/api/asana/task/[taskId]` checks Neon first
2. If the task is not stored yet, it fetches from Asana, generates AI output, stores it, then returns it

### Webhook and cron sync

1. Asana webhook or cron detects changed tasks
2. The app fetches task details if needed
3. Ollama generates summary and/or priority
4. Neon stores the task in `asana_tasks`
5. Raw event payload is stored in `asana_task_events`

## AI Output Format

The dashboard expects AI summaries in this format:

```text
Summary:
<short summary>

Priority:
<LOW | MEDIUM | HIGH>

Suggested Next Action:
<specific next step>
```

## Vercel Deployment

The Next.js app can be deployed to Vercel, but Ollama cannot run directly inside normal Vercel serverless functions.

### What works on Vercel

- Next.js frontend
- Next.js API routes
- Neon PostgreSQL
- Asana webhook endpoints

### What needs special handling

Ollama calls currently point to:

```text
http://localhost:11434/api/generate
```

That will not work in Vercel production unless you change it to a reachable hosted endpoint.

### Production options

- Host Ollama on a separate VPS or machine and expose a secure API endpoint
- Replace Ollama with Gemini or another hosted AI provider
- Keep Vercel for the app and move AI processing to a separate backend service

### Deploy Steps

1. Push the project to GitHub
2. Import the repository into Vercel
3. Add the required environment variables
4. Make sure Neon is available and the task tables exist, or let the app create them on first write
5. Deploy
6. Point your Asana webhook to:

```text
https://your-app.vercel.app/api/asana-webhook
```

## Current Limitations

- Auth is localStorage-based and not secure for production
- Ollama must be reachable for AI features to work
- Some flows still fall back to live Asana fetch if the DB is empty
- Slack and Google Sheets features are optional and env-dependent
- Production deployment needs a real AI endpoint instead of local `localhost`

## Useful Commands

```bash
npm run dev
npm run lint
npm run build
npm run start
```
