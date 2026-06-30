const express = require("express");
const JobDescription = require("../models/JobDescription");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const jd = await JobDescription.create(req.body);
    res.json(jd);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  const jds = await JobDescription.find().sort({ createdAt: -1 });
  res.json(jds);
});

router.get("/:id", async (req, res) => {
  const jd = await JobDescription.findById(req.params.id);
  if (!jd) return res.status(404).json({ error: "Not found" });
  res.json(jd);
});

router.put("/:id", async (req, res) => {
  const jd = await JobDescription.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(jd);
});

module.exports = router;
