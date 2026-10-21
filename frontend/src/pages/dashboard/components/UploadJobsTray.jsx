import {useEffect, useRef, useState} from "react";
import {API_URL, iconBtn, iconBtnDanger} from "../constants.js";
import {formatFileSize, getToken} from "../utils.js";

/** Return only the leaf filename, never the torrent's enclosing directory. */
function getTorrentFileName(file) {
    const normalize = (value) => String(value ?? "").trim().replaceAll("\\", "/").replace(/\/+$/, "");
    const path = normalize(file?.path);
    const name = normalize(file?.name);
    const candidate = path.includes("/") ? path : (name || path);
    const leaf = candidate.split("/").filter(Boolean).at(-1);
    return leaf || "Unnamed file";
}

function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value ?? "").trim());
}

function isYouTubeUrl(value) {
    try {
        const hostname = new URL(String(value ?? "").trim()).hostname.toLowerCase().replace(/^www\./, "");
        return hostname === "youtu.be" || hostname === "youtube.com" || hostname.endsWith(".youtube.com");
    } catch {
        return false;
    }
}

function getDisplayFileName(value) {
    return String(value ?? "").trim().replaceAll("\\", "/").replace(/\/+$/, "").split("/").filter(Boolean).at(-1) || "";
}

function isUnresolvedYouTubeName(value, sourceIsYouTube) {
    if (isHttpUrl(value)) return true;
    const name = getDisplayFileName(value);
    if (!name || isHttpUrl(name)) return true;
    const lowered = name.toLowerCase();
    if (["link", "upload", "torrent", "watch", "shorts", "embed", "live", "video", "update_name_from_backend"].includes(lowered)) return true;
    return sourceIsYouTube && /^[a-z0-9_-]{11}$/i.test(name);
}

function formatLinkStage(message) {
    const stage = String(message ?? "").trim().toLowerCase();
    if (stage === "downloading video") return "Downloading video";
    if (stage === "downloading audio") return "Downloading audio";
    if (stage === "merging audio and video") return "Merging audio and video";
    if (stage === "uploading file" || stage === "uploading") return "Uploading";
    if (stage === "finalizing upload" || stage.startsWith("upload complete of id=")) return "Finalizing upload";
    return "";
}

