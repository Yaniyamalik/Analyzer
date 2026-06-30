import React, { useState, useEffect, useCallback } from "react";
import api from "./api/client";
import Sidebar from "./components/Sidebar";

function UploadCandidates({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");

  const handleUpload = async () => {
    if (!file) return;
    setStatus("Uploading...");
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post("/candidates/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setStatus(` ${data.message}`);
      onUploaded();
    } catch (err) {
      setStatus(` ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="card">
      <h2>Upload Candidate Dataset (CSV)</h2>
      <p className="hint">Expected columns: name, email, college, branch, cgpa, best_ai_project, research_work, github, resume</p>
      <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={handleUpload} disabled={!file}>Upload</button>
      <p>{status}</p>
    </div>
  );
}

function JobDescriptionForm({ jds, onCreated, selectedJd, setSelectedJd }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState("");
  const [weights, setWeights] = useState({ resume: 0.35, github: 0.25, cgpa: 0.1, test: 0.3 });
  const [status, setStatus] = useState("");

  const submit = async () => {
    if (!title || !description) return setStatus("Title and description required");
    try {
      const { data } = await api.post("/job-descriptions", {
        title,
        description,
        mustHaveSkills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        weights,
      });
      setStatus(" Job description created");
      setSelectedJd(data._id);
      onCreated();
    } catch (err) {
      setStatus(` ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="card">
      <h2>Job Description</h2>
      <input placeholder="Role title (e.g. Founding AI Engineer)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="Paste full job description here..." rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
      <input placeholder="Must-have skills, comma separated (optional)" value={skills} onChange={(e) => setSkills(e.target.value)} />

      <div className="weights-row">
        {Object.keys(weights).map((k) => (
          <label key={k}>
            {k} weight
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={weights[k]}
              onChange={(e) => setWeights({ ...weights, [k]: parseFloat(e.target.value) })}
            />
          </label>
        ))}
      </div>

      <button onClick={submit}>Create Job Description</button>
      <p>{status}</p>

      {jds.length > 0 && (
        <div>
          <h3>Existing Job Descriptions</h3>
          <select value={selectedJd || ""} onChange={(e) => setSelectedJd(e.target.value)}>
            <option value="">-- select --</option>
            {jds.map((jd) => (
              <option key={jd._id} value={jd._id}>{jd.title}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function PipelineRunner({ selectedJd, refreshCandidates }) {
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  const run = async (label, fn) => {
    setBusy(true);
    setLog((l) => [...l, `▶ ${label}...`]);
    try {
      const { data } = await fn();
      setLog((l) => [...l, ` ${label} done — ${JSON.stringify(summarize(data))}`]);
    } catch (err) {
      setLog((l) => [...l, ` ${label} failed — ${err.response?.data?.error || err.message}`]);
    }
    setBusy(false);
    refreshCandidates();
  };

  const summarize = (data) => {
    if (data.processed != null) return { processed: data.processed };
    if (data.ranked) return { ranked: data.ranked.length };
    return data;
  };

  return (
    <div className="card">
      <h2>Run AI Pipeline</h2>
      <p className="hint">Run these in order. Each step is idempotent — safe to re-run.</p>
      <div className="btn-row">
        <button disabled={busy} onClick={() => run("Process Resumes", () => api.post("/pipeline/process-resumes"))}>
          1. Process Resumes
        </button>
        <button disabled={busy} onClick={() => run("Analyze GitHub", () => api.post("/pipeline/analyze-github"))}>
          2. Analyze GitHub
        </button>
        <button
          disabled={busy || !selectedJd}
          onClick={() => run("Evaluate vs JD", () => api.post("/pipeline/evaluate", { jobDescriptionId: selectedJd }))}
        >
          3. Evaluate vs JD {!selectedJd && "(select JD first)"}
        </button>
        <button disabled={busy} onClick={() => run("Rank Candidates", () => api.post("/pipeline/rank", { jobDescriptionId: selectedJd }))}>
          4. Rank Candidates
        </button>
      </div>
      <div className="log">
        {log.map((line, i) => <div key={i}>{line}</div>)}
      </div>
    </div>
  );
}

function RankingDashboard({ candidates, refreshCandidates }) {
  const [expanded, setExpanded] = useState(null);
  const [topN, setTopN] = useState(5);
  const [status, setStatus] = useState("");

  const shortlist = async () => {
    try {
      const { data } = await api.post("/pipeline/shortlist", { topN: Number(topN) });
      setStatus(` Shortlisted ${data.shortlisted.length} candidates`);
      refreshCandidates();
    } catch (err) {
      setStatus(` ${err.message}`);
    }
  };

  return (
    <div className="card">
      <h2>Ranking Dashboard</h2>
      <div className="btn-row">
        <label>
          Shortlist top
          <input type="number" value={topN} onChange={(e) => setTopN(e.target.value)} style={{ width: 60, marginLeft: 6 }} />
        </label>
        <button onClick={shortlist}>Shortlist</button>
        <span>{status}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th><th>Name</th><th>Stage</th><th>Final Score</th><th>Resume</th><th>GitHub</th><th>CGPA</th><th>Test</th><th></th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => (
            <React.Fragment key={c._id}>
              <tr>
                <td>{i + 1}</td>
                <td>{c.name}</td>
                <td><span className={`badge ${c.stage}`}>{c.stage}</span></td>
                <td><strong>{c.scores?.finalScore?.toFixed?.(1) ?? "—"}</strong></td>
                <td>{c.scores?.resumeRelevance ?? "—"}</td>
                <td>{c.scores?.githubScore ?? "—"}</td>
                <td>{c.scores?.cgpaScore?.toFixed?.(0) ?? "—"}</td>
                <td>{c.scores?.testScore?.toFixed?.(0) ?? "—"}</td>
                <td><button onClick={() => setExpanded(expanded === c._id ? null : c._id)}>{expanded === c._id ? "Hide" : "Why?"}</button></td>
              </tr>
              {expanded === c._id && (
                <tr className="explain-row">
                  <td colSpan={9}>
                    <strong>Resume reasoning:</strong> {c.scores?.resumeReasoning || "Not evaluated yet"}<br />
                    <strong>GitHub reasoning:</strong> {c.scores?.githubReasoning || "Not analyzed yet"}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SendTests({ candidates }) {
  const [testLink, setTestLink] = useState("");
  const [status, setStatus] = useState("");
  const shortlisted = candidates.filter((c) => c.stage === "shortlisted");

  const send = async () => {
    if (!testLink) return setStatus("Enter a test link first");
    setStatus("Sending...");
    try {
      const { data } = await api.post("/email/send-test-links", { testLink });
      setStatus(` Sent to ${data.sent} candidates`);
    } catch (err) {
      setStatus(` ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="card">
      <h2>Send Test Links</h2>
      <p className="hint">{shortlisted.length} candidates currently in 'shortlisted' stage will receive this email.</p>
      <input placeholder="https://your-test-platform.com/test/abc123" value={testLink} onChange={(e) => setTestLink(e.target.value)} />
      <button onClick={send}>Send Test Links</button>
      <p>{status}</p>
    </div>
  );
}

function UploadTestResults({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");

  const handleUpload = async () => {
    if (!file) return;
    setStatus("Uploading...");
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post("/candidates/upload-test-results", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setStatus(`${data.message}`);
      onUploaded();
    } catch (err) {
      setStatus(` ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="card">
      <h2>Upload Test Results (CSV)</h2>
      <p className="hint">Expected columns: name, email, test_la, test_code. Re-run "Rank Candidates" afterward to fold these into final scores.</p>
      <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={handleUpload} disabled={!file}>Upload</button>
      <p>{status}</p>
    </div>
  );
}


function ScheduleInterviews({ candidates, refreshCandidates }) {
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(30);
  const [interval, setInterval] = useState(30);
  const [status, setStatus] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const qualified = candidates.filter((c) => c.stage === "test_completed" || c.stage === "shortlisted");

  useEffect(() => {
    api.get("/calendar/auth-url").then(({ data }) => setAuthUrl(data.url)).catch(() => {});
  }, []);

  const scheduleBulk = async () => {
    if (!startTime) return setStatus("Pick a start time first");
    setStatus("Scheduling...");
    try {
      const { data } = await api.post("/calendar/schedule-bulk", {
        candidateIds: qualified.map((c) => c._id),
        startTime,
        durationMinutes: Number(duration),
        intervalMinutes: Number(interval),
      });
      setStatus(`Scheduled ${data.scheduled} interviews`);
      refreshCandidates();
    } catch (err) {
      setStatus(` ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="card">
      <h2>Schedule Interviews</h2>
      
      <p className="hint">{qualified.length} qualified candidates will be scheduled sequentially starting at the time below.</p>
      <label>Start time <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
      <label>Duration (min) <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></label>
      <label>Gap between interviews (min) <input type="number" value={interval} onChange={(e) => setInterval(e.target.value)} /></label>
      <button onClick={scheduleBulk}>Schedule All Qualified Interviews</button>
      <p>{status}</p>
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState(0);
  const [candidates, setCandidates] = useState([]);
  const [jds, setJds] = useState([]);
  const [selectedJd, setSelectedJd] = useState("");

  const refreshCandidates = useCallback(() => {
    api.get("/candidates").then(({ data }) => setCandidates(data)).catch(() => {});
  }, []);

  const refreshJds = useCallback(() => {
    api.get("/job-descriptions").then(({ data }) => setJds(data)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshCandidates();
    refreshJds();
  }, [refreshCandidates, refreshJds]);

  return (
    <div className="app-container">

      <Sidebar active={active} setActive={setActive} />

    <div className="dashboard-content">

      <header className="main-header">

  <h1>VISL AI Candidate Screening Platform</h1>

  <div className="workflow-steps">

    <span>1.  Upload CSV</span>
    <span>→</span>

    <span>2. Job Description</span>
    <span>→</span>

    <span>3. Process Resume</span>
    <span>→</span>

    <span>4. AI Evaluation</span>
    <span>→</span>

    <span> 5. GitHub Analysis</span>
    <span>→</span>

    <span> 6. Rank Candidates</span>
    <span>→</span>

    <span> 7. Send Test Link</span>
    <span>→</span>

    <span> 8. Upload Results</span>
    <span>→</span>

    <span> 9. Shortlist</span>
    <span>→</span>

    <span>10. Schedule Interview</span>
    <span>→</span>

    <span> 11. Google Meet Invite</span>

  </div>

</header>
      <div className="content-card">
        {active === 0 && <UploadCandidates onUploaded={refreshCandidates} />}
        {active === 1 && <JobDescriptionForm jds={jds} onCreated={refreshJds} selectedJd={selectedJd} setSelectedJd={setSelectedJd} />}
        {active === 2 && <PipelineRunner selectedJd={selectedJd} refreshCandidates={refreshCandidates} />}
        {active === 3 && <RankingDashboard candidates={candidates} refreshCandidates={refreshCandidates} />}
        {active === 4 && <SendTests candidates={candidates} />}
        {active === 5 && <UploadTestResults onUploaded={refreshCandidates} />}
        {active === 6 && (<RankingDashboard candidates={candidates} refreshCandidates={refreshCandidates} />)}
        {active === 7 && (<ScheduleInterviews candidates={candidates} refreshCandidates={refreshCandidates} />)}
      </div>

      <footer>
        AI Powered Hiring Automation Platform
     </footer>
      </div>
    </div>
  );
}
