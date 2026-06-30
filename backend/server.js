require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const candidatesRouter = require("./routes/candidates");
const jobDescriptionsRouter = require("./routes/jobDescriptions");
const pipelineRouter = require("./routes/pipeline");
const emailRouter = require("./routes/email");
const calendarRouter = require("./routes/calendar");

const app = express();
app.use(
  cors({
    origin: "https://visl-ai.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  })
);

app.options("*", cors());
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date() }));

app.use("/api/candidates", candidatesRouter);
app.use("/api/job-descriptions", jobDescriptionsRouter);
app.use("/api/pipeline", pipelineRouter);
app.use("/api/email", emailRouter);
app.use("/api/calendar", calendarRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
