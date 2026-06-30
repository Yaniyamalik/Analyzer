const express = require("express");
const pLimit = require("p-limit");
const Candidate = require("../models/Candidate");
const JobDescription = require("../models/JobDescription");
const { downloadAndParseResume } = require("../services/resumeParser");
const { analyzeGithubProfile } = require("../services/githubService");
const { evaluateResumeAgainstJD, evaluateGithubProfile } = require("../services/geminiService");
const { computeFinalScore } = require("../services/scoringEngine");

const router = express.Router();
const CONCURRENCY = 3; // keep Gemini/GitHub API calls polite

// POST /api/pipeline/process-resumes - downloads + extracts text for all candidates missing it
router.post("/process-resumes", async (req, res) => {
  const candidates = await Candidate.find({ resume: { $exists: true, $ne: "" }, resumeText: "" });
  const limit = pLimit(CONCURRENCY);
  const results = [];

  await Promise.all(
    candidates.map((c) =>
      limit(async () => {
        const { text, error } = await downloadAndParseResume(c.resume);
        c.resumeText = text || "";
        c.resumeParsedAt = new Date();
        if (!error && text) c.stage = "resume_processed";
        await c.save();
        results.push({ id: c._id, name: c.name, success: !error, error });
      })
    )
  );

  res.json({ processed: results.length, results });
});

// POST /api/pipeline/analyze-github - fetches GitHub repo-level data + Gemini summary
router.post("/analyze-github", async (req, res) => {
  const candidates = await Candidate.find({ github: { $exists: true, $ne: "" }, githubAnalyzedAt: { $exists: false } });
  const limit = pLimit(CONCURRENCY);
  const results = [];

  await Promise.all(
    candidates.map((c) =>
      limit(async () => {
        const ghData = await analyzeGithubProfile(c.github);
        if (ghData.error) {
          results.push({ id: c._id, name: c.name, success: false, error: ghData.error });
          return;
        }

        const aiSummary = await evaluateGithubProfile({ repoData: ghData.topRepos, username: ghData.username });

        c.githubAnalysis = { ...ghData, rawSummary: aiSummary.summary || "" };
        c.githubAnalyzedAt = new Date();
        c.scores = c.scores || {};
        c.scores.githubScore = aiSummary.score;
        c.scores.githubReasoning = [aiSummary.summary, aiSummary.redFlags, aiSummary.reasoning]
          .filter(Boolean)
          .join(" | ");

        await c.save();
        results.push({ id: c._id, name: c.name, success: true, score: aiSummary.score });
      })
    )
  );

  res.json({ processed: results.length, results });
});

// POST /api/pipeline/evaluate - runs Gemini resume-vs-JD scoring for all candidates with parsed resumes
router.post("/evaluate", async (req, res) => {
  const { jobDescriptionId } = req.body;
  if (!jobDescriptionId) return res.status(400).json({ error: "jobDescriptionId is required" });

  const jd = await JobDescription.findById(jobDescriptionId);
  if (!jd) return res.status(404).json({ error: "Job description not found" });

  const candidates = await Candidate.find({});
  const limit = pLimit(CONCURRENCY);
  const results = [];

  await Promise.all(
    candidates.map((c) =>
      limit(async () => {
        const evalResult = await evaluateResumeAgainstJD({
          resumeText: c.resumeText,
          bestAiProject: c.bestAiProject,
          researchWork: c.researchWork,
          jobDescription: jd.description,
          mustHaveSkills: jd.mustHaveSkills,
        });

        c.scores = c.scores || {};
        c.scores.resumeRelevance = evalResult.score;
        c.scores.resumeReasoning = [evalResult.strengths, evalResult.concerns, evalResult.reasoning]
          .filter(Boolean)
          .join(" | ");
        c.jobDescriptionId = jd._id;
        c.stage = "evaluated";
        await c.save();

        results.push({ id: c._id, name: c.name, success: !evalResult.error, score: evalResult.score });
      })
    )
  );

  res.json({ processed: results.length, results });
});

// POST /api/pipeline/rank - computes final weighted score for all candidates and ranks them
router.post("/rank", async (req, res) => {
  const { jobDescriptionId } = req.body;
  const jd = jobDescriptionId ? await JobDescription.findById(jobDescriptionId) : null;
  const weights = jd ? jd.weights : { resume: 0.35, github: 0.25, cgpa: 0.1, test: 0.3 };

  const candidates = await Candidate.find({});

  for (const c of candidates) {
    const { finalScore, cgpaScore, testScore, weightsUsed } = computeFinalScore({
      resumeRelevance: c.scores?.resumeRelevance,
      githubScore: c.scores?.githubScore,
      cgpa: c.cgpa,
      test_la: c.test_la,
      test_code: c.test_code,
      weights,
    });

    c.scores = c.scores || {};
    c.scores.cgpaScore = cgpaScore;
    c.scores.testScore = testScore;
    c.scores.finalScore = finalScore;
    c.scores.weightsUsed = weightsUsed;
    c.stage = c.stage === "uploaded" ? "ranked" : c.stage;
    await c.save();
  }

  const ranked = await Candidate.find({}).sort({ "scores.finalScore": -1 });
  res.json({ ranked: ranked.map((c) => ({ id: c._id, name: c.name, finalScore: c.scores?.finalScore, stage: c.stage })) });
});

// POST /api/pipeline/shortlist - marks top N (or threshold) candidates as shortlisted
router.post("/shortlist", async (req, res) => {
  const { topN, minScore, targetStage } = req.body; // targetStage: 'test_sent' or 'interview_scheduled' stage gating
  let candidates = await Candidate.find({}).sort({ "scores.finalScore": -1 });

  if (minScore != null) candidates = candidates.filter((c) => (c.scores?.finalScore || 0) >= minScore);
  if (topN) candidates = candidates.slice(0, topN);

  const ids = candidates.map((c) => c._id);
  await Candidate.updateMany({ _id: { $in: ids } }, { $set: { stage: "shortlisted" } });

  res.json({ shortlisted: candidates.map((c) => ({ id: c._id, name: c.name, score: c.scores?.finalScore })) });
});

module.exports = router;
