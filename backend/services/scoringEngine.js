//Normalizes CGPA (assumed 0-10 scale) to a 0-100 score.

function normalizeCgpa(cgpa) {
  if (cgpa == null || isNaN(cgpa)) return null;
  return Math.max(0, Math.min(100, (cgpa / 10) * 100));
}

/* Combines logical aptitude (test_la) and coding test (test_code) into one 0-100 score.
 Equal weight by default; both are assumed to already be 0-100 scaled per the dataset.
 */
function normalizeTestScore(test_la, test_code) {
  const vals = [test_la, test_code].filter((v) => v != null && !isNaN(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/*Computes the final weighted score and returns a full breakdown for transparency.
  Any signal that is null (e.g., test not yet taken) is excluded and weights are
 re-normalized across the remaining available signals so candidates aren't
  unfairly penalized for a stage they haven't reached yet.
 */
function computeFinalScore({ resumeRelevance, githubScore, cgpa, test_la, test_code, weights }) {
  const cgpaScore = normalizeCgpa(cgpa);
  const testScore = normalizeTestScore(test_la, test_code);

  const components = [
    { key: "resume", value: resumeRelevance, weight: weights.resume },
    { key: "github", value: githubScore, weight: weights.github },
    { key: "cgpa", value: cgpaScore, weight: weights.cgpa },
    { key: "test", value: testScore, weight: weights.test },
  ].filter((c) => c.value != null);

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0 || components.length === 0) {
    return { finalScore: null, cgpaScore, testScore, weightsUsed: weights };
  }

  const finalScore =
    components.reduce((sum, c) => sum + c.value * (c.weight / totalWeight), 0);

  return {
    finalScore: Math.round(finalScore * 100) / 100,
    cgpaScore,
    testScore,
    weightsUsed: weights,
  };
}

module.exports = { computeFinalScore, normalizeCgpa, normalizeTestScore };
