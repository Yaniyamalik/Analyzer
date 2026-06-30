## Architecture Document — Visl AI Candidate Screening Platform

## Overview

This is a MERN app that takes the recruitment workflow described in the assignment and automates it end to end: candidates come in as a CSV, resumes get pulled and parsed, an LLM scores them against the job description, GitHub gets analyzed at the repo level, everything gets combined into a ranked list, shortlisted candidates get emailed a test link, results come back in, and qualified candidates get real Google Calendar interviews with Meet links — all without anyone touching a spreadsheet by hand after the initial upload.

```
React (Vercel)  <--->  Express API (Render)  <--->  MongoDB
                              |
              ----------------------------------------------
              |            |              |               |
        Google Drive   Gemini API    GitHub REST API   Google Calendar
        (resumes)     (scoring)      (repo data)        + Nodemailer
```

## Why MERN

Mostly speed of execution given the timeline — one language across the stack, JSON everywhere, no context switching between a Python backend and a JS frontend. MongoDB also fits the data better than a relational DB would have: candidate records have a lot of variable-length, semi-structured fields (project descriptions, nested scoring breakdowns that grow as the pipeline runs), and forcing that into rigid tables would have cost more time than it saved.

## Data model

The Candidate document is really the center of the whole thing. It holds the raw CSV fields, plus everything derived from processing (extracted resume text, GitHub analysis results), a scores sub-object that stores not just numbers but the reasoning behind them, and a `stage` field that tracks where the candidate currently is in the pipeline — uploaded, resume processed, evaluated, ranked, shortlisted, test sent, test completed, interview scheduled. Using stage as a kind of state machine means the dashboard can always just ask "what's true right now" with a single query, and any pipeline step can be re-run safely without messing up what came before it.

JobDescription is simpler — just the JD text, optional must-have skills, and configurable weights for the scoring formula, so the same candidate pool can be re-evaluated against a different role without re-running steps that don't need to change.

## How the AI evaluation actually works

The main thing I wanted to avoid was a black-box score with no explanation, since "explainable AI scoring" is literally called out as a bonus point. So every Gemini call is prompted to return structured JSON, not just a number — score, reasoning, skill matches, skill gaps, strengths, concerns. That reasoning field is what shows up in the dashboard when you click "Why?" on a candidate.

For GitHub, instead of just throwing the profile at Gemini and asking "is this good," I pull actual repo-level data first — top non-fork repos, languages, commit counts, last push dates — through the GitHub API, and only then ask Gemini to assess that concrete evidence. That was specifically to satisfy the "repository-level evaluation" requirement and also just produces a better signal — it stops a profile with 50 forked tutorial repos from looking better than one with 3 real projects.

Resume scoring and GitHub scoring are two separate calls rather than one combined prompt. Partly for resilience (if GitHub analysis fails for some candidates due to a rate limit, you don't have to burn Gemini calls re-evaluating resumes too), and partly because keeping each prompt narrowly focused makes the JSON output more reliable.

## Scoring and ranking

The final score is a weighted average of four signals: resume relevance, GitHub score, normalized CGPA, and test performance (logical aptitude + coding test averaged together). Weights are configurable per job description, defaulting to 35/25/10/30.

The one decision worth calling out here is what happens when a candidate doesn't have all four signals yet — which is basically always true right after upload, since nobody's taken a test yet. Instead of treating a missing test score as a zero (which would tank early-stage candidates unfairly) or blocking ranking entirely until every signal exists, the scoring engine just drops the missing signal and renormalizes the remaining weights so they still sum to 1. So a candidate can be meaningfully ranked the moment their resume is scored, and the ranking gets more accurate as more data comes in — closer to how a recruiter actually builds up an impression of someone over time rather than waiting for a complete file.

CGPA is intentionally weighted low. It correlates a little with diligence but it's a weak signal for actual engineering ability compared to real project work, so it's there but it doesn't dominate.

## Why the pipeline is split into separate steps

Each stage — process resumes, analyze GitHub, evaluate, rank, shortlist — is its own endpoint instead of one big "run everything" job, and they're all safe to re-run. A few reasons this made sense given the 60-hour window:

External calls are the most likely thing to fail (Drive downloads can hit permission issues, Gemini and GitHub both have rate limits), so if 3 out of 50 candidates fail GitHub analysis, the other 47 still finish and you just re-run that one step instead of starting over. Concurrency is capped at 3 simultaneous calls via `p-limit` so a single click doesn't blow through the GitHub or Gemini free-tier limits. And honestly, it also matches how a recruiter would actually want to use this — looking at results after each stage rather than trusting one opaque batch process to do everything correctly in one shot.

## Email and calendar

Email goes through Nodemailer using the recruiter's own SMTP login (a Gmail App Password works fine), since the assignment specifically says candidates need to be emailed from your own account rather than a third-party service.

Calendar scheduling uses a real OAuth2 flow against the Google Calendar API — not a fake or simulated booking. You authorize once through `/api/calendar/auth-url`, and the refresh token that comes back gets stored server-side so you don't have to re-auth for every candidate. Each event is created with `conferenceData.createRequest` set to `hangoutsMeet`, which generates an actual Meet link tied to a real calendar event, and `sendUpdates: 'all'` means the candidate gets a native Calendar invite automatically on top of the confirmation email the app sends separately.

## Scalability

The API itself holds no state in memory — everything lives in MongoDB — so it can scale horizontally without any rework. CSV ingestion uses bulk upserts instead of saving rows one at a time, so a few thousand rows doesn't mean a few thousand round trips to the database. The concurrency cap on external calls also doubles as memory protection against accidentally firing off hundreds of requests at once on a big dataset.

If this needed to handle real volume, the next move would be putting the pipeline behind a proper job queue (BullMQ + Redis) instead of doing the work synchronously inside an HTTP request — resume parsing plus two AI calls per candidate is too slow to hold a request open for thousands of rows. I didn't build that for this version since it wasn't worth the time cost for an MVP, but the way things are already split into small, idempotent, per-candidate operations means it would drop into a queue without much restructuring — each function wrapped in `limit()` is basically already a self-contained job.

Timestamps like `resumeParsedAt` and `githubAnalyzedAt` also act as a simple caching layer, so re-running a pipeline step doesn't waste time and API calls reprocessing candidates that haven't changed.

## What's not handled (being upfront about it)

Google Drive downloads work fine as long as the file is shared as "anyone with the link," but large files sometimes trigger Drive's virus-scan warning page instead of returning the file directly — the app detects that and reports it as an explicit error rather than silently trying to parse garbage.

GitHub commit counts are estimated using the pagination header rather than walking every single commit, which is fast but slightly approximate for repos with a huge commit history.

There's no login/auth layer on the dashboard itself. Given the time budget, that felt like the right thing to cut in favor of actually building out the AI evaluation and automation pieces the assignment is graded on — but it would be the first thing added before this went anywhere near production, most likely a simple JWT gate in front of the existing API.