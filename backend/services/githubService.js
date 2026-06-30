const axios = require("axios");

const GITHUB_API = "https://api.github.com";

function extractUsername(githubUrl) {
  if (!githubUrl) return null;
  const match = githubUrl.match(/github\.com\/([A-Za-z0-9-]+)/);
  return match ? match[1] : null;
}

function authHeaders() {
  const headers = { "User-Agent": "Visl-AI-Screener" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/*Fetches repo-level data: user profile, top repos (by stars then recent push),
  and commit counts for each top repo (capped to avoid rate-limit blowups).
 */
async function analyzeGithubProfile(githubUrl) {
  const username = extractUsername(githubUrl);
  if (!username) {
    return { error: "Could not extract GitHub username from URL", username: null };
  }

  try {
    const headers = authHeaders();

    const userResp = await axios.get(`${GITHUB_API}/users/${username}`, { headers });
    const reposResp = await axios.get(
      `${GITHUB_API}/users/${username}/repos?per_page=100&sort=pushed`,
      { headers }
    );

    const repos = reposResp.data || [];
    const nonForks = repos.filter((r) => !r.fork);
    const sorted = nonForks.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));
    const topRepos = sorted.slice(0, 6);

    const languageDistribution = {};
    repos.forEach((r) => {
      if (r.language) {
        languageDistribution[r.language] = (languageDistribution[r.language] || 0) + 1;
      }
    });

    // Fetch commit counts for top repos (limited, sequential, to respect rate limits)
    let totalCommitsAnalyzed = 0;
    const enrichedTopRepos = [];
    for (const repo of topRepos) {
      let commitCount = null;
      try {
        const commitsResp = await axios.get(
          `${GITHUB_API}/repos/${username}/${repo.name}/commits?per_page=1`,
          { headers }
        );
        // Use the Link header trick to estimate total commits without paginating fully
        const link = commitsResp.headers["link"];
        if (link) {
          const lastPageMatch = link.match(/page=(\d+)>; rel="last"/);
          commitCount = lastPageMatch ? parseInt(lastPageMatch[1], 10) : commitsResp.data.length;
        } else {
          commitCount = commitsResp.data.length;
        }
      } catch (e) {
        commitCount = null; // empty repo or 409 conflict (no commits) -- not fatal
      }
      totalCommitsAnalyzed += commitCount || 0;

      enrichedTopRepos.push({
        name: repo.name,
        description: repo.description || "",
        language: repo.language || "Unknown",
        stars: repo.stargazers_count || 0,
        forks: repo.forks_count || 0,
        commitCount,
        lastPushed: repo.pushed_at,
      });
    }

    const accountAgeYears = userResp.data.created_at
      ? +((Date.now() - new Date(userResp.data.created_at).getTime()) / (1000 * 60 * 60 * 24 * 365)).toFixed(1)
      : null;

    return {
      error: null,
      username,
      publicRepos: userResp.data.public_repos,
      followers: userResp.data.followers,
      topRepos: enrichedTopRepos,
      languageDistribution,
      totalCommitsAnalyzed,
      accountAgeYears,
    };
  } catch (err) {
    const status = err.response?.status;
    let message = err.message;
    if (status === 404) message = `GitHub user '${username}' not found`;
    if (status === 403) message = `GitHub API rate-limited. Add a GITHUB_TOKEN env var to raise limits.`;
    return { error: message, username };
  }
}

module.exports = { analyzeGithubProfile, extractUsername };
