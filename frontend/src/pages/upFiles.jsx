import { useState } from "react";
import { useNavigate } from "react-router-dom";

const DCS = [
  { id: "Discord",  label: "Discord",  desc: "Stores files via Discord CDN" },
  { id: "Telegram", label: "Telegram", desc: "Stores files via Telegram API" },
];

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile]           = useState(null);
  const [dc, setDc]               = useState("");
  const [progress, setProgress]   = useState(0);
  const [status, setStatus]       = useState("idle"); // idle | uploading | done | error
  const [drag, setDrag]           = useState(false);

  const handleUpload = async () => {
    if (!file || !dc) return;
    setStatus("uploading");
    setProgress(0);

    const form = new FormData();
    form.append("file", file);
    form.append("data_center", dc);

    try {
      const res = await fetch("http://127.0.0.1:8000/auth/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: form,
      });
      if (!res.ok || !res.body) { setStatus("error"); return; }

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split("\n")) {
          if (!line.trim()) continue;
          try { setProgress((p) => Math.max(p, JSON.parse(line).progress)); }
          catch {}
        }
      }
      setProgress(100);
      setStatus("done");
      setTimeout(() => navigate("/dashboard"), 1200);
    } catch {
      setStatus("error");
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const ready  = file && dc && status !== "uploading";
  const isIdle = status === "idle";

  return (
    <div className="min-h-screen bg-sb-base text-sb-text text-14 flex flex-col">
      {/* Top bar */}
      <header className="h-14 border-b border-sb-border bg-sb-canvas flex items-center px-6 gap-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 text-13 text-sb-text-3 hover:text-sb-text transition-colors focus-green rounded-sm"
        >
          <BackIcon size={13} />
          Back
        </button>
        <div className="h-4 w-px bg-sb-border" />
        <div className="flex items-center gap-2">
          <DriveIcon />
          <span className="text-13 font-medium">DriveBot</span>
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-lg">
          {/* Page title */}
          <h1 className="text-20 font-medium text-sb-text mb-0.5">Upload a file</h1>
          <p className="text-13 text-sb-text-3 mb-8">
            Select a storage backend and choose the file to upload.
          </p>

          {/* Step 1 — Data center */}
          <section className="mb-6">
            <p className="text-11 font-mono uppercase tracking-wider text-sb-text-3 mb-3">
              1. Storage backend
            </p>
            <div className="grid grid-cols-2 gap-3">
              {DCS.map(({ id, label, desc }) => (
                <button
                  key={id}
                  onClick={() => setDc(id)}
                  className={`text-left p-3 rounded-md border transition-colors focus-green
                    ${dc === id
                      ? "border-sb-green bg-sb-green-dim"
                      : "border-sb-border bg-sb-surface hover:border-sb-border-hi"
                    }`}
                >
                  <p className={`text-13 font-medium mb-0.5 ${dc === id ? "text-sb-green" : "text-sb-text"}`}>
                    {label}
                    {dc === id && (
                      <span className="ml-1.5 text-11">✓</span>
                    )}
                  </p>
                  <p className="text-12 text-sb-text-3">{desc}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Step 2 — File drop zone */}
          <section className="mb-6">
            <p className="text-11 font-mono uppercase tracking-wider text-sb-text-3 mb-3">
              2. Select file
            </p>
            <label
              htmlFor="file-input"
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center justify-center w-full h-36 rounded-md
                          border border-dashed cursor-pointer transition-colors
                          ${drag
                            ? "border-sb-green bg-sb-green-dim"
                            : file
                            ? "border-sb-green/40 bg-sb-green-dim/50"
                            : "border-sb-border bg-sb-surface hover:border-sb-border-hi"
                          }`}
            >
              {file ? (
                <div className="text-center px-4">
                  <p className="text-13 text-sb-text truncate max-w-xs">{file.name}</p>
                  <p className="text-12 text-sb-text-3 mt-1">
                    {(file.size / 1024).toFixed(1)} KB
                    <button
                      onClick={(e) => { e.preventDefault(); setFile(null); }}
                      className="ml-3 text-sb-text-3 hover:text-sb-red transition-colors focus-green rounded-sm"
                    >
                      Remove
                    </button>
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <UploadIcon />
                  <p className="text-13 text-sb-text-2 mt-2">
                    Drop file here or{" "}
                    <span className="text-sb-green">browse</span>
                  </p>
                  <p className="text-12 text-sb-text-3 mt-0.5">Any file type</p>
                </div>
              )}
              <input
                id="file-input"
                type="file"
                className="hidden"
                disabled={status === "uploading"}
                onChange={(e) => { if (e.target.files[0]) setFile(e.target.files[0]); }}
              />
            </label>
          </section>

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={!ready}
            className="w-full h-9 bg-sb-green text-[#0f0f0f] text-13 font-medium rounded-full
                       hover:bg-sb-green-dk transition-colors focus-green
                       disabled:opacity-40 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
          >
            {status === "uploading" ? "Uploading…" : "Upload file"}
          </button>

          {/* Progress */}
          {!isIdle && (
            <div className="mt-5 bg-sb-surface border border-sb-border rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-12 font-mono text-sb-text-3">
                  {status === "uploading" && "Uploading"}
                  {status === "done"      && "Complete"}
                  {status === "error"     && "Failed"}
                </span>
                <span className="text-12 font-mono text-sb-text-3">{progress}%</span>
              </div>
              <div className="h-0.5 bg-sb-elevated rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300
                    ${status === "error" ? "bg-sb-red" : "bg-sb-green"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              {status === "done" && (
                <p className="text-12 text-sb-green mt-2">
                  Upload complete. Redirecting…
                </p>
              )}
              {status === "error" && (
                <p className="text-12 text-sb-red mt-2">
                  Upload failed. Check your connection and try again.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Icons ── */
const Ico = ({ d, size, strokeWidth = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d={d} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const BackIcon    = ({ size }) => <Ico size={size} d="M10 3L5 8l5 5" />;
const UploadIcon  = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" className="text-sb-text-3">
    <path d="M8 10V3M5 6l3-3 3 3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
function DriveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect width="20" height="20" rx="4" fill="#3ecf8e" />
      <path d="M6 14l3-8 3 8" stroke="#0f0f0f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 11.5h4" stroke="#0f0f0f" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}