/** Displays one persistent tray row per upload batch, not one row per individual file. */
export default function UploadJobsTray({uploadJobs, cancelUploadJob, dismissUploadJob, clearAllUploadJobs}) {
    const [selectionTask, setSelectionTask] = useState(null);
    const [selectedTorrentFiles, setSelectedTorrentFiles] = useState({});
    const [startingTorrent, setStartingTorrent] = useState(false);
    const [torrentError, setTorrentError] = useState("");
    const selectionDialogRef = useRef(null);
    const startTorrentButtonRef = useRef(null);

    useEffect(() => {
        if (!selectionTask) return;
        const firstFileRow = selectionDialogRef.current?.querySelector('[data-torrent-file-row="true"]');
        (firstFileRow || selectionDialogRef.current)?.focus();
    }, [selectionTask]);

    function toggleTorrentFile(torrentLink, fileIndex) {
        setSelectedTorrentFiles((current) => {
            const next = new Set(current[torrentLink] || []);
            const index = Number(fileIndex);
            if (next.has(index)) next.delete(index); else next.add(index);
            return {...current, [torrentLink]: [...next]};
        });
    }

    function handleTorrentSelectionKeyDown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!startingTorrent) {
                setSelectionTask(null);
                setTorrentError("");
            }
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (!startingTorrent) startTorrentButtonRef.current?.click();
            return;
        }

        const fileRows = Array.from(selectionDialogRef.current?.querySelectorAll('[data-torrent-file-row="true"]') || []);
        if (!fileRows.length) return;
        const currentIndex = fileRows.indexOf(document.activeElement);

        if (event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            fileRows[currentIndex < 0 ? 0 : Math.min(fileRows.length - 1, currentIndex + 1)]?.focus();
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            fileRows[currentIndex < 0 ? fileRows.length - 1 : Math.max(0, currentIndex - 1)]?.focus();
            return;
        }

        if ((event.key === " " || event.code === "Space") && currentIndex >= 0) {
            event.preventDefault();
            event.stopPropagation();
            fileRows[currentIndex].click();
        }
    }

    if (!uploadJobs.length && !selectionTask) return null;

    const activeCount = uploadJobs.filter((job) => job.status === "queued" || job.status === "uploading").length;

    return (<>
        <style>{`
            .upload-tray-scrollbar { scrollbar-width: thin; scrollbar-color: #3b6955 transparent; overscroll-behavior: contain; }
            .upload-tray-scrollbar::-webkit-scrollbar { width: 5px; }
            .upload-tray-scrollbar::-webkit-scrollbar-track { background: transparent; margin-block: 8px; }
            .upload-tray-scrollbar::-webkit-scrollbar-thumb { background: #355343; border: 1px solid transparent; border-radius: 999px; background-clip: padding-box; transition: background-color 180ms ease; }
            .upload-tray-scrollbar::-webkit-scrollbar-thumb:hover { background: #3ecf8e; background-clip: padding-box; }
            @media (prefers-reduced-motion: reduce) { .upload-tray-scrollbar::-webkit-scrollbar-thumb { transition: none; } }
        `}</style>

        <aside aria-label="Uploads"
               className="fixed bottom-4 right-4 z-[120] w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#303b34] bg-[#111713] shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between gap-3 border-b border-[#29362e] bg-[#151d18] px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-[#3ecf8e]" aria-hidden="true">cloud_upload</span>
                    <span className="text-sm font-medium text-[#e8f0eb]">Upload tasks</span>
                    <span className="rounded-full border border-[#2b4938] bg-[#1c2c22] px-2 py-0.5 text-[11px] text-[#9bbba7]">
                        {activeCount} active
                    </span>
                </div>
                <button type="button" onClick={() => clearAllUploadJobs?.()}
                        className="shrink-0 rounded-md px-2 py-1 text-[11px] text-[#9bbba7] transition-colors hover:bg-white/5 hover:text-[#f3f7f4]"
                        title="Cancel active tasks and clear all task history">
                    Clear all
                </button>
            </div>

            <div className="upload-tray-scrollbar max-h-80 space-y-1 overflow-y-auto p-2">
                {uploadJobs.slice().reverse().map((job) => {
                    const isComplete = job.status === "completed";
                    const isError = job.status === "error";
                    const isCancelled = job.status === "cancelled";
                    const isQueued = job.status === "queued";
                    const isActive = isQueued || job.status === "uploading";
                    const percent = isComplete ? 100 : Math.max(0, Math.min(99, Number(job.progress) || 0));
                    const itemCount = Number(job.totalItems) || job.items?.length || 0;
                    const singleItem = itemCount === 1 ? job.items?.[0] : null;
                    const singleItemRawName = String(singleItem?.name || "");
                    const currentNameRaw = String(job.currentName || "");
                    const sourceIsYouTube = isYouTubeUrl(singleItemRawName) || isYouTubeUrl(currentNameRaw);
                    const singleFileName = singleItem ? getTorrentFileName(singleItem) : "";
                    const currentFileName = currentNameRaw ? getDisplayFileName(currentNameRaw) : "";
                    const usableCurrentName = currentFileName && !isUnresolvedYouTubeName(currentNameRaw, sourceIsYouTube) && !isHttpUrl(currentNameRaw) ? currentFileName : "";
                    const usableItemName = singleFileName && !isUnresolvedYouTubeName(singleItemRawName, sourceIsYouTube) && !isHttpUrl(singleItemRawName) ? singleFileName : "";
                    const taskTitle = singleItem ? (usableCurrentName || usableItemName || (sourceIsYouTube ? "YouTube video" : singleFileName || job.name || "Upload task")) : job.name || "Upload task";
                    const finishedCount = Math.min(itemCount, Number(job.completedItems) || 0);
                    const statusColor = isError || isCancelled ? "text-[#ff7278]" : isComplete ? "text-[#3ecf8e]" : "text-[#8ca296]";
                    const linkStage = job.kind === "link" ? formatLinkStage(job.message) : "";
                    const stagePercent = Number(job.total) > 0 ? Math.max(0, Math.min(99, Number(job.transfer || 0) * 100 / Number(job.total))) : null;
                    const stageStatus = linkStage ? `${linkStage}${stagePercent !== null && ["Downloading video", "Downloading audio", "Uploading"].includes(linkStage) ? ` · ${stagePercent.toFixed(0)}%` : ""}` : "";
                    const statusText = isComplete ? (singleItem ? "Completed" : `Completed · ${itemCount} items`) : isError ? job.message || "Some items failed" : isCancelled ? "Cancelled" : isQueued ? (singleItem ? "Queued" : `Queued · ${itemCount} items`) : stageStatus ? stageStatus : singleItem ? (sourceIsYouTube ? "Processing video" : "Uploading") : `${finishedCount}/${itemCount} complete${currentFileName && !isHttpUrl(currentNameRaw) ? ` · ${currentFileName}` : ""}`;

                    return (<div key={job.jobId}
                                 className="rounded-lg border border-transparent px-2 py-2 transition-colors duration-150 hover:border-[#293b30] hover:bg-[#19231c]">
                        <div className="flex items-start gap-2">
                            <span
                                className={`material-symbols-outlined mt-0.5 text-[18px] ${isError || isCancelled ? "text-[#ff7278]" : isComplete ? "text-[#3ecf8e]" : isQueued ? "text-[#3ecf8e]" : "text-[#779184]"}`}
                                aria-hidden="true">
                                {isError ? "error" : isCancelled ? "cancel" : isComplete ? "check_circle" : isQueued ? "schedule" : "upload_file"}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-[#e8f0eb]" title={taskTitle}>{taskTitle}</p>
                                <p className={`mt-1 text-[11px] ${statusColor}`} title={job.message}>{statusText}</p>

                                {job.torrentFiles?.length > 0 && job.status === "queued" && (<button
                                    type="button"
                                    onClick={() => {
                                        setSelectionTask(job);
                                        // Select every file by default; keyboard focus remains independent
                                        // from checkbox selection, so arrow navigation never changes the set.
                                        setSelectedTorrentFiles(Object.fromEntries(job.torrentFiles.map((torrent) => [torrent.link, torrent.files.map((file) => Number(file.index)),])));
                                        setTorrentError("");
                                    }}
                                    className="mt-2 rounded-md border border-[#2e8058] bg-[#173c29] px-2.5 py-1.5 text-[11px] font-medium text-[#9be8bd] transition-colors hover:bg-[#205538]">
                                    Select files and start
                                </button>)}

                                {isActive && (<>
                                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#29372e]">
                                        <div
                                            className={`h-full transition-[width] duration-300 ${isQueued ? "bg-[#7f8f84]" : "bg-gradient-to-r from-[#279b68] to-[#3ecf8e]"}`}
                                            style={{width: `${isQueued ? 0 : percent}%`}}/>
                                    </div>
                                    <p className="mt-1 text-right font-mono text-[10px] text-[#718477]">
                                        {job.total > 0 ? `${formatFileSize(job.transfer || 0)} / ${formatFileSize(job.total)} · ` : ""}
                                        {isQueued ? "Waiting" : `${percent.toFixed(1)}%`}
                                    </p>
                                </>)}
                                {itemCount > 1 && Array.isArray(job.items) && job.items.length > 0 && (<div
                                    className="upload-tray-scrollbar mt-2 max-h-36 space-y-1 overflow-y-auto rounded-md border border-[#29362e] bg-black/10 p-1.5">
                                    {job.items.map((item, index) => {
                                        const itemStatus = String(item.status || "queued");
                                        const itemComplete = itemStatus === "completed";
                                        const itemFailed = itemStatus === "error";
                                        const itemCancelled = itemStatus === "cancelled" || itemStatus === "skipped";
                                        const itemActive = itemStatus === "uploading" || itemStatus === "downloading" || itemStatus === "downloaded";
                                        const itemTransfer = Math.max(0, Number(item.transfer) || 0);
                                        const itemTotal = Math.max(0, Number(item.total) || Number(item.size) || 0);
                                        const itemPercent = itemComplete ? 100 : itemTotal ? Math.min(100, itemTransfer * 100 / itemTotal) : 0;
                                        const itemLabel = itemComplete ? "Done" : itemFailed ? "Failed" : itemCancelled ? itemStatus === "skipped" ? "Skipped" : "Cancelled" : itemStatus === "downloading" ? `Downloading${itemTotal ? ` · ${itemPercent.toFixed(0)}%` : ""}` : itemStatus === "downloaded" ? "Downloaded" : itemActive ? `Uploading${itemTotal ? ` · ${itemPercent.toFixed(0)}%` : ""}` : "Queued";
                                        const itemColor = itemComplete ? "text-[#3ecf8e]" : itemFailed || itemCancelled ? "text-[#ff7278]" : itemActive ? "text-[#e8f0eb]" : "text-[#7f9586]";
                                        const itemIcon = itemComplete ? "check_circle" : itemFailed ? "error" : itemCancelled ? "cancel" : itemStatus === "downloading" ? "cloud_download" : itemStatus === "uploading" ? "cloud_upload" : itemStatus === "downloaded" ? "cloud_done" : "schedule";
                                        const itemIconColor = itemComplete ? "text-[#3ecf8e]" : itemFailed || itemCancelled ? "text-[#ff7278]" : "text-[#3ecf8e]";
                                        const itemName = getTorrentFileName(item);
                                        return <div key={`${itemName}-${index}`} className="px-1 py-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`material-symbols-outlined shrink-0 text-[13px] ${itemIconColor}`}
                                                      aria-hidden="true">{itemIcon}</span>
                                                <span className="min-w-0 flex-1 truncate text-[10px] text-[#c6d2ca]"
                                                      title={itemName}>{itemName}</span>
                                                <span className={`shrink-0 text-[9px] ${itemColor}`}>{itemLabel}</span>
                                            </div>
                                            {itemActive && itemTotal > 0 &&
                                                <div className="ml-[19px] mt-1 h-1 overflow-hidden rounded-full bg-[#29372e]">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-[#279b68] to-[#3ecf8e] transition-[width] duration-200"
                                                        style={{width: `${itemPercent}%`}}/>
                                                </div>}
                                        </div>;
                                    })}
                                </div>)}
                            </div>

                            {isActive ? (<button type="button" onClick={() => cancelUploadJob(job.jobId)} className={`${iconBtnDanger} shrink-0`}
                                                 title="Cancel this upload task and skip queued items" aria-label={`Cancel upload task ${job.name}`}>
                                <span className="material-symbols-outlined text-[17px]" aria-hidden="true">close</span>
                            </button>) : (<button type="button" onClick={() => dismissUploadJob(job.jobId)} className={`${iconBtn} shrink-0`}
                                                  title="Remove task from tray" aria-label={`Remove upload task ${job.name}`}>
                                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
                            </button>)}
                        </div>
                    </div>);
                })}
            </div>
            {selectionTask && (<div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-4">
                <section ref={selectionDialogRef} tabIndex={-1} onKeyDown={handleTorrentSelectionKeyDown} role="dialog" aria-modal="true"
                         aria-labelledby="torrent-selection-title"
                         className="w-full max-w-2xl overflow-hidden rounded-xl border border-[#303b34] bg-[#111713] shadow-2xl outline-none">
                    <header className="flex items-start justify-between gap-3 border-b border-[#29362e] px-5 py-4">
                        <div className="min-w-0">
                            <p className="text-[11px] text-[#3ecf8e]">Torrent file selection</p>
                            <h2 id="torrent-selection-title" className="mt-1 text-base font-medium text-[#e8f0eb]">Choose files to download</h2>
                            <p className="mt-1 text-xs text-[#8ca296]">Use ↑ / ↓ to move the highlight, Space to select or deselect a file, and Enter
                                to start. Files download in parallel where possible, then upload sequentially.</p>
                            <p className="mt-2 text-[10px] text-[#7f9586]">↑ / ↓ Navigate <span className="px-1">·</span> Space Toggle <span
                                className="px-1">·</span> Enter Start <span className="px-1">·</span> Esc Cancel</p>
                        </div>
                        <button type="button" disabled={startingTorrent} onClick={() => {
                            setSelectionTask(null);
                            setTorrentError("");
                        }} className="rounded-md px-2 py-1 text-sm text-[#9bbba7] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="Close selection">×
                        </button>
                    </header>
                    <div className="upload-tray-scrollbar max-h-[55vh] overflow-y-auto divide-y divide-[#29362e]">
                        {selectionTask.torrentFiles.map((torrent, torrentIndex) => {
                            const selected = new Set(selectedTorrentFiles[torrent.link] || []);
                            return <section key={torrent.link}>
                                {selectionTask.torrentFiles.length > 1 && <div
                                    className="sticky top-0 border-b border-[#29362e] bg-[#151d18] px-4 py-2 text-xs font-medium text-[#dce9e0]">{torrentIndex + 1}. {torrent.name}</div>}
                                {torrent.files.map((file, fileRowIndex) => {
                                    const checked = selected.has(Number(file.index));
                                    const fileName = getTorrentFileName(file);
                                    return <div
                                        key={`${torrent.link}-${file.index}`}
                                        data-torrent-file-row="true"
                                        role="checkbox"
                                        aria-checked={checked}
                                        tabIndex={0}
                                        onClick={() => toggleTorrentFile(torrent.link, file.index)}
                                        className={`group grid w-full cursor-pointer select-none grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left transition-all duration-200 ease-out hover:bg-[#232323] focus:bg-[#292929] focus:outline focus:outline-1 focus:outline-offset-[-2px] focus:outline-[#8ca296] motion-reduce:transition-none ${fileRowIndex < torrent.files.length - 1 ? "border-b border-[#2e2e2e]" : ""}`}>
                                        <span className="flex min-w-0 items-center gap-3">
                                            <span
                                                className={`material-symbols-outlined shrink-0 text-[18px] ${checked ? "text-[#3ecf8e]" : "text-[#707070] group-hover:text-[#b4b4b4]"}`}
                                                aria-hidden="true" style={checked ? {fontVariationSettings: "'FILL' 1"} : undefined}>
                                                {checked ? "check_box" : "check_box_outline_blank"}
                                            </span>
                                            <span className="min-w-0 flex-1 break-words text-sm text-[#fafafa]" title={fileName}>{fileName}</span>
                                        </span>
                                        <span className="shrink-0 font-mono text-xs text-[#898989]">{formatFileSize(Number(file.size) || 0)}</span>
                                    </div>;
                                })}
                            </section>;
                        })}
                    </div>
                    {torrentError && <p role="alert" className="px-5 pt-3 text-xs text-[#ff7278]">{torrentError}</p>}
                    <footer className="flex items-center justify-between gap-3 border-t border-[#29362e] px-5 py-4">
                        <button type="button" disabled={startingTorrent} onClick={() => {
                            setSelectionTask(null);
                            setTorrentError("");
                        }}
                                className="rounded-md border border-[#713b3d] bg-[#3a1c20] px-3 py-2 text-xs font-medium text-[#ff9298] transition-colors hover:border-[#a94a50] hover:bg-[#512329] disabled:cursor-not-allowed disabled:opacity-50">Cancel
                        </button>
                        <button ref={startTorrentButtonRef} type="button"
                                disabled={startingTorrent || selectionTask.torrentFiles.every((torrent) => !(selectedTorrentFiles[torrent.link] || []).length)}
                                onClick={async () => {
                                    setStartingTorrent(true);
                                    setTorrentError("");
                                    let selectionClosed = false;
                                    try {
                                        const token = getToken();
                                        if (!token) throw new Error("Your session has expired.");
                                        const totalFiles = selectionTask.torrentFiles.reduce((count, torrent) => count + (selectedTorrentFiles[torrent.link] || []).length, 0);
                                        let taskItems = selectionTask.torrentFiles.flatMap((torrent) => torrent.files
                                            .filter((file) => (selectedTorrentFiles[torrent.link] || []).includes(Number(file.index)))
                                            .map((file) => ({
                                                name: getTorrentFileName(file),
                                                size: Number(file.size) || 0,
                                                status: "queued",
                                                message: "Queued",
                                                torrent_link: torrent.link,
                                                file_index: Number(file.index),
                                                path: file.path
                                            })));
                                        const patchResponse = await fetch(`${API_URL}/auth/upload-batches/${encodeURIComponent(selectionTask.jobId)}`, {
                                            method: "PATCH",
                                            headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
                                            body: JSON.stringify({
                                                status: "uploading",
                                                message: `Downloading ${totalFiles} selected file${totalFiles === 1 ? "" : "s"}`,
                                                items: taskItems,
                                                total_items: totalFiles,
                                                completed_items: 0,
                                                current_name: taskItems[0]?.name || "",
                                            }),
                                        });
                                        if (!patchResponse.ok) throw new Error("Could not start the torrent task.");

                                        // The batch is now persisted and visible in the tray. Dismiss the
                                        // picker immediately; the async import workflow continues below.
                                        setSelectionTask(null);
                                        setStartingTorrent(false);
                                        selectionClosed = true;

                                        // Start each torrent in queue order and wait for it to finish before
                                        // starting the next, keeping the storage uploads sequential.
                                        for (const torrent of selectionTask.torrentFiles) {
                                            const selected = selectedTorrentFiles[torrent.link] || [];
                                            if (!selected.length) continue;
                                            const firstFileName = taskItems.find((item) => item.torrent_link === torrent.link)?.name || "Unnamed file";
                                            const currentItems = taskItems.map((item) => item.torrent_link === torrent.link ? {
                                                ...item, status: "downloading", message: `Downloading ${item.name}`
                                            } : item);
                                            taskItems = currentItems;
                                            await fetch(`${API_URL}/auth/upload-batches/${encodeURIComponent(selectionTask.jobId)}`, {
                                                method: "PATCH",
                                                headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
                                                body: JSON.stringify({
                                                    items: currentItems, current_name: firstFileName, message: `Downloading ${firstFileName}`
                                                }),
                                            });
                                            const params = new URLSearchParams({
                                                link: torrent.link,
                                                data_center: selectionTask.dataCenter,
                                                directory: selectionTask.directory,
                                                batch_id: selectionTask.jobId,
                                                selected_files: JSON.stringify(selected),
                                            });
                                            const response = await fetch(`${API_URL}/auth/upload-link?${params.toString()}`, {
                                                method: "POST", headers: {Authorization: `Bearer ${token}`},
                                            });
                                            if (!response.ok) {
                                                const payload = await response.json().catch(() => ({}));
                                                throw new Error(payload.detail || `Could not start ${firstFileName}`);
                                            }
                                            const payload = await response.json();
                                            await fetch(`${API_URL}/auth/upload-batches/${encodeURIComponent(selectionTask.jobId)}`, {
                                                method: "PATCH",
                                                headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
                                                body: JSON.stringify({
                                                    current_job_id: payload.job_id, current_name: firstFileName, message: `Importing ${firstFileName}`
                                                }),
                                            });
                                            let delay = 500;
                                            while (true) {
                                                const statusResponse = await fetch(`${API_URL}/public/upload/${encodeURIComponent(payload.job_id)}/status`, {
                                                    headers: {Authorization: `Bearer ${token}`}, cache: "no-store",
                                                });
                                                if (!statusResponse.ok) {
                                                    const statusError = await statusResponse.json().catch(() => ({}));
                                                    const detail = statusError.detail || statusError.message || `HTTP ${statusResponse.status}`;
                                                    throw new Error(`Could not check status for ${firstFileName}: ${detail}`);
                                                }
                                                const jobStatus = await statusResponse.json();
                                                if (Array.isArray(jobStatus.torrent_items) && jobStatus.torrent_items.length) {
                                                    const fileProgress = new Map(jobStatus.torrent_items.map((item) => [Number(item.file_index), item]));
                                                    taskItems = taskItems.map((item) => {
                                                        if (item.torrent_link !== torrent.link) return item;
                                                        let progressItem = fileProgress.get(Number(item.file_index));
                                                        if (!progressItem) {
                                                            progressItem = jobStatus.torrent_items.find((candidate) => {
                                                                const progressName = getTorrentFileName(candidate);
                                                                return progressName === item.name;
                                                            });
                                                        }
                                                        if (!progressItem) return item;
                                                        const progressStatus = String(progressItem.status || "downloading");
                                                        const isUploading = progressStatus === "uploading";
                                                        return {
                                                            ...item,
                                                            status: progressStatus,
                                                            message: progressStatus === "downloaded" ? "Downloaded · waiting to upload" : progressStatus === "downloading" ? "Downloading" : String(progressItem.message || item.message || (isUploading ? "Uploading" : progressStatus)),
                                                            transfer: Math.max(0, Number(progressItem.transfer) || 0),
                                                            total: Math.max(0, Number(progressItem.total) || Number(item.size) || 0),
                                                        };
                                                    });
                                                    const activeFile = taskItems.find((item) => item.torrent_link === torrent.link && (item.status === "downloading" || item.status === "uploading")) || taskItems.find((item) => item.torrent_link === torrent.link && item.status === "downloaded") || taskItems.find((item) => item.torrent_link === torrent.link);
                                                    const activeFileName = activeFile?.name || firstFileName;
                                                    await fetch(`${API_URL}/auth/upload-batches/${encodeURIComponent(selectionTask.jobId)}`, {
                                                        method: "PATCH",
                                                        headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
                                                        body: JSON.stringify({
                                                            items: taskItems,
                                                            current_name: activeFileName,
                                                            message: `${activeFile?.message || "Processing"}: ${activeFileName}`
                                                        }),
                                                    });
                                                }
                                                if (jobStatus.status === "completed") break;
                                                if (jobStatus.status === "cancelled" || jobStatus.status === "error") {
                                                    throw new Error(jobStatus.message || `${firstFileName} failed`);
                                                }
                                                await new Promise((resolve) => window.setTimeout(resolve, delay));
                                                delay = Math.min(2000, delay + 250);
                                            }
                                            const completedItems = taskItems.map((item) => item.torrent_link === torrent.link ? {
                                                ...item,
                                                status: "completed",
                                                message: "Completed",
                                                transfer: Number(item.size) || Number(item.total) || 0,
                                                total: Number(item.size) || Number(item.total) || 0
                                            } : item);
                                            taskItems = completedItems;
                                            await fetch(`${API_URL}/auth/upload-batches/${encodeURIComponent(selectionTask.jobId)}`, {
                                                method: "PATCH",
                                                headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
                                                body: JSON.stringify({
                                                    items: completedItems,
                                                    completed_items: completedItems.filter((item) => item.status === "completed").length,
                                                    current_name: completedItems.find((item) => item.torrent_link === torrent.link)?.name || firstFileName,
                                                    message: `Completed ${firstFileName}`,
                                                }),
                                            });
                                        }
                                        const finalResponse = await fetch(`${API_URL}/auth/upload-batches/${encodeURIComponent(selectionTask.jobId)}`, {
                                            method: "PATCH",
                                            headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
                                            body: JSON.stringify({
                                                status: "completed", message: "All selected torrent files uploaded", completed_items: taskItems.length
                                            }),
                                        });
                                        if (!finalResponse.ok) throw new Error("Files finished, but task status could not be saved.");
                                    } catch (error) {
                                        const message = error instanceof Error ? error.message : "Could not start torrent download.";
                                        if (!selectionClosed) setTorrentError(message);
                                        const token = getToken();
                                        if (token) {
                                            void fetch(`${API_URL}/auth/upload-batches/${encodeURIComponent(selectionTask.jobId)}`, {
                                                method: "PATCH",
                                                headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
                                                body: JSON.stringify({status: "error", message}),
                                            });
                                        }
                                    } finally {
                                        if (!selectionClosed) setStartingTorrent(false);
                                    }
                                }}
                                className="rounded-md border border-[#2e8058] bg-[#17643d] px-4 py-2 text-xs font-medium text-white hover:bg-[#1d794a] disabled:cursor-not-allowed disabled:opacity-50">
                            {startingTorrent ? "Starting..." : "Start selected files"}
                        </button>
                    </footer>
                </section>
            </div>)}
        </aside>
    </>);
}
