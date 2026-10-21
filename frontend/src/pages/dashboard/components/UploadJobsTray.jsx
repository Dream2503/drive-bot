import {iconBtn, iconBtnDanger} from "../constants.js";
import {formatFileSize} from "../utils.js";

/** Displays one persistent tray row per upload batch, not one row per individual file. */
export default function UploadJobsTray({uploadJobs, cancelUploadJob, dismissUploadJob, clearAllUploadJobs}) {
    if (!uploadJobs.length) return null;

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
                    const taskTitle = singleItem?.name || job.name || "Upload task";
                    const finishedCount = Math.min(itemCount, Number(job.completedItems) || 0);
                    const statusColor = isError || isCancelled ? "text-[#ff7278]" : isComplete ? "text-[#3ecf8e]" : "text-[#8ca296]";
                    const statusText = isComplete ? (singleItem ? "Completed" : `Completed · ${itemCount} items`) : isError ? job.message || "Some items failed" : isCancelled ? "Cancelled" : isQueued ? (singleItem ? "Queued" : `Queued · ${itemCount} items`) : singleItem ? `Uploading · ${job.currentName || singleItem.name}` : `${finishedCount}/${itemCount} complete${job.currentName ? ` · ${job.currentName}` : ""}`;

                    return (<div key={job.jobId}
                                 className="rounded-lg border border-transparent px-2 py-2 transition-colors duration-150 hover:border-[#293b30] hover:bg-[#19231c]">
                        <div className="flex items-start gap-2">
                            <span
                                className={`material-symbols-outlined mt-0.5 text-[18px] ${isError || isCancelled ? "text-[#ff7278]" : isComplete ? "text-[#3ecf8e]" : isQueued ? "text-[#b9a16e]" : "text-[#779184]"}`}
                                aria-hidden="true">
                                {isError ? "error" : isCancelled ? "cancel" : isComplete ? "check_circle" : isQueued ? "schedule" : "upload_file"}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-[#e8f0eb]" title={taskTitle}>{taskTitle}</p>
                                <p className={`mt-1 text-[11px] ${statusColor}`} title={job.message}>{statusText}</p>

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
                                        const itemActive = itemStatus === "uploading";
                                        const itemLabel = itemComplete ? "Done" : itemFailed ? "Failed" : itemCancelled ? itemStatus === "skipped" ? "Skipped" : "Cancelled" : itemActive ? "Uploading" : "Queued";
                                        const itemColor = itemComplete ? "text-[#3ecf8e]" : itemFailed || itemCancelled ? "text-[#ff7278]" : itemActive ? "text-[#e8f0eb]" : "text-[#7f9586]";
                                        const itemIcon = itemComplete ? "check_circle" : itemFailed ? "error" : itemCancelled ? "cancel" : itemActive ? "progress_activity" : "schedule";
                                        return <div key={`${item.name}-${index}`} className="flex items-center gap-1.5 px-1 py-0.5">
                                            <span className={`material-symbols-outlined shrink-0 text-[13px] ${itemColor}`}
                                                  aria-hidden="true">{itemIcon}</span>
                                            <span className="min-w-0 flex-1 truncate text-[10px] text-[#c6d2ca]" title={item.name}>{item.name}</span>
                                            <span className={`shrink-0 text-[9px] ${itemColor}`}>{itemLabel}</span>
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
        </aside>
    </>);
}
