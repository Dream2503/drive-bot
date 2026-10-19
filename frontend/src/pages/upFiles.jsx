import {useRef, useState} from "react";
import {useNavigate, useSearchParams} from "react-router-dom";

const API_URL = window.STORELIMITLESS_CONFIG?.API_URL ?? import.meta.env.VITE_API_URL

const DATA_CENTERS = ["Discord", "Telegram"];

// Each chunk is its own PUT; the server writes it to disk as it arrives.
const CHUNK_SIZE = 1024 * 1024;
// How many chunks are in flight at once (browsers allow ~6 connections per host).
const PARALLEL_CHUNKS = 8;
const MAX_CHUNK_ATTEMPTS = 3;

// Supabase-style classes
const labelClass = "block text-sm text-[#b4b4b4] mb-2";
const optionBase = "flex items-center justify-center gap-2 h-[38px] rounded-md border px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const optionOff = "border-[#363636] bg-white/[0.026] text-[#898989] hover:border-[#4d4d4d] hover:text-[#fafafa]";
const optionOn = "border-[#3ecf8e]/50 bg-[#3ecf8e]/10 text-[#fafafa]";

const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;

    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = -1;

    do {
        value /= 1024;
        unit++;
    } while (value >= 1024 && unit < units.length - 1);

    return `${value.toFixed(1)} ${units[unit]}`;
};

