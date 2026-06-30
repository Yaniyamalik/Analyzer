const express = require("express");
const fs = require("fs");
const csv = require("csv-parser");
const upload = require("../middleware/upload");
const Candidate = require("../models/Candidate");

const router = express.Router();

// Maps possible CSV header variants to our schema fields
const FIELD_MAP = {
  s_no: "s_no",
  name: "name",
  email: "email",
  college: "college",
  branch: "branch",
  cgpa: "cgpa",
  best_ai_project: "bestAiProject",
  research_work: "researchWork",
  github: "github",
  resume: "resume",
  test_la: "test_la",
  test_code: "test_code",
};

function mapRow(row) {
  const mapped = {};
  for (const key of Object.keys(row)) {
    const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, "_");
    if (FIELD_MAP[normalizedKey]) {
      let val = row[key];
      if (["cgpa", "test_la", "test_code", "s_no"].includes(normalizedKey)) {
        val = val === "" || val == null ? null : Number(val);
      }
      mapped[FIELD_MAP[normalizedKey]] = val;
    }
  }
  return mapped;
}

// POST /api/candidates/upload  - upload main candidate dataset CSV
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (row) => results.push(mapRow(row)))
    .on("end", async () => {
      try {
        const ops = results
          .filter((r) => r.email)
          .map((r) => ({
            updateOne: {
              filter: { email: r.email, name: r.name },
              update: { $set: r, $setOnInsert: { stage: "uploaded" } },
              upsert: true,
            },
          }));
        if (ops.length > 0) await Candidate.bulkWrite(ops);
        fs.unlinkSync(req.file.path);
        res.json({ message: `Uploaded ${ops.length} candidates`, count: ops.length });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    })
    .on("error", (err) => res.status(500).json({ error: err.message }));
});

// POST /api/candidates/upload-test-results - upload test_la/test_code CSV after testing
router.post("/upload-test-results", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (row) => results.push(mapRow(row)))
    .on("end", async () => {
      try {
        let updated = 0;
        for (const r of results) {
          if (!r.email) continue;
          const update = await Candidate.updateOne(
            { email: r.email, name: r.name },
            { $set: { test_la: r.test_la, test_code: r.test_code, stage: "test_completed" } }
          );
          if (update.matchedCount > 0) updated++;
        }
        fs.unlinkSync(req.file.path);
        res.json({ message: `Updated test results for ${updated} candidates` });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    })
    .on("error", (err) => res.status(500).json({ error: err.message }));
});

// GET /api/candidates - list all, sorted by final score desc
router.get("/", async (req, res) => {
  const { stage, minScore } = req.query;
  const filter = {};
  if (stage) filter.stage = stage;
  if (minScore) filter["scores.finalScore"] = { $gte: Number(minScore) };

  const candidates = await Candidate.find(filter).sort({ "scores.finalScore": -1 });
  res.json(candidates);
});

// GET /api/candidates/:id
router.get("/:id", async (req, res) => {
  const candidate = await Candidate.findById(req.params.id);
  if (!candidate) return res.status(404).json({ error: "Not found" });
  res.json(candidate);
});

// PATCH /api/candidates/:id/stage - manual stage override (e.g. reject)
router.patch("/:id/stage", async (req, res) => {
  const { stage } = req.body;
  const candidate = await Candidate.findByIdAndUpdate(req.params.id, { stage }, { new: true });
  res.json(candidate);
});

module.exports = router;
