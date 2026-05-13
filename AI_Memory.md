# AI Memory - Asana Sync Tool

## Project Overview

This project is an AI-powered Asana dashboard built with Next.js App Router.

It currently supports:
- Asana task sync
- Asana webhook ingestion
- Ollama-based AI summaries
- AI priority detection
- Neon PostgreSQL task persistence
- Dashboard analytics and task detail views
- Basic login and register flow
- Slack notification hooks

The current backend flow is:

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

## Current Tech Stack

Frontend:
- Next.js 16 App Router
- React 19
- Tailwind CSS
- Recharts

Backend:
- Next.js route handlers
- PostgreSQL via `pg`

AI:
- Ollama for summary generation and priority analysis
- `src/services/aiSummary.js`
- `src/services/aiPriority.js`

Integrations:
- Asana API
- Asana webhook
- Slack notifications
- Google Sheets helper exists

Auth:
- Login API
- Register API
- Client-side auth state stored in `localStorage`

Database:
- Neon PostgreSQL via `DATABASE_URL`
- Shared DB pool in `src/lib/db.js`

## Important Project Structure

Key app routes:
- `src/app/page.js`
- `src/app/login/page.js`
- `src/app/register/page.js`
- `src/app/dashboard/page.js`

Key API routes:
- `src/app/api/asana/tasks/route.js`
- `src/app/api/asana/task/[taskId]/route.js`
- `src/app/api/asana-webhook/route.js`
- `src/app/api/cron/asana-sync/route.js`
- `src/app/api/login/route.js`
- `src/app/api/register/route.js`

Key services:
- `src/services/asana.js`
- `src/services/aiSummary.js`
- `src/services/aiPriority.js`
- `src/services/taskStore.js`
- `src/services/priority.js`
- `src/services/slack.js`

Database helper:
- `src/lib/db.js`

## Current Data Flow

### Dashboard task loading

1. Dashboard calls `/api/asana/tasks`
2. API checks Neon first through `getStoredTasks()`
3. If DB has task data, dashboard uses stored records
4. If DB is empty, API fetches from Asana, enriches with Ollama, stores results in Neon, then returns them

### Task detail loading

1. Dashboard selects a task
2. API calls `/api/asana/task/[taskId]`
3. Route checks Neon first
4. If task is not stored yet, route fetches from Asana, generates AI output, persists it, then returns it

### Webhook / cron ingestion

1. Asana webhook or cron sync receives task change
2. Route fetches task details if needed
3. Ollama generates summary and/or priority
4. `taskStore.js` upserts the task into `asana_tasks`
5. Raw event payload is stored in `asana_task_events`

## Database Tables Expected By The App

Primary task table:
- `asana_tasks`

Event log table:
- `asana_task_events`

The code in `src/services/taskStore.js` can create these automatically when `DATABASE_URL` is set.

## AI Summary Format

The dashboard expects AI summaries in this format:

Summary:
<short summary>

Priority:
<LOW | MEDIUM | HIGH>

Suggested Next Action:
<specific next step>

## Important Environment Variables

Used now:
- `ASANA_API_TOKEN`
- `ASANA_PROJECT_ID`
- `DATABASE_URL`
- `CRON_SECRET` if cron auth is enabled
- `TASK_STORE_PATH` only for file fallback storage

May exist but not currently primary for task AI:
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`

Ollama is currently the active AI path for task summary and priority features.

## Auth Behavior

- `/` currently serves the login experience
- Login success redirects to `/dashboard`
- Dashboard has a logout button
- Logout clears the stored local user and redirects to `/login`
- Auth is currently client-side only, not full server session auth

## Coding Notes

- Preserve existing route structure
- Prefer small additive changes over broad refactors
- Reuse `taskStore.js` instead of creating duplicate persistence logic
- Keep Asana normalization in `src/services/asana.js`
- Keep priority normalization in `src/services/priority.js`
- Prefer server-side AI calls
- Keep dashboard UI concise and operational, not marketing-style

## Current Limitations

- Dashboard auth is localStorage-based and not secure for production
- Ollama must be running locally for AI features to work
- Some flows still fall back to live Asana fetches if DB is empty
- Slack and Google Sheets integrations are optional and environment-dependent
- Build may require network access for Google Fonts during production build
- Vercel can host the app, but Ollama does not run directly inside standard Vercel serverless functions

## Preferred AI Behavior For Future Changes

When modifying this project:
- keep existing logic unless there is a strong reason to replace it
- optimize by reusing current services and route handlers
- avoid unnecessary schema churn
- prefer Neon-backed persistence over temporary in-memory behavior
- maintain the current Asana -> API -> Ollama -> Neon -> Dashboard architecture

## Vercel Deployment

### What can be deployed

- The Next.js app can be deployed to Vercel
- The Neon PostgreSQL database can be used from Vercel through `DATABASE_URL`
- Asana webhook and API routes can run on Vercel
- Ollama should be hosted separately, or replaced with a hosted AI provider for production

### Important Ollama deployment note

This project currently calls Ollama at:
- `http://localhost:11434/api/generate`

That works in local development, but it will not work on Vercel unless Ollama is exposed from another reachable server.

For Vercel production, choose one of these approaches:
- keep Ollama on a separate VPS / local machine and expose a secure reachable endpoint
- replace Ollama calls with Gemini or another hosted model API
- keep Vercel for frontend and database-connected routes, but use a separate backend service for AI processing

### Environment variables needed on Vercel

Add these in the Vercel project settings:
- `ASANA_API_TOKEN`
- `ASANA_PROJECT_ID`
- `DATABASE_URL`
- `CRON_SECRET` if using protected cron sync
- `SLACK_WEBHOOK_URL` if Slack notifications are enabled

Only add these if actually used in production:
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`

### Basic deployment steps

1. Push the project to GitHub
2. Import the repository into Vercel
3. Set the framework as Next.js if Vercel does not detect it automatically
4. Add the required environment variables in Vercel
5. Make sure Neon tables exist, or let the app create them on first write
6. Deploy
7. Update the Asana webhook target URL to the Vercel domain, for example:
   - `https://your-app.vercel.app/api/asana-webhook`

### Recommended production shape for this project

- Vercel hosts the Next.js app and route handlers
- Neon stores user and task data
- Asana sends webhook events to the Vercel API
- AI runs through a hosted endpoint, not local `localhost`

### Current production risk

If the code is deployed to Vercel exactly as-is, task AI generation will fail unless the Ollama endpoint is changed from `localhost` to a reachable production endpoint.
