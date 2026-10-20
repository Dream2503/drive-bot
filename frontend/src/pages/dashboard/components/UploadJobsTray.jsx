import {iconBtn, iconBtnDanger} from "../constants.js";
import {formatFileSize} from "../utils.js";

/** Displays active and completed upload jobs in the dashboard tray. */
export default function UploadJobsTray({uploadJobs, cancelUploadJob, dismissUploadJob}) {
    return (<>
        {uploadJobs.length > 0 && (<aside
            aria-label="Uploads"
            className="fixed bottom-4 right-4 z-[120] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#363636] bg-[#1f1f1f] shadow-2xl"
        >
            <div className="flex items-center justify-between border-b border-[#363636] px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-[#3ecf8e]" aria-hidden="true">cloud_upload</span>
                    <span className="text-sm font-medium text-[#fafafa]">Uploads</span>
                    <span
                        className="rounded-full bg-[#2a2a2a] px-2 py-0.5 text-[11px] text-[#b4b4b4]">{uploadJobs.filter(job => job.status === "uploading").length} active</span>
                </div>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto p-2">
                {uploadJobs.slice().reverse().map((job) => {
                    const isComplete = job.status === "completed";
                    const isError = job.status === "error";
                    const percent = isComplete ? 100 : Math.max(0, Math.min(99, Number(job.progress) || 0));
                    return (<div key={job.jobId} className="rounded-lg px-2 py-2 hover:bg-[#252525]">
                        <div className="flex items-start gap-2">
                    <span
                        className={`material-symbols-outlined mt-0.5 text-[18px] ${isError ? "text-[#ff6369]" : isComplete ? "text-[#3ecf8e]" : "text-[#898989]"}`}
                        aria-hidden="true">
                        {isError ? "error" : isComplete ? "check_circle" : "upload_file"}
                    </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-[#fafafa]" title={job.name}>{job.name || "Upload"}</p>
                                <p className={`mt-1 text-[11px] ${isError ? "text-[#ff6369]" : isComplete ? "text-[#3ecf8e]" : "text-[#898989]"}`}>
                                    {isError ? (job.message || "Upload failed") : isComplete ? "Completed" : (job.message || "Uploading")}
                                </p>
                                {!isError && <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#363636]">
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${isComplete ? "bg-[#3ecf8e]" : "bg-[#3ecf8e]"}`}
                                        style={{width: `${percent}%`}}/>
                                </div>}
                                {!isError && <p className="mt-1 text-right font-mono text-[10px] text-[#707070]">
                                    {job.total > 0 ? `${formatFileSize(job.transfer || 0)} / ${formatFileSize(job.total)} · ` : ""}{percent.toFixed(1)}%
                                </p>}
                            </div>
                            {job.status === "uploading" && job.kind === "file" ? <button
                                type="button"
                                onClick={() => cancelUploadJob(job.jobId)}
                                className={`${iconBtnDanger} shrink-0`}
                                title="Cancel upload"
                                aria-label={`Cancel upload ${job.name || "file"}`}
                            >
                                <span className="material-symbols-outlined text-[17px]" aria-hidden="true">close</span>
                            </button> : job.status !== "uploading" ?
                                <button type="button" onClick={() => dismissUploadJob(job.jobId)} className={iconBtn} title="Remove upload"
                                        aria-label="Remove upload">
                                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
                                </button> : null}
                        </div>
                    </div>);
                })}
            </div>
        </aside>)}
    </>);
}
