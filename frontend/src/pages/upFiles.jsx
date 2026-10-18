import {useState} from "react";
import {useNavigate, useSearchParams} from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL;

const DATA_CENTERS = ["Discord", "Telegram"];

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
    const [file, setFile] = useState(null);
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

    const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    const pollJobStatus = async (jobId) => {
        let consecutiveErrors = 0;

        while (true) {
            try {
                const statusRes = await fetch(`${API_URL}/public/upload/${jobId}/status`, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    }, cache: "no-store",
                });

                if (!statusRes.ok) {
                    if (statusRes.status === 404) {
                        // The content request may not have reached the server yet.
                        await sleep(500);
                        continue;
                    }

                    throw new Error(`Status check failed: ${statusRes.status}`);
                }

                const data = await statusRes.json();
                consecutiveErrors = 0;

                if (data.status === "error") {
                    throw new Error(data.error || data.message || "Upload failed");
                }

                if (data.message !== undefined) {
                    setMessage(data.message);
                }

                if (Number.isFinite(data.transfer) && Number.isFinite(data.total)) {
                    setTransfer(data.transfer);
                    setTotal(data.total);

                    // Do not let a stale server-side status response move progress
                    // backwards while the browser is sending the file.
                    if (data.total > 0) {
                        setProgress((current) => Math.max(current, Math.min(99, (data.transfer / data.total) * 100)));
                    }
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
            await sleep(500);
        }
    };

    const uploadFileWithProgress = (jobId, selectedFile) => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.open("PUT", `${API_URL}/public/upload/${jobId}/content`);
        xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("token")}`);
        xhr.setRequestHeader("Content-Type", selectedFile.type || "application/octet-stream");

        xhr.upload.onloadstart = () => {
            setMessage("Sending file to server");
        };

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable || event.total <= 0) {
                setMessage("Sending file to server");
                return;
            }

            const percentage = (event.loaded / event.total) * 100;

            setMessage(event.loaded >= event.total ? "File sent; processing upload" : "Sending file to server");
            setTransfer(event.loaded);
            setTotal(event.total);
            setProgress(0);
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
                return;
            }

            let errorMessage = `File transfer failed (${xhr.status})`;

            try {
                const response = JSON.parse(xhr.responseText);
                errorMessage = response.detail || response.error || errorMessage;
            } catch {
                // Keep the HTTP status message if the response is not JSON.
            }

            reject(new Error(errorMessage));
        };

        xhr.onerror = () => {
            reject(new Error("Network error while sending the file."));
        };

        xhr.onabort = () => {
            reject(new Error("File upload was cancelled."));
        };

        xhr.send(selectedFile);
    });

    const handleUpload = async () => {
        if (!dataCenter) return;
        if (uploadMode === "file" && !file) return;
        if (uploadMode === "link" && !link.trim()) return;

        setStatus("uploading");
        setProgress(0);
        setMessage(uploadMode === "file" ? "Creating upload job" : "Starting import");
        setTransfer(0);
        setTotal(uploadMode === "file" && file ? file.size : 0);

        try {
            const token = localStorage.getItem("token");
            let res;

            if (uploadMode === "file") {
                res = await fetch(`${API_URL}/auth/upload`, {
                    method: "POST", headers: {
                        Authorization: `Bearer ${token}`, "X-File-Name": file.name, "X-Data-Center": dataCenter, "X-Directory": directory,
                    },
                });
            } else {
                const params = new URLSearchParams({
                    link: link.trim(), data_center: dataCenter, directory,
                });

                res = await fetch(`${API_URL}/auth/upload-link?${params.toString()}`, {
                    method: "POST", headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
            }

            if (!res.ok) {
                let errorMessage = `Upload setup failed (${res.status})`;

                try {
                    const errorData = await res.json();
                    errorMessage = errorData.detail || errorData.error || errorMessage;
                } catch {
                    // Ignore non-JSON error responses.
                }

                throw new Error(errorMessage);
            }

            const responseData = await res.json();
            const jobId = responseData.job_id;

            if (!jobId) {
                throw new Error("The server did not return an upload job ID.");
            }

            if (uploadMode === "file") {
                setMessage("Sending file to server");

                // Start both tasks together. Status polling is sequential, while
                // XMLHttpRequest reports actual browser-to-server upload progress.
                await Promise.all([uploadFileWithProgress(jobId, file), pollJobStatus(jobId),]);
            } else {
                await pollJobStatus(jobId);
            }

            setProgress(100);
            setMessage("Upload complete");
            setStatus("done");

            setTimeout(() => {
                if (directory !== "/home") {
                    navigate(`/dashboard?directory=${encodeURIComponent(directory)}`);
                } else {
                    navigate("/dashboard");
                }
            }, 1200);
        } catch (error) {
            console.error("Upload error:", error);
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

        const droppedFile = event.dataTransfer.files?.[0];

        if (droppedFile) {
            setFile(droppedFile);
        }
    };

    // ==========================================
    // CHECK IF UPLOAD BUTTON SHOULD BE DISABLED
    // ==========================================
    const isUploadDisabled = !dataCenter || status === "uploading" || (uploadMode === "file" && !file) || (uploadMode === "link" && !link.trim());

    return (<div className="min-h-screen bg-background text-on-surface flex flex-col">

        {/* ==========================================
            TOP BAR
        ========================================== */}
        <header className="h-16 border-b border-outline-variant/10 bg-surface/70 backdrop-blur-md flex items-center px-6 gap-4">
            <button
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors text-sm"
            >
                <span className="material-symbols-outlined text-[20px]">
                    arrow_back
                </span>
                Back to Dashboard
            </button>
            <div className="flex items-center gap-2 ml-4">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                    <span
                        className="material-symbols-outlined text-on-primary text-[16px]"
                        style={{
                            fontVariationSettings: "'FILL' 1",
                        }}
                    >
                        cloud
                    </span>
                </div>
                <span className="font-bold text-primary">
                    DriveBot
                </span>
            </div>
        </header>

        {/* ==========================================
            MAIN CONTENT
        ========================================== */}
        <div className="flex-1 flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-lg">
                <h1 className="text-2xl font-semibold text-on-surface mb-1">
                    Upload File
                </h1>
                <p className="text-sm text-on-surface-variant mb-8">
                    Select a data center and choose how you want to upload your file.
                </p>

                {/* ==========================================
                    SELECT DATA CENTER
                ========================================== */}
                <div className="mb-6">
                    <p className="text-xs font-geist uppercase tracking-widest text-on-surface-variant mb-3">
                        Select Data Center
                    </p>
                    <div className="flex gap-3">
                        {DATA_CENTERS.map((dc) => (<button
                            key={dc}
                            type="button"
                            onClick={() => setDataCenter(dc)}
                            disabled={status === "uploading"}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-medium transition-all ${dataCenter === dc ? "bg-primary/10 border-primary text-primary shadow-[0_0_12px_rgba(192,193,255,0.15)]" : "border-outline-variant/30 text-on-surface-variant hover:border-primary/50 hover:text-on-surface"}`}
                        >
                                <span className="material-symbols-outlined text-[18px]">
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
                    <p className="text-xs font-geist uppercase tracking-widest text-on-surface-variant mb-3">
                        Upload Method
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
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${uploadMode === "file" ? "bg-primary/10 border-primary text-primary" : "border-outline-variant/30 text-on-surface-variant hover:border-primary/50 hover:text-on-surface"}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">
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
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${uploadMode === "link" ? "bg-primary/10 border-primary text-primary" : "border-outline-variant/30 text-on-surface-variant hover:border-primary/50 hover:text-on-surface"}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">
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
                    <p className="text-xs font-geist uppercase tracking-widest text-on-surface-variant mb-3">
                        Select File
                    </p>
                    <label
                        htmlFor="file-input"
                        onDragOver={(event) => {
                            event.preventDefault();

                            if (status !== "uploading") {
                                setDragOver(true);
                            }
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        className={`flex flex-col items-center justify-center w-full h-40 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${dragOver ? "border-primary bg-primary/10" : file ? "border-primary/40 bg-primary/5" : "border-outline-variant/30 bg-surface-container-low hover:border-primary/40 hover:bg-surface-container"} ${status === "uploading" ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                            <span
                                className={`material-symbols-outlined text-[40px] mb-2 ${file ? "text-primary" : "text-on-surface-variant/40"}`}
                            >
                                {file ? "check_circle" : "cloud_upload"}
                            </span>
                        {file ? (<div className="text-center">
                            <p className="text-sm font-medium text-primary">
                                {file.name}
                            </p>
                            <p className="text-xs text-on-surface-variant mt-1">
                                {(file.size / 1024).toFixed(1)} KB
                            </p>
                        </div>) : (<div className="text-center">
                            <p className="text-sm text-on-surface-variant">
                                Drop file here or{" "}
                                <span className="text-primary">
                                    browse
                                </span>
                            </p>
                            <p className="text-xs text-on-surface-variant/50 mt-1">
                                Any file type supported
                            </p>
                        </div>)}
                        <input
                            id="file-input"
                            type="file"
                            className="hidden"
                            disabled={status === "uploading"}
                            onChange={(event) => {
                                const selectedFile = event.target.files?.[0];
                                if (selectedFile) {
                                    setFile(selectedFile);
                                }
                            }}
                        />
                    </label>
                </div>)}

                {/* ==========================================
                    LINK INPUT
                ========================================== */}
                {uploadMode === "link" && (<div className="mb-6">
                    <p className="text-xs font-geist uppercase tracking-widest text-on-surface-variant mb-3">
                        File Link
                    </p>
                    <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-4">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary">
                                    link
                                </span>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-on-surface">
                                    Import from Link
                                </p>
                                <p className="text-xs text-on-surface-variant">
                                    Paste a link to the file.
                                </p>
                            </div>
                        </div>

                        {/* LINK INPUT */}
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                                link
                            </span>
                            <input
                                type="url"
                                value={link}
                                disabled={status === "uploading"}
                                onChange={(event) => setLink(event.target.value)}
                                placeholder="https://..."
                                className="w-full bg-surface-container border border-outline-variant/30 rounded-xl pl-11 pr-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary transition-colors"
                            />
                        </div>

                        {/* LINK DETECTED */}
                        {link.trim() && (<div className="flex items-center gap-2 mt-3 text-primary">
                            <span className="material-symbols-outlined text-[16px]">
                                check_circle
                            </span>
                            <p className="text-xs">
                                Link added
                            </p>
                        </div>)}
                        <p className="text-xs text-on-surface-variant/60 mt-3 leading-relaxed">
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
                    className="w-full bg-primary text-on-primary py-3 rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors shadow-[0_0_20px_rgba(192,193,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {status === "uploading" ? (<>
                        <span className="material-symbols-outlined text-[18px] animate-spin">
                            autorenew
                        </span>
                        {uploadMode === "link" ? "Importing..." : "Uploading..."}
                    </>) : (<>
                        <span className="material-symbols-outlined text-[18px]">
                            cloud_upload
                        </span>
                        {uploadMode === "link" ? "Import File" : "Upload File"}
                    </>)}
                </button>

                {/* ==========================================
                    PROGRESS PANEL
                ========================================== */}
                {status !== "idle" && (<div className="mt-6 glass-panel rounded-2xl p-4 border border-outline-variant/10">
                    <div className="flex justify-between text-xs text-on-surface-variant mb-2">
                        <span className="font-geist uppercase tracking-widest">
                            {status === "uploading" && `${message || (uploadMode === "link" ? "Importing" : "Uploading")}:`}
                            {status === "done" && "✓ Completed:"}
                            {status === "error" && "✗ Failed:"}
                        </span>
                        <span>
                            {total > 0 ? `${formatBytes(transfer)} / ${formatBytes(total)}    ${progress.toFixed(1)}%` : `${progress.toFixed(1)}%`}
                        </span>
                    </div>

                    {/* PROGRESS BAR */}
                    <div className="w-full bg-surface-container-high h-1 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${status === "error" ? "bg-error" : "bg-primary"}`}
                            style={{
                                width: `${progress}%`,
                            }}
                        />
                    </div>

                    {/* SUCCESS */}
                    {status === "done" && (<p className="text-xs text-primary mt-2 text-center">
                        Upload completed. Redirecting to dashboard...
                    </p>)}

                    {/* ERROR */}
                    {status === "error" && (<p className="text-xs text-error mt-2 text-center">
                        Upload failed. Please try again.
                    </p>)}
                </div>)}
            </div>
        </div>
    </div>);
}