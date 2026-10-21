import {useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
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

function getTorrentKey(torrent, index) {
    return String(torrent?.queueIndex ?? index);
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

/** Reusable torrent-specific progress panel used inside a multi-link batch. */
function TorrentLinkPanel({torrent, items, parentStatus, index}) {
    const torrentItems = Array.isArray(items) ? items : [];
    const previewFiles = Array.isArray(torrent?.files) ? torrent.files : [];
    const files = torrentItems.length ? torrentItems : previewFiles;
    const selectedCount = torrentItems.length;
    const completeCount = torrentItems.filter((item) => item.status === "completed").length;
    const hasError = torrentItems.some((item) => item.status === "error");
    const hasDownloading = torrentItems.some((item) => item.status === "downloading");
    const hasUploading = torrentItems.some((item) => item.status === "uploading");
    const hasDownloaded = torrentItems.some((item) => item.status === "downloaded");
    const totalBytes = torrentItems.reduce((sum, item) => sum + Math.max(0, Number(item.total) || Number(item.size) || 0), 0);
    const transferredBytes = torrentItems.reduce((sum, item) => {
        if (item.status === "completed") return sum + Math.max(0, Number(item.total) || Number(item.size) || 0);
        return sum + Math.max(0, Number(item.transfer) || 0);
    }, 0);
    const percent = totalBytes > 0 ? Math.max(0, Math.min(100, transferredBytes * 100 / totalBytes)) : 0;
    const allComplete = torrentItems.length > 0 && completeCount === torrentItems.length;
    const status = hasError ? "Some files failed" : allComplete ? "Completed" : hasUploading ? "Uploading" : hasDownloading ? "Downloading" : hasDownloaded ? "Downloaded · waiting to upload" : parentStatus === "cancelled" ? "Cancelled" : torrentItems.length ? "Queued" : parentStatus === "queued" ? `${previewFiles.length} files available` : "Awaiting selection";
    const statusColor = hasError ? "text-[#ff7278]" : allComplete ? "text-[#3ecf8e]" : "text-[#8ca296]";
    const title = String(torrent?.name || `Torrent ${index + 1}`);
    const linkValue = String(torrent?.link || "");

    return <section className="min-w-0 overflow-hidden rounded-md border border-[#293b30] bg-black/10">
        <header className="flex min-w-0 items-start gap-2 border-b border-[#29362e] bg-[#151d18]/70 px-3 py-2">
            <span className="material-symbols-outlined mt-0.5 text-[15px] text-[#3ecf8e]" aria-hidden="true">folder_zip</span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-[#dce9e0]" title={title}>{title}</p>
                <p className={`mt-0.5 text-[10px] ${statusColor}`}
                   title={linkValue}>{status}{selectedCount ? ` · ${completeCount}/${selectedCount} files complete` : ""}</p>
            </div>
            {selectedCount > 0 && <span className="shrink-0 font-mono text-[10px] text-[#718477]">{percent.toFixed(0)}%</span>}
        </header>
        {selectedCount > 0 && <div className="h-1 overflow-hidden bg-[#29372e]">
            <div className="h-full bg-gradient-to-r from-[#279b68] to-[#3ecf8e] transition-[width] duration-300"
                 style={{width: `${allComplete ? 100 : percent}%`}}/>
        </div>}
        <div className="space-y-0.5 p-1.5">
            {files.length ? files.map((file, fileIndex) => {
                const itemStatus = String(file.status || (selectedCount ? "queued" : "available"));
                const itemComplete = itemStatus === "completed";
                const itemError = itemStatus === "error";
                const itemCancelled = itemStatus === "cancelled" || itemStatus === "skipped";
                const itemDownloading = itemStatus === "downloading";
                const itemUploading = itemStatus === "uploading";
                const itemDownloaded = itemStatus === "downloaded";
                const size = Math.max(0, Number(file.total) || Number(file.size) || 0);
                const transferred = itemComplete ? size : Math.max(0, Number(file.transfer) || 0);
                const filePercent = size ? Math.min(100, transferred * 100 / size) : 0;
                const label = itemComplete ? "Done" : itemError ? "Failed" : itemCancelled ? (itemStatus === "skipped" ? "Skipped" : "Cancelled") : itemDownloading ? `Downloading${size ? ` · ${filePercent.toFixed(0)}%` : ""}` : itemUploading ? `Uploading${size ? ` · ${filePercent.toFixed(0)}%` : ""}` : itemDownloaded ? "Downloaded" : selectedCount ? "Queued" : "Available";
                const icon = itemComplete ? "check_circle" : itemError ? "error" : itemCancelled ? "cancel" : itemDownloading ? "cloud_download" : itemUploading ? "cloud_upload" : itemDownloaded ? "cloud_done" : "schedule";
                const iconColor = itemError || itemCancelled ? "text-[#ff7278]" : "text-[#3ecf8e]";
                const filename = getTorrentFileName(file);
                return <div key={`${file.file_index ?? file.index ?? filename}-${fileIndex}`}
                            className="min-w-0 rounded px-1.5 py-1 hover:bg-white/[0.025]">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span className={`material-symbols-outlined shrink-0 text-[13px] ${iconColor}`} aria-hidden="true">{icon}</span>
                        <span className="min-w-0 flex-1 truncate text-[10px] text-[#c6d2ca]" title={filename}>{filename}</span>
                        <span
                            className={`shrink-0 text-[9px] ${itemError || itemCancelled ? "text-[#ff7278]" : itemComplete ? "text-[#3ecf8e]" : "text-[#8ca296]"}`}>{label}</span>
                    </div>
                    {(itemDownloading || itemUploading) && size > 0 && <div className="ml-[19px] mt-1 h-1 overflow-hidden rounded-full bg-[#29372e]">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#279b68] to-[#3ecf8e]" style={{width: `${filePercent}%`}}/>
                    </div>}
                </div>;
            }) : <p className="px-2 py-2 text-[10px] text-[#718477]">Waiting for torrent file selection.</p>}
        </div>
    </section>;
}

/** Displays one persistent tray row per upload batch, not one row per individual file. */
export default function UploadJobsTray({uploadJobs, cancelUploadJob, dismissUploadJob, clearAllUploadJobs, fullscreen = false}) {
    const navigate = useNavigate();
    const [selectionTask, setSelectionTask] = useState(null);
    const [selectedTorrentFiles, setSelectedTorrentFiles] = useState({});
    const [torrentSelectionIndex, setTorrentSelectionIndex] = useState(0);
    const [selectionOpen, setSelectionOpen] = useState(false);
    const [startingTorrent, setStartingTorrent] = useState(false);
    const [torrentError, setTorrentError] = useState("");
    const selectionDialogRef = useRef(null);
    const startTorrentButtonRef = useRef(null);
    const selectionAdvanceTimerRef = useRef(null);
    // Remember which queued batches have already prompted automatically. This prevents
    // the 1-second polling refresh from reopening a dialog the user intentionally closed.
    const promptedTorrentBatchesRef = useRef(new Set());

    function openTorrentSelection(job) {
        if (!job || !Array.isArray(job.torrentFiles) || job.torrentFiles.length === 0) return;
        setSelectionTask(job);
        setTorrentSelectionIndex(0);
        setSelectionOpen(true);
        setSelectedTorrentFiles(Object.fromEntries(job.torrentFiles.map((torrent, torrentIndex) => [getTorrentKey(torrent, torrentIndex), (Array.isArray(torrent.files) ? torrent.files : []).map((file) => Number(file.index)),])));
        setTorrentError("");
    }

    // Once torrent metadata has been resolved, prompt for file selection automatically.
    // Previously the dialog was only opened by the tray button, so the normal upload path
    // could appear to skip selection entirely.
    useEffect(() => {
        if (selectionTask || selectionOpen) return;
        const queuedTorrentJob = uploadJobs.find((job) => job.status === "queued" && Array.isArray(job.torrentFiles) && job.torrentFiles.length > 0 && !promptedTorrentBatchesRef.current.has(job.jobId));
        if (!queuedTorrentJob) return;
        promptedTorrentBatchesRef.current.add(queuedTorrentJob.jobId);
        openTorrentSelection(queuedTorrentJob);
    }, [uploadJobs, selectionTask, selectionOpen]);

    useEffect(() => {
        if (!selectionTask || !selectionOpen) return;
        const firstFileRow = selectionDialogRef.current?.querySelector('[data-torrent-file-row="true"]');
        (firstFileRow || selectionDialogRef.current)?.focus();
    }, [selectionTask, selectionOpen, torrentSelectionIndex]);

    useEffect(() => () => {
        if (selectionAdvanceTimerRef.current) window.clearTimeout(selectionAdvanceTimerRef.current);
    }, []);

    function closeTorrentSelection() {
        if (selectionAdvanceTimerRef.current) window.clearTimeout(selectionAdvanceTimerRef.current);
        selectionAdvanceTimerRef.current = null;
        setSelectionOpen(false);
        setSelectionTask(null);
        setTorrentError("");
    }

    function advanceTorrentSelection() {
        if (!selectionTask || startingTorrent) return;
        if (torrentSelectionIndex >= selectionTask.torrentFiles.length - 1) return;
        setSelectionOpen(false);
        if (selectionAdvanceTimerRef.current) window.clearTimeout(selectionAdvanceTimerRef.current);
        selectionAdvanceTimerRef.current = window.setTimeout(() => {
            selectionAdvanceTimerRef.current = null;
            setTorrentSelectionIndex((current) => current + 1);
            setTorrentError("");
            setSelectionOpen(true);
        }, 100);
    }

    function toggleTorrentFile(torrentKey, fileIndex) {
        setSelectedTorrentFiles((current) => {
            const next = new Set(current[torrentKey] || []);
            const index = Number(fileIndex);
            if (next.has(index)) next.delete(index); else next.add(index);
            return {...current, [torrentKey]: [...next]};
        });
    }

    function handleTorrentSelectionKeyDown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!startingTorrent) {
                closeTorrentSelection();
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

    if (!uploadJobs.length && !selectionTask && !fullscreen) return null;

    const activeCount = uploadJobs.filter((job) => job.status === "queued" || job.status === "uploading").length;
    const currentSelectionTorrent = selectionTask?.torrentFiles?.[torrentSelectionIndex] || null;
    const currentSelectionKey = currentSelectionTorrent ? getTorrentKey(currentSelectionTorrent, torrentSelectionIndex) : "";

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
               className={`${fullscreen ? "flex h-[100dvh] w-full flex-col rounded-none border-0 shadow-none" : "fixed bottom-4 right-4 z-[120] w-[min(25rem,calc(100vw-2rem))] rounded-xl border border-[#303b34] shadow-2xl shadow-black/40"} min-w-0 overflow-hidden bg-[#111713]`}>
            <div className="flex items-center justify-between gap-3 border-b border-[#29362e] bg-[#151d18] px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-[#3ecf8e]" aria-hidden="true">cloud_upload</span>
                    <span className="text-sm font-medium text-[#e8f0eb]">Upload tasks</span>
                    <span className="rounded-full border border-[#2b4938] bg-[#1c2c22] px-2 py-0.5 text-[11px] text-[#9bbba7]">
                        {activeCount} active
                    </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => navigate(fullscreen ? "/home" : "/upload-tray")}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-[#9bbba7] transition-colors hover:bg-white/5 hover:text-[#f3f7f4]"
                            title={fullscreen ? "Return to dashboard" : "Open full-screen upload tray"}
                            aria-label={fullscreen ? "Return to dashboard" : "Maximize upload tray"}>
                        <span className="material-symbols-outlined text-[17px]"
                              aria-hidden="true">{fullscreen ? "close_fullscreen" : "open_in_full"}</span>
                    </button>
                    <button type="button" onClick={() => clearAllUploadJobs?.()}
                            className="shrink-0 rounded-md px-2 py-1 text-[11px] text-[#9bbba7] transition-colors hover:bg-white/5 hover:text-[#f3f7f4]"
                            title="Cancel active tasks and clear all task history">
                        Clear all
                    </button>
                </div>
            </div>

            <div className={`upload-tray-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-2 ${fullscreen ? "max-h-none" : "max-h-80"}`}>
                {!uploadJobs.length && <div className="flex min-h-48 items-center justify-center px-4 py-10 text-center">
                    <div>
                        <span className="material-symbols-outlined text-3xl text-[#3b5144]" aria-hidden="true">cloud_upload</span>
                        <p className="mt-3 text-sm text-[#c6d2ca]">No upload tasks yet</p>
                        <p className="mt-1 text-xs text-[#718477]">New uploads will appear here with live progress.</p>
                    </div>
                </div>}
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
                                        // Keep a manual way to reopen the picker after cancelling it.
                                        promptedTorrentBatchesRef.current.add(job.jobId);
                                        openTorrentSelection(job);
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
                                {job.torrentFiles?.length > 1 && <div
                                    className="upload-tray-scrollbar mt-2 max-h-[min(55vh,32rem)] space-y-2 overflow-y-auto rounded-md border border-[#29362e] bg-black/10 p-2">
                                    <div className="flex items-center justify-between px-1 pb-1">
                                        <span
                                            className="text-[10px] font-semibold uppercase tracking-wide text-[#9bbba7]">{job.torrentFiles.length} Links</span>
                                        <span className="text-[10px] text-[#718477]">Sequential torrent processing</span>
                                    </div>
                                    {job.torrentFiles.map((torrent, torrentIndex) => <TorrentLinkPanel
                                        key={getTorrentKey(torrent, torrentIndex)}
                                        torrent={torrent}
                                        index={torrentIndex}
                                        parentStatus={job.status}
                                        items={(Array.isArray(job.items) ? job.items : []).filter((item) => item.torrent_index !== undefined && item.torrent_index !== null ? Number(item.torrent_index) === Number(torrent.queueIndex ?? torrentIndex) : item.torrent_link === torrent.link)}
                                    />)}
                                </div>}
                                {(!job.torrentFiles || job.torrentFiles.length <= 1) && itemCount > 1 && Array.isArray(job.items) && job.items.length > 0 && (
                                    <div
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
            {selectionTask && selectionOpen && currentSelectionTorrent && (
                <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-4">
                    <section ref={selectionDialogRef} tabIndex={-1} onKeyDown={handleTorrentSelectionKeyDown} role="dialog" aria-modal="true"
                             aria-labelledby="torrent-selection-title"
                             className="flex max-h-[min(88dvh,54rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#303b34] bg-[#111713] shadow-2xl outline-none">
                        <header className="flex items-start justify-between gap-3 border-b border-[#29362e] px-5 py-4">
                            <div className="min-w-0">
                                <p className="text-[11px] text-[#3ecf8e]">Torrent {torrentSelectionIndex + 1} of {selectionTask.torrentFiles.length}</p>
                                <h2 id="torrent-selection-title" className="mt-1 truncate text-base font-medium text-[#e8f0eb]"
                                    title={currentSelectionTorrent.name}>{currentSelectionTorrent.name}</h2>
                                <p className="mt-1 text-xs text-[#8ca296]">Choose the files to download from this torrent. The next torrent will open
                                    after you continue.</p>
                                <p className="mt-2 text-[10px] text-[#7f9586]">↑ / ↓ Navigate <span className="px-1">·</span> Space Toggle <span
                                    className="px-1">·</span> Enter {torrentSelectionIndex + 1 < selectionTask.torrentFiles.length ? "Next torrent" : "Start"}
                                    <span className="px-1">·</span> Esc Cancel</p>
                            </div>
                            <button type="button" disabled={startingTorrent} onClick={() => {
                                closeTorrentSelection();
                            }}
                                    className="rounded-md px-2 py-1 text-sm text-[#9bbba7] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label="Close selection">×
                            </button>
                        </header>
                        <div className="upload-tray-scrollbar min-h-0 flex-1 overflow-y-auto divide-y divide-[#29362e]">
                            <div
                                className="sticky top-0 flex items-center justify-between gap-3 border-b border-[#29362e] bg-[#151d18] px-4 py-2 text-xs">
                                <span className="min-w-0 truncate font-medium text-[#dce9e0]"
                                      title={currentSelectionTorrent.name}>{currentSelectionTorrent.name}</span>
                                <span
                                    className="shrink-0 text-[#8ca296]">{(selectedTorrentFiles[currentSelectionKey] || []).length} / {currentSelectionTorrent.files.length} selected</span>
                            </div>
                            {currentSelectionTorrent.files.map((file, fileRowIndex) => {
                                const selected = new Set(selectedTorrentFiles[currentSelectionKey] || []);
                                const checked = selected.has(Number(file.index));
                                const fileName = getTorrentFileName(file);
                                return <div
                                    key={`${currentSelectionTorrent.link}-${file.index}`}
                                    data-torrent-file-row="true"
                                    role="checkbox"
                                    aria-checked={checked}
                                    tabIndex={0}
                                    onClick={() => toggleTorrentFile(currentSelectionKey, file.index)}
                                    className={`group grid w-full cursor-pointer select-none grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left transition-all duration-200 ease-out hover:bg-[#232323] focus:bg-[#292929] focus:outline focus:outline-1 focus:outline-offset-[-2px] focus:outline-[#8ca296] motion-reduce:transition-none ${fileRowIndex < currentSelectionTorrent.files.length - 1 ? "border-b border-[#2e2e2e]" : ""}`}>
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
                        </div>
                        {torrentError && <p role="alert" className="px-5 pt-3 text-xs text-[#ff7278]">{torrentError}</p>}
                        <footer className="flex items-center justify-between gap-3 border-t border-[#29362e] px-5 py-4">
                            <button type="button" disabled={startingTorrent} onClick={() => {
                                closeTorrentSelection();
                            }}
                                    className="rounded-md border border-[#713b3d] bg-[#3a1c20] px-3 py-2 text-xs font-medium text-[#ff9298] transition-colors hover:border-[#a94a50] hover:bg-[#512329] disabled:cursor-not-allowed disabled:opacity-50">Cancel
                            </button>
                            <button ref={startTorrentButtonRef} type="button"
                                    disabled={startingTorrent || (torrentSelectionIndex >= selectionTask.torrentFiles.length - 1 && selectionTask.torrentFiles.every((torrent, index) => !(selectedTorrentFiles[getTorrentKey(torrent, index)] || []).length))}
                                    onClick={async () => {
                                        if (torrentSelectionIndex < selectionTask.torrentFiles.length - 1) {
                                            advanceTorrentSelection();
                                            return;
                                        }
                                        setStartingTorrent(true);
                                        setTorrentError("");
                                        let selectionClosed = false;
                                        try {
                                            const token = getToken();
                                            if (!token) throw new Error("Your session has expired.");
                                            const totalFiles = selectionTask.torrentFiles.reduce((count, torrent, index) => count + (selectedTorrentFiles[getTorrentKey(torrent, index)] || []).length, 0);
                                            let taskItems = selectionTask.torrentFiles.flatMap((torrent, torrentIndex) => torrent.files
                                                .filter((file) => (selectedTorrentFiles[getTorrentKey(torrent, torrentIndex)] || []).includes(Number(file.index)))
                                                .map((file) => ({
                                                    name: getTorrentFileName(file),
                                                    size: Number(file.size) || 0,
                                                    status: "queued",
                                                    message: "Queued",
                                                    torrent_link: torrent.link,
                                                    torrent_index: Number(torrent.queueIndex ?? torrentIndex),
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
                                            setSelectionOpen(false);
                                            setSelectionTask(null);
                                            setStartingTorrent(false);
                                            selectionClosed = true;

                                            // Start each torrent in queue order and wait for it to finish before
                                            // starting the next, keeping the storage uploads sequential.
                                            for (const [torrentIndex, torrent] of selectionTask.torrentFiles.entries()) {
                                                const torrentKey = getTorrentKey(torrent, torrentIndex);
                                                const currentTorrentIndex = Number(torrent.queueIndex ?? torrentIndex);
                                                const isTorrentItem = (item) => item.torrent_index !== undefined && item.torrent_index !== null ? Number(item.torrent_index) === currentTorrentIndex : item.torrent_link === torrent.link;
                                                const selected = selectedTorrentFiles[torrentKey] || [];
                                                if (!selected.length) continue;
                                                const firstFileName = taskItems.find(isTorrentItem)?.name || "Unnamed file";
                                                const currentItems = taskItems.map((item) => isTorrentItem(item) ? {
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
                                                        current_job_id: payload.job_id,
                                                        current_name: firstFileName,
                                                        message: `Importing ${firstFileName}`
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
                                                            if (!isTorrentItem(item)) return item;
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
                                                        const activeFile = taskItems.find((item) => isTorrentItem(item) && (item.status === "downloading" || item.status === "uploading")) || taskItems.find((item) => isTorrentItem(item) && item.status === "downloaded") || taskItems.find(isTorrentItem);
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
                                                const completedItems = taskItems.map((item) => isTorrentItem(item) ? {
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
                                                        current_name: completedItems.find(isTorrentItem)?.name || firstFileName,
                                                        message: `Completed ${firstFileName}`,
                                                    }),
                                                });
                                            }
                                            const finalResponse = await fetch(`${API_URL}/auth/upload-batches/${encodeURIComponent(selectionTask.jobId)}`, {
                                                method: "PATCH",
                                                headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
                                                body: JSON.stringify({
                                                    status: "completed",
                                                    message: "All selected torrent files uploaded",
                                                    completed_items: taskItems.length
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
                                {startingTorrent ? "Starting..." : torrentSelectionIndex + 1 < selectionTask.torrentFiles.length ? "Next torrent" : "Start selected files"}
                            </button>
                        </footer>
                    </section>
                </div>)}
        </aside>
    </>);
}
