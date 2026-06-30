const mongoose = require("mongoose");

const JobDescriptionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    mustHaveSkills: [String],
    weights: {
      resume: { type: Number, default: 0.35 },
      github: { type: Number, default: 0.25 },
      cgpa: { type: Number, default: 0.1 },
      test: { type: Number, default: 0.3 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("JobDescription", JobDescriptionSchema);
