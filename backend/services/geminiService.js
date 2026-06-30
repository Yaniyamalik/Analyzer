const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL = "gemini-2.0-flash"; // fast + generous free tier; swap to gemini-1.5-pro if needed

function getModel() {
  return genAI.getGenerativeModel({ model: MODEL });
}

// Strips markdown code fences from a model response so JSON.parse works reliably.
function cleanJson(text) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

/* Scores a candidate's resume / project text against a job description.
  Returns explainable output: a 0-100 score plus reasoning and sub-criteria.
 */
async function evaluateResumeAgainstJD({ resumeText, bestAiProject, researchWork, jobDescription, mustHaveSkills }) {
  const model = getModel();

  const prompt = `You are a strict, fair technical recruiter evaluating a candidate for the following role.

JOB DESCRIPTION:
${jobDescription}

MUST-HAVE SKILLS (if provided): ${mustHaveSkills && mustHaveSkills.length ? mustHaveSkills.join(", ") : "Not specified"}

CANDIDATE MATERIAL:
--- Resume text (may be partially extracted, can contain noise) ---
${resumeText ? resumeText.slice(0, 6000) : "(Resume text unavailable)"}

--- Best AI Project (self-described) ---
${bestAiProject || "Not provided"}

--- Research Work ---
${researchWork || "Not provided"}

TASK:
Evaluate how relevant and strong this candidate is for the role above. Consider: relevance of skills/projects to the JD, depth of technical work (not just buzzwords), evidence of real implementation vs surface-level description, and any must-have skill matches.

Respond ONLY with raw JSON (no markdown fences, no preamble) in exactly this shape:
{
  "score": <integer 0-100>,
  "skillMatches": ["skill1", "skill2"],
  "skillGaps": ["missing skill1"],
  "strengths": "1-2 sentence summary of strongest evidence",
  "concerns": "1-2 sentence summary of weaknesses or red flags (e.g. buzzword-heavy, no real implementation evidence)",
  "reasoning": "2-3 sentence explanation of how you arrived at the score, citing specific evidence from the material above"
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(cleanJson(text));
    return { ...parsed, error: null };
  } catch (err) {
    return {
      score: null,
      skillMatches: [],
      skillGaps: [],
      strengths: "",
      concerns: "",
      reasoning: "",
      error: `Gemini evaluation failed: ${err.message}`,
    };
  }
}

/*
  Summarizes a candidate's GitHub repository-level data into a technical
  assessment with an explainable score.
 */
async function evaluateGithubProfile({ repoData, username }) {
  const model = getModel();

  const prompt = `You are evaluating the GitHub profile of a candidate (username: ${username}) for technical hiring purposes.

REPOSITORY-LEVEL DATA (top repos by activity/stars):
${JSON.stringify(repoData, null, 2).slice(0, 6000)}

TASK:
Assess the candidate's technical contributions based on this repository-level evidence. Consider: code activity/consistency (commit counts, recency), project diversity and complexity, language depth, community signal (stars/forks, though weight this lightly for students), and whether repos look like genuine substantive work vs forked/tutorial/empty repos.

Respond ONLY with raw JSON (no markdown fences) in exactly this shape:
{
  "score": <integer 0-100>,
  "summary": "2-3 sentence technical summary of what this candidate has actually built/contributed",
  "redFlags": "note if repos appear to be mostly forks, tutorials, or near-empty; empty string if none",
  "reasoning": "1-2 sentence explanation of the score"
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(cleanJson(text));
    return { ...parsed, error: null };
  } catch (err) {
    return { score: null, summary: "", redFlags: "", reasoning: "", error: `Gemini GitHub evaluation failed: ${err.message}` };
  }
}

module.exports = { evaluateResumeAgainstJD, evaluateGithubProfile };