export default function UploadPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Current directory from dashboard
    const directory = searchParams.get("directory") || "/home";

    // Upload states
    const [files, setFiles] = useState([]);
    const [link, setLink] = useState("");
    const [uploadMode, setUploadMode] = useState("file");

    // Other states
    const [dataCenter, setDataCenter] = useState("Discord");
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState("");
    const [transfer, setTransfer] = useState(0);
    const [total, setTotal] = useState(0);
    const [status, setStatus] = useState("idle");
    const [dragOver, setDragOver] = useState(false);

    // Every in-flight request, so a failure can abort all of them.
    const activeXhrs = useRef(new Set());

    const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    // ==========================================
    // Poll the server for cloud upload progress.
    // `transfer` = bytes uploaded to the cloud so far
    // `total`    = bytes written to the server's disk so far (it keeps growing)
    // The percentage is allowed to go DOWN when the disk gets ahead of the cloud.
    // ==========================================
    const pollJobStatus = async (jobId, cancelToken) => {
        let consecutiveErrors = 0;

        while (!cancelToken.cancelled) {
            try {
                const statusRes = await fetch(`${API_URL}/public/upload/${jobId}/status`, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    }, cache: "no-store",
                });

                if (cancelToken.cancelled) return;

                if (!statusRes.ok) {
                    if (statusRes.status === 404) {
                        // The first chunk may not have reached the server yet.
                        await sleep(500);
                        continue;
                    }

                    throw new Error(`Status check failed: ${statusRes.status}`);
                }

                const data = await statusRes.json();
                consecutiveErrors = 0;

                if (data.status === "error" || data.message?.toLowerCase().startsWith("upload failed")) {
                    throw new Error(data.error || data.message || "Upload failed");
                }

                if (data.message !== undefined) {
                    setMessage(data.message);
                }

                if (Number.isFinite(data.transfer) && Number.isFinite(data.total)) {
                    setTransfer(data.transfer);
                    setTotal(data.total);

                    // No Math.max here: the value is allowed to decrease when `total`
                    // grows faster than `transfer`. It stays below 100 until the server
                    // reports completion, so catching up with the disk is not shown as done.
                    setProgress(data.total > 0 ? Math.min(99, (data.transfer / data.total) * 100) : 0);
                }

                if (data.status === "completed" || data.message?.toLowerCase().startsWith("upload complete")) {
                    setProgress(100);
                    return;
                }
            } catch (error) {
                if (error instanceof TypeError) {
                    // Transient network errors should not immediately kill polling.
                    consecutiveErrors += 1;

                    if (consecutiveErrors >= 10) {
                        throw new Error("Unable to reach the upload status endpoint.");
                    }
                } else {
                    throw error;
                }
            }

            // Sequential polling: the next request starts only after the previous
            // request has completed, preventing overlapping status requests.
            await sleep(100);
        }
    };

    // ==========================================
    // Send ONE chunk (several of these run in parallel)
    // ==========================================
    const sendChunk = (jobId, blob, offset, totalSize) => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        activeXhrs.current.add(xhr);

        const done = () => activeXhrs.current.delete(xhr);

        xhr.open("PUT", `${API_URL}/public/upload/${jobId}/chunk?offset=${offset}&total=${totalSize}`);
        xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("token")}`);
        xhr.setRequestHeader("Content-Type", "application/octet-stream");

        xhr.onload = () => {
            done();

            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
                return;
            }

            let errorMessage = `Chunk upload failed (${xhr.status})`;

            try {
                const response = JSON.parse(xhr.responseText);
                errorMessage = response.detail || response.error || errorMessage;
            } catch {
                // Keep the HTTP status message if the response is not JSON.
            }

            const error = new Error(errorMessage);
            // 4xx errors will not be fixed by retrying.
            error.fatal = xhr.status >= 400 && xhr.status < 500;
            reject(error);
        };

        xhr.onerror = () => {
            done();
            reject(new Error("Network error while sending the file."));
        };

        xhr.onabort = () => {
            done();
            const error = new Error("File upload was cancelled.");
            error.fatal = true;
            reject(error);
        };

        xhr.send(blob);
    });

    const uploadFileInChunks = async (jobId, selectedFile, cancelToken) => {
        const totalSize = selectedFile.size;
        // An empty file still sends one (empty) chunk so the server can finish.
        const chunkCount = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
        let nextIndex = 0;

        // Each lane keeps taking the next unsent chunk, so chunks start in order.
        const lane = async () => {
            while (!cancelToken.cancelled) {
                const index = nextIndex++;

                if (index >= chunkCount) return;

                const start = index * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, totalSize);
                const blob = selectedFile.slice(start, end);

                for (let attempt = 1; ; attempt++) {
                    if (cancelToken.cancelled) {
                        throw new Error("File upload was cancelled.");
                    }

                    try {
                        await sendChunk(jobId, blob, start, totalSize);
                        break;
                    } catch (error) {
                        if (error.fatal || cancelToken.cancelled || attempt >= MAX_CHUNK_ATTEMPTS) {
                            throw error;
                        }

                        setMessage(`Retrying chunk (attempt ${attempt + 1} of ${MAX_CHUNK_ATTEMPTS})`);
                        await sleep(1000 * attempt);
                    }
                }
            }
        };

        await Promise.all(Array.from({length: Math.min(PARALLEL_CHUNKS, chunkCount)}, lane));
    };

    const handleUpload = async () => {
        if (!dataCenter) return;
        if (uploadMode === "file" && files.length === 0) return;
        if (uploadMode === "link" && !link.trim()) return;

        setStatus("uploading");
        setProgress(0);
        setMessage(uploadMode === "file" ? `Preparing ${files.length} file(s)` : "Starting import");
        setTransfer(0);
        setTotal(uploadMode === "file" ? files.reduce((sum, selectedFile) => sum + selectedFile.size, 0) : 0);

        const jobsKey = "storelimitless_upload_jobs";
        const token = localStorage.getItem("token");

        try {
            const createJob = async (selectedFile) => {
                let res;
                if (uploadMode === "file") {
                    res = await fetch(`${API_URL}/auth/upload`, {
                        method: "POST", headers: {
                            Authorization: `Bearer ${token}`, "X-File-Name": selectedFile.name, "X-Data-Center": dataCenter, "X-Directory": directory,
                        },
                    });
                } else {
                    const params = new URLSearchParams({link: link.trim(), data_center: dataCenter, directory});
                    res = await fetch(`${API_URL}/auth/upload-link?${params.toString()}`, {
                        method: "POST", headers: {Authorization: `Bearer ${token}`},
                    });
                }

                if (!res.ok) {
                    let errorMessage = `Upload setup failed (${res.status})`;
                    try {
                        const errorData = await res.json();
                        errorMessage = errorData.detail || errorData.error || errorMessage;
                    } catch {
                        // Keep the HTTP status message when the response is not JSON.
                    }
                    throw new Error(`${selectedFile?.name ? `${selectedFile.name}: ` : ""}${errorMessage}`);
                }

                const {job_id: jobId} = await res.json();
                if (!jobId) throw new Error("The server did not return an upload job ID.");

                const job = {
                    jobId,
                    name: uploadMode === "file" ? selectedFile.name : link.trim(),
                    kind: uploadMode,
                    directory,
                    dataCenter,
                    status: "uploading",
                    progress: 0,
                    transfer: 0,
                    total: uploadMode === "file" ? selectedFile.size : 0,
                    message: uploadMode === "file" ? "Sending file to server" : "Importing from link",
                    createdAt: Date.now(),
                };
                const existingJobs = JSON.parse(localStorage.getItem(jobsKey) || "[]");
                localStorage.setItem(jobsKey, JSON.stringify([job, ...existingJobs.filter(item => item.jobId !== jobId)]));

                if (!window.__storeLimitlessUploadTransfers) window.__storeLimitlessUploadTransfers = new Map();
                const cancelToken = {cancelled: false};
                window.__storeLimitlessUploadTransfers.set(jobId, {cancelToken, xhrs: activeXhrs.current});

                if (uploadMode === "file") {
                    void uploadFileInChunks(jobId, selectedFile, cancelToken).then(() => {
                        window.__storeLimitlessUploadTransfers?.delete(jobId);
                    }).catch((error) => {
                        cancelToken.cancelled = true;
                        window.__storeLimitlessUploadTransfers?.delete(jobId);
                        for (const xhr of activeXhrs.current) xhr.abort();
                        const jobs = JSON.parse(localStorage.getItem(jobsKey) || "[]");
                        localStorage.setItem(jobsKey, JSON.stringify(jobs.map(item => item.jobId === jobId ? {
                            ...item,
                            status: "error",
                            message: error instanceof Error ? error.message : "Upload failed"
                        } : item)));
                        console.error(`Upload transfer failed (${selectedFile.name}):`, error);
                    });
                }
            };

            if (uploadMode === "file") {
                // Create a separate backend job for every selected file. Transfers
                // start independently and continue after this page navigates away.
                for (const selectedFile of files) {
                    await createJob(selectedFile);
                }
            } else {
                await createJob(null);
            }

            navigate(directory && directory !== "/home" ? `/dashboard?directory=${encodeURIComponent(directory)}` : "/dashboard");
        } catch (error) {
            console.error("Upload setup error:", error);
            setMessage(error instanceof Error ? error.message : "Upload failed");
            setStatus("error");
        }
    };

    // ==========================================
    // HANDLE DRAG AND DROP
    // ==========================================
    const handleDrop = (event) => {
        event.preventDefault();

        setDragOver(false);

        if (status === "uploading" || uploadMode !== "file") return;

        const droppedFiles = Array.from(event.dataTransfer.files || []);
        if (droppedFiles.length) setFiles((current) => [...current, ...droppedFiles]);
    };

    // ==========================================
    // CHECK IF UPLOAD BUTTON SHOULD BE DISABLED
    // ==========================================
    const isUploadDisabled = !dataCenter || status === "uploading" || (uploadMode === "file" && files.length === 0) || (uploadMode === "link" && !link.trim());

    return (<div
        className="min-h-screen bg-[#171717] text-[#fafafa] flex flex-col"
        style={{fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"}}
    >

        {/* ==========================================
            TOP BAR
        ========================================== */}
        <header className="h-14 border-b border-[#2e2e2e] bg-[#171717] flex items-center px-6 gap-4">
            <button
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-1.5 text-[#898989] hover:text-[#fafafa] transition-colors text-sm"
            >
                <span className="material-symbols-outlined text-[18px]">
                    arrow_back
                </span>
                Back to Dashboard
            </button>
            <div className="flex items-center gap-2.5 ml-4">
                <div className="w-7 h-7 rounded-md bg-[#3ecf8e] flex items-center justify-center">
                    <span
                        className="material-symbols-outlined text-[#0f0f0f] text-[18px]"
                        style={{
                            fontVariationSettings: "'FILL' 1",
                        }}
                    >
                        cloud
                    </span>
                </div>
                <span className="text-sm font-medium tracking-tight">
                    DriveBot
                </span>
            </div>
        </header>

        {/* ==========================================
            MAIN CONTENT
        ========================================== */}
        <div className="flex-1 flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-[480px]">
                <h1 className="text-2xl font-medium tracking-tight text-[#fafafa] mb-2">
                    Upload File
                </h1>
                <p className="text-sm text-[#898989] mb-8">
                    Select a data center and choose how you want to upload your file.
                </p>

                {/* ==========================================
                    SELECT DATA CENTER
                ========================================== */}
                <div className="mb-6">
                    <p className={labelClass}>
                        Data center
                    </p>
                    <div className="flex gap-3">
                        {DATA_CENTERS.map((dc) => (<button
                            key={dc}
                            type="button"
                            onClick={() => setDataCenter(dc)}
                            disabled={status === "uploading"}
                            className={`${optionBase} ${dataCenter === dc ? optionOn : optionOff}`}
                        >
                                <span className={`material-symbols-outlined text-[18px] ${dataCenter === dc ? "text-[#3ecf8e]" : ""}`}>
                                    {dc === "Discord" ? "forum" : "send"}
                                </span>
                            {dc}
                        </button>))}
                    </div>
                </div>

                {/* ==========================================
                    SELECT UPLOAD METHOD
                ========================================== */}
                <div className="mb-6">
                    <p className={labelClass}>
                        Upload method
                    </p>
                    <div className="flex gap-3">

                        {/* LOCAL FILE */}
                        <button
                            type="button"
                            disabled={status === "uploading"}
                            onClick={() => {
                                setUploadMode("file");
                                setProgress(0);
                                setStatus("idle");
                            }}
                            className={`${optionBase} flex-1 ${uploadMode === "file" ? optionOn : optionOff}`}
                        >
                            <span className={`material-symbols-outlined text-[18px] ${uploadMode === "file" ? "text-[#3ecf8e]" : ""}`}>
                                upload_file
                            </span>
                            Upload File
                        </button>

                        {/* LINK */}
                        <button
                            type="button"
                            disabled={status === "uploading"}
                            onClick={() => {
                                setUploadMode("link");
                                setProgress(0);
                                setStatus("idle");
                            }}
                            className={`${optionBase} flex-1 ${uploadMode === "link" ? optionOn : optionOff}`}
                        >
                            <span className={`material-symbols-outlined text-[18px] ${uploadMode === "link" ? "text-[#3ecf8e]" : ""}`}>
                                add_link
                            </span>
                            Link
                        </button>
                    </div>
                </div>

                {/* ==========================================
                    LOCAL FILE UPLOAD
                ========================================== */}
                {uploadMode === "file" && (<div className="mb-6">
                    <p className={labelClass}>Files</p>
                    <label
                        htmlFor="file-input"
                        onDragOver={(event) => {
                            event.preventDefault();
                            if (status !== "uploading") setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        className={`flex flex-col items-center justify-center w-full min-h-40 rounded-lg border border-dashed cursor-pointer transition-colors ${dragOver ? "border-[#3ecf8e] bg-[#3ecf8e]/5" : files.length ? "border-[#3ecf8e]/40 bg-[#1f1f1f]" : "border-[#363636] bg-[#1f1f1f] hover:border-[#4d4d4d] hover:bg-[#232323]"} ${status === "uploading" ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                        <span className={`material-symbols-outlined text-[36px] mb-2 ${files.length ? "text-[#3ecf8e]" : "text-[#4d4d4d]"}`}>
                            {files.length ? "library_add_check" : "cloud_upload"}
                        </span>
                        <div className="text-center px-4 py-2">
                            <p className="text-sm text-[#898989]">
                                Drop files here or <span className="text-[#fafafa] underline underline-offset-4 decoration-[#4d4d4d]">browse</span>
                            </p>
                            <p className="text-xs text-[#707070] mt-1">Select multiple files at once, or add more by dropping them here.</p>
                        </div>
                        <input
                            id="file-input"
                            type="file"
                            multiple
                            className="hidden"
                            disabled={status === "uploading"}
                            onChange={(event) => {
                                const selectedFiles = Array.from(event.target.files || []);
                                if (selectedFiles.length) setFiles((current) => [...current, ...selectedFiles]);
                                event.target.value = "";
                            }}
                        />
                    </label>
                    {files.length > 0 && (<div className="mt-3 rounded-lg border border-[#2e2e2e] bg-[#1f1f1f] divide-y divide-[#2e2e2e]">
                        <div className="flex items-center justify-between px-3 py-2 text-xs text-[#898989]">
                            <span>{files.length} file{files.length === 1 ? "" : "s"} selected</span>
                            <button type="button" disabled={status === "uploading"} onClick={() => setFiles([])}
                                    className="text-[#898989] hover:text-[#ff6369] disabled:opacity-50">Clear all
                            </button>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                            {files.map((selectedFile, index) => (
                                <div key={`${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}-${index}`}
                                     className="flex items-center gap-3 px-3 py-2.5">
                                    <span className="material-symbols-outlined text-[18px] text-[#898989]">draft</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm text-[#fafafa]" title={selectedFile.name}>{selectedFile.name}</p>
                                        <p className="text-xs text-[#898989]">{formatBytes(selectedFile.size)}</p>
                                    </div>
                                    <button type="button" disabled={status === "uploading"}
                                            onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                                            aria-label={`Remove ${selectedFile.name}`} title="Remove file"
                                            className="rounded p-1 text-[#898989] hover:bg-white/5 hover:text-[#ff6369] disabled:opacity-50">
                                        <span className="material-symbols-outlined text-[18px]">close</span>
                                    </button>
                                </div>))}
                        </div>
                    </div>)}
                </div>)}

                {/* ==========================================
                    LINK INPUT
                ========================================== */}
                {uploadMode === "link" && (<div className="mb-6">
                    <p className={labelClass}>
                        File link
                    </p>
                    <div className="bg-[#1f1f1f] border border-[#2e2e2e] rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-9 h-9 rounded-md border border-[#363636] bg-[#242424] flex items-center justify-center">
                                <span className="material-symbols-outlined text-[18px] text-[#898989]">
                                    link
                                </span>
                            </div>
                            <div>
                                <p className="text-sm text-[#fafafa]">
                                    Import from Link
                                </p>
                                <p className="text-xs text-[#898989]">
                                    Paste a link to the file.
                                </p>
                            </div>
                        </div>

                        {/* LINK INPUT */}
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#707070]">
                                link
                            </span>
                            <input
                                type="url"
                                value={link}
                                disabled={status === "uploading"}
                                onChange={(event) => setLink(event.target.value)}
                                placeholder="https://..."
                                className="w-full h-[38px] rounded-md border border-[#363636] bg-white/[0.026] pl-10 pr-3 text-sm text-[#fafafa] placeholder:text-[#707070] outline-none transition-colors focus:border-[#707070] focus:ring-2 focus:ring-[#4d4d4d]/50 disabled:opacity-60"
                            />
                        </div>

                        {/* LINK DETECTED */}
                        {link.trim() && (<div className="flex items-center gap-1.5 mt-3 text-[#3ecf8e]">
                            <span className="material-symbols-outlined text-[16px]">
                                check_circle
                            </span>
                            <p className="text-xs">
                                Link added
                            </p>
                        </div>)}
                        <p className="text-xs text-[#707070] mt-3 leading-relaxed">
                            Make sure the link is publicly accessible.
                        </p>
                    </div>
                </div>)}

                {/* ==========================================
                    UPLOAD BUTTON
                ========================================== */}
                <button
                    onClick={handleUpload}
                    disabled={isUploadDisabled}
                    className="w-full h-[38px] flex items-center justify-center gap-2 rounded-md border border-[#3ecf8e]/40 bg-[#006239] text-sm text-[#fafafa] transition-colors hover:border-[#3ecf8e]/70 hover:bg-[#007a46] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {status === "uploading" ? (<>
                        <span className="material-symbols-outlined text-[16px] animate-spin">
                            autorenew
                        </span>
                        {uploadMode === "link" ? "Importing..." : "Uploading..."}
                    </>) : (<>
                        <span className="material-symbols-outlined text-[16px]">
                            cloud_upload
                        </span>
                        {uploadMode === "link" ? "Import File" : `Upload ${files.length} File${files.length === 1 ? "" : "s"}`}
                    </>)}
                </button>

                {/* ==========================================
                    PROGRESS PANEL
                ========================================== */}
                {status !== "idle" && (<div className="mt-6 rounded-lg border border-[#2e2e2e] bg-[#1f1f1f] p-4">
                    <div className="flex justify-between gap-4 text-xs text-[#898989] mb-3">
                        <span className={status === "error" ? "text-[#ff6369]" : status === "done" ? "text-[#3ecf8e]" : ""}>
                            {status === "uploading" && `${message || (uploadMode === "link" ? "Importing" : "Uploading")}`}
                            {status === "done" && "✓ Completed"}
                            {status === "error" && `✗ Failed${message ? `: ${message}` : ""}`}
                        </span>
                        <span className="shrink-0 font-mono">
                            {total > 0 ? `${formatBytes(transfer)} / ${formatBytes(total)}   ${progress.toFixed(1)}%` : `${progress.toFixed(1)}%`}
                        </span>
                    </div>

                    {/* PROGRESS BAR */}
                    <div className="w-full bg-[#2e2e2e] h-1 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${status === "error" ? "bg-[#e5484d]" : "bg-[#3ecf8e]"}`}
                            style={{
                                width: `${progress}%`,
                            }}
                        />
                    </div>

                    {/* SUCCESS */}
                    {status === "done" && (<p className="text-xs text-[#3ecf8e] mt-3 text-center">
                        Upload completed. Redirecting to dashboard...
                    </p>)}

                    {/* ERROR */}
                    {status === "error" && (<p className="text-xs text-[#ff6369] mt-3 text-center">
                        Upload failed. Please try again.
                    </p>)}
                </div>)}
            </div>
        </div>
    </div>);
}
