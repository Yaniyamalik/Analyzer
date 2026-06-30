const mongoose = require("mongoose");

const ScoreBreakdownSchema = new mongoose.Schema(
  {
    resumeRelevance: { type: Number, default: null },     // 0-100, JD match
    resumeReasoning: { type: String, default: "" },        // explainability
    githubScore: { type: Number, default: null },           // 0-100
    githubReasoning: { type: String, default: "" },
    cgpaScore: { type: Number, default: null },             // 0-100 normalized
    testScore: { type: Number, default: null },             // 0-100, from test_la + test_code
    finalScore: { type: Number, default: null },            // weighted composite
    weightsUsed: {
      resume: Number,
      github: Number,
      cgpa: Number,
      test: Number,
    },
  },
  { _id: false }
);

const GithubAnalysisSchema = new mongoose.Schema(
  {
    username: String,
    publicRepos: Number,
    followers: Number,
    topRepos: [
      {
        name: String,
        description: String,
        language: String,
        stars: Number,
        forks: Number,
        commitCount: Number,
        lastPushed: String,
      },
    ],
    languageDistribution: { type: Map, of: Number },
    totalCommitsAnalyzed: Number,
    accountAgeYears: Number,
    rawSummary: String, // Gemini-generated repo-level technical summary
  },
  { _id: false }
);

const CandidateSchema = new mongoose.Schema(
  {
    s_no: Number,
    name: { type: String, required: true },
    email: { type: String, required: true, index: true },
    college: String,
    branch: String,
    cgpa: Number,
    bestAiProject: String,
    researchWork: String,
    github: String,
    resume: String, // drive link

    resumeText: { type: String, default: "" }, // extracted text
    resumeParsedAt: Date,

    githubAnalysis: GithubAnalysisSchema,
    githubAnalyzedAt: Date,

    test_la: Number,
    test_code: Number,

    scores: ScoreBreakdownSchema,

    stage: {
      type: String,
      enum: [
        "uploaded",
        "resume_processed",
        "evaluated",
        "ranked",
        "test_sent",
        "test_completed",
        "shortlisted",
        "interview_scheduled",
        "rejected",
      ],
      default: "uploaded",
    },

    jobDescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription" },

    testEmailSentAt: Date,
    interview: {
      scheduledAt: Date,
      calendarEventId: String,
      meetLink: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Candidate", CandidateSchema);
