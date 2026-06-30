const express = require("express");
const Candidate = require("../models/Candidate");
const JobDescription = require("../models/JobDescription");
const { getAuthUrl, exchangeCodeForTokens, scheduleInterview } = require("../services/calendarService");
const { sendInterviewInviteEmail } = require("../services/emailService");

const router = express.Router();

// GET /api/calendar/auth-url - returns the Google OAuth2 authorization URL for the frontend to redirect the user to
router.get("/auth-url", (req, res) => {
  res.json({ url: getAuthUrl() });
});

// GET /api/calendar/oauth2callback - Google redirects here with ?code=-- exchange the code for tokens and return them to the frontend
router.get("/oauth2callback", async (req, res) => {
  try {
    const tokens = await exchangeCodeForTokens(req.query.code);
    res.json({
      message: "Save 'refresh_token' below as GOOGLE_REFRESH_TOKEN in your backend .env, then restart the server.",
      tokens,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calendar/schedule
// body: { candidateId, startTime: ISOString, durationMinutes? }
router.post("/schedule", async (req, res) => {
  const { candidateId, startTime, durationMinutes } = req.body;
  const candidate = await Candidate.findById(candidateId);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  try {
    const jd = candidate.jobDescriptionId ? await JobDescription.findById(candidate.jobDescriptionId) : null;

    const { eventId, meetLink } = await scheduleInterview({
      candidateEmail: candidate.email,
      candidateName: candidate.name,
      startTime,
      durationMinutes,
      jobTitle: jd?.title,
    });

    candidate.interview = { scheduledAt: new Date(startTime), calendarEventId: eventId, meetLink };
    candidate.stage = "interview_scheduled";
    await candidate.save();

    // Calendar invite is sent natively via sendUpdates:'all'; also send a friendly email.
    await sendInterviewInviteEmail({
      to: candidate.email,
      name: candidate.name,
      meetLink,
      scheduledAt: startTime,
      jobTitle: jd?.title,
    });

    res.json({ message: "Interview scheduled", eventId, meetLink });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calendar/schedule-bulk
// body: { candidateIds: [...], startTime: ISOString, intervalMinutes }
// schedules sequential interview slots starting at startTime
router.post("/schedule-bulk", async (req, res) => {
  const { candidateIds, startTime, durationMinutes = 30, intervalMinutes = 30 } = req.body;
  const results = [];

  let slot = new Date(startTime);
  for (const id of candidateIds) {
    const candidate = await Candidate.findById(id);
    if (!candidate) continue;

    try {
      const jd = candidate.jobDescriptionId ? await JobDescription.findById(candidate.jobDescriptionId) : null;
      const { eventId, meetLink } = await scheduleInterview({
        candidateEmail: candidate.email,
        candidateName: candidate.name,
        startTime: slot,
        durationMinutes,
        jobTitle: jd?.title,
      });

      candidate.interview = { scheduledAt: new Date(slot), calendarEventId: eventId, meetLink };
      candidate.stage = "interview_scheduled";
      await candidate.save();

      await sendInterviewInviteEmail({ to: candidate.email, name: candidate.name, meetLink, scheduledAt: slot, jobTitle: jd?.title });

      results.push({ id, name: candidate.name, success: true, slot: new Date(slot), meetLink });
    } catch (err) {
      results.push({ id, name: candidate.name, success: false, error: err.message });
    }

    slot = new Date(slot.getTime() + intervalMinutes * 60000);
  }

  res.json({ scheduled: results.filter((r) => r.success).length, results });
});

module.exports = router;
