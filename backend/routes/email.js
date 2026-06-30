const express = require("express");
const Candidate = require("../models/Candidate");
const JobDescription = require("../models/JobDescription");
const { sendTestLinkEmail } = require("../services/emailService");

const router = express.Router();

// POST /api/email/send-test-links
// body: { testLink: "https://...", candidateIds: [optional array, else all stage=shortlisted] }
router.post("/send-test-links", async (req, res) => {
  const { testLink, candidateIds } = req.body;
  if (!testLink) return res.status(400).json({ error: "testLink is required" });

  const filter = candidateIds && candidateIds.length ? { _id: { $in: candidateIds } } : { stage: "shortlisted" };
  const candidates = await Candidate.find(filter);

  const results = [];
  for (const c of candidates) {
    try {
      const jd = c.jobDescriptionId ? await JobDescription.findById(c.jobDescriptionId) : null;
      await sendTestLinkEmail({ to: c.email, name: c.name, testLink, jobTitle: jd?.title });
      c.testEmailSentAt = new Date();
      c.stage = "test_sent";
      await c.save();
      results.push({ id: c._id, name: c.name, success: true });
    } catch (err) {
      results.push({ id: c._id, name: c.name, success: false, error: err.message });
    }
  }

  res.json({ sent: results.filter((r) => r.success).length, results });
});

module.exports = router;
