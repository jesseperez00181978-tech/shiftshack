import { useState, useEffect } from "react";

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [company, setCompany] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("jobs");
    if (saved) setJobs(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("jobs", JSON.stringify(jobs));
  }, [jobs]);

  const addJob = () => {
    if (!company) return;
    setJobs([{ id: Date.now(), company }, ...jobs]);
    setCompany("");
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>ShiftStack 💪</h1>

      <input
        placeholder="Company"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
      />

      <button onClick={addJob}>Add</button>

      <ul>
        {jobs.map((job) => (
          <li key={job.id}>{job.company}</li>
        ))}
      </ul>
    </div>
  );
}
