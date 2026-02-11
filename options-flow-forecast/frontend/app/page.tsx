"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_FLOW_API_KEY || "";

export default function HomePage() {
  const [flowFile, setFlowFile] = useState<File | null>(null);
  const [chartFile, setChartFile] = useState<File | null>(null);
  const [symbol, setSymbol] = useState("SPX");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function uploadFlow(): Promise<string> {
    if (!flowFile) throw new Error("Flow file required");
    const fd = new FormData();
    fd.append("file", flowFile);
    fd.append("provider", "unknown");
    fd.append("symbol", symbol);

    const res = await fetch(`${API_BASE}/ingest/flow`, {
      method: "POST",
      body: fd,
      headers: API_KEY ? { "x-api-key": API_KEY } : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Flow upload failed");
    return data.upload_id;
  }

  async function uploadChart(): Promise<string | null> {
    if (!chartFile) return null;
    const fd = new FormData();
    fd.append("file", chartFile);
    fd.append("symbol", symbol);

    const res = await fetch(`${API_BASE}/ingest/chart`, {
      method: "POST",
      body: fd,
      headers: API_KEY ? { "x-api-key": API_KEY } : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Chart upload failed");
    return data.upload_id;
  }

  async function analyze() {
    setLoading(true);
    setResult("");
    try {
      const flowId = await uploadFlow();
      const chartId = await uploadChart();
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { "x-api-key": API_KEY } : {}),
        },
        body: JSON.stringify({ symbol, date, flow_upload_id: flowId, chart_upload_id: chartId }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setResult(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Options Flow Forecast</h1>
      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Upload flow (CSV/screenshot) + optional chart, then run analysis.
      </p>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <label>
          Symbol
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inputStyle} />
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Flow CSV or screenshot</label>
        <input type="file" onChange={(e) => setFlowFile(e.target.files?.[0] || null)} />
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Chart screenshot (optional)</label>
        <input type="file" onChange={(e) => setChartFile(e.target.files?.[0] || null)} />
      </div>

      <button onClick={analyze} disabled={loading} style={buttonStyle}>
        {loading ? "Analyzing..." : "Analyze"}
      </button>

      <pre style={{ whiteSpace: "pre-wrap", background: "#111827", padding: 16, borderRadius: 8, marginTop: 24 }}>
        {result}
      </pre>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#e2e8f0",
};

const buttonStyle: React.CSSProperties = {
  marginTop: 20,
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "#22c55e",
  color: "#0b1220",
  fontWeight: 600,
};
