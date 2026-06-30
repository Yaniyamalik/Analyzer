# Visl AI — Candidate Screening Platform

AI-powered recruitment automation: upload candidates → AI-evaluate resumes &
GitHub profiles against a job description → rank → email test links →
ingest results → schedule real Google Calendar/Meet interviews.
Frontend Link:https://visl-qzf0xljp8-yaniyas-projects.vercel.app/
Backend Link:https://visl-ai.onrender.com
See `ARCHITECTURE.md` for system design and reasoning behind key decisions.

## Stack
- **Frontend**: React (Vite) → deploy to Vercel
- **Backend**: Node/Express + MongoDB (Mongoose) → deploy to Render/Railway
- **AI**: Google Gemini (`gemini-2.0-flash`)
- **Integrations**: GitHub REST API, Google Calendar API (OAuth2), Nodemailer

## Local Setup

### 1. Backend
```bash
cd backend
npm install
npm run dev            # starts on http://localhost:5000
```

You need, at minimum, to fill in:
- `MONGODB_URI` — free cluster at mongodb.com/atlas
- `GEMINI_API_KEY` — free at aistudio.google.com/app/apikey
- `SMTP_USER` / `SMTP_PASS` — your Gmail + an [App Password](https://myaccount.google.com/apppasswords)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` — from [Google Cloud Console](https://console.cloud.google.com) (enable the Calendar API, create OAuth2 credentials)
- `GITHUB_TOKEN` (optional but recommended) — raises GitHub API rate limit from 60/hr to 5000/hr

**One-time Google Calendar authorization** (after backend is running):
1. Visit `GET http://localhost:5000/api/calendar/auth-url` → open the returned URL → approve access.
2. You'll be redirected to `/api/calendar/oauth2callback`, which returns a JSON blob containing `refresh_token`.
3. Copy that `refresh_token` into your `.env` as `GOOGLE_REFRESH_TOKEN` and restart the server.
4. From then on, interview scheduling works without any further auth.

### 2. Frontend
```bash
cd frontend
npm install
npm run dev            # starts on http://localhost:5173
```

## Usage Walkthrough

1. **Upload Candidates** — upload the candidate CSV (name, email, college,
   branch, cgpa, best_ai_project, research_work, github, resume).
2. **Job Description** — paste the role's JD, optionally list must-have
   skills, optionally tune scoring weights.
3. **Run AI Pipeline** — click through in order: Process Resumes → Analyze
   GitHub → Evaluate vs JD → Rank Candidates. Each step is safe to re-run.
4. **Ranking Dashboard** — see all candidates sorted by final score; click
   "Why?" on any row to see the AI's reasoning for that candidate's resume
   and GitHub scores. Shortlist the top N.
5. **Send Tests** — paste your test platform's link; emails go out to all
   `shortlisted` candidates from your own email account.
6. **Upload Test Results** — once candidates complete tests, upload the
   results CSV (name, email, test_la, test_code), then go back to step 3
   and re-run "Rank Candidates" to fold test scores into the final ranking.
7. **Schedule Interviews** — pick a start time/duration/gap; the system
   books real, sequential Google Calendar events with auto-generated Meet
   links for all qualified candidates, and emails each one a confirmation.

## Deployment

**Backend → Render**
- New Web Service → connect repo → root directory `backend`
- Build command: `npm install` · Start command: `npm start`
- Add all `.env` variables in the Render dashboard
- Update `GOOGLE_REDIRECT_URI` to your live Render URL + `/api/calendar/oauth2callback`
  (and update this in Google Cloud Console's OAuth credentials too), then
  redo the one-time Calendar authorization against the live URL.

**Frontend → Vercel**
- New Project → root directory `frontend`
- Framework preset: Vite
- Env var: `VITE_API_BASE_URL=https://your-backend.onrender.com/api`

## API Reference (quick)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/candidates/upload` | Upload candidate CSV |
| POST | `/api/candidates/upload-test-results` | Upload test result CSV |
| GET | `/api/candidates` | List/rank candidates |
| POST | `/api/job-descriptions` | Create a JD |
| POST | `/api/pipeline/process-resumes` | Download + parse resumes |
| POST | `/api/pipeline/analyze-github` | GitHub repo analysis + AI summary |
| POST | `/api/pipeline/evaluate` | AI resume-vs-JD scoring |
| POST | `/api/pipeline/rank` | Compute weighted final scores |
| POST | `/api/pipeline/shortlist` | Mark top N as shortlisted |
| POST | `/api/email/send-test-links` | Email test links to shortlisted candidates |
| GET | `/api/calendar/auth-url` | One-time Calendar OAuth setup |
| POST | `/api/calendar/schedule-bulk` | Schedule sequential interviews with Meet links |
