import {useCallback, useEffect, useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import {createPortal} from "react-dom";

const API_URL = window.STORELIMITLESS_CONFIG?.API_URL ?? import.meta.env.VITE_API_URL

const NAV_ITEMS = [{id: "files", icon: "folder_open", label: "All Files", enabled: true}, {
    id: "trash", icon: "delete", label: "Trash", enabled: true
},];

// Shared Supabase-style button / input classes
const btnSecondary = "inline-flex h-8 items-center gap-1.5 rounded-md border border-[#363636] bg-[#242424] px-3 text-xs text-[#fafafa] transition-colors hover:border-[#4d4d4d] hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary = "inline-flex h-8 items-center gap-1.5 rounded-md border border-[#3ecf8e]/40 bg-[#006239] px-3 text-xs text-[#fafafa] transition-colors hover:border-[#3ecf8e]/70 hover:bg-[#007a46] disabled:cursor-not-allowed disabled:opacity-50";
const iconBtn = "flex h-7 w-7 items-center justify-center rounded-md text-[#898989] transition-colors hover:bg-[#2a2a2a] hover:text-[#fafafa] disabled:opacity-50";
const iconBtnDanger = "flex h-7 w-7 items-center justify-center rounded-md text-[#898989] transition-colors hover:bg-[#e5484d]/10 hover:text-[#ff6369] disabled:opacity-50";
const inputClass = "w-full h-[38px] rounded-md border border-[#363636] bg-white/[0.026] px-3 text-sm text-[#fafafa] placeholder:text-[#707070] outline-none transition-colors focus:border-[#707070] focus:ring-2 focus:ring-[#4d4d4d]/50 disabled:opacity-60";

const FILE_ICONS = {
    pdf: {icon: "picture_as_pdf", color: "text-[#ff6369]"},
    jpg: {icon: "image", color: "text-[#3ecf8e]"},
    jpeg: {icon: "image", color: "text-[#3ecf8e]"},
    png: {icon: "image", color: "text-[#3ecf8e]"},
    gif: {icon: "image", color: "text-[#3ecf8e]"},
    webp: {icon: "image", color: "text-[#3ecf8e]"},
    txt: {icon: "subject", color: "text-[#898989]"},
    zip: {icon: "folder_zip", color: "text-[#f5a524]"},
    rar: {icon: "folder_zip", color: "text-[#f5a524]"},
    mp4: {icon: "movie", color: "text-[#70b8ff]"},
    mkv: {icon: "movie", color: "text-[#70b8ff]"},
    mp3: {icon: "music_note", color: "text-[#70b8ff]"},
    wav: {icon: "music_note", color: "text-[#70b8ff]"},
    py: {icon: "code", color: "text-[#b4b4b4]"},
    js: {icon: "javascript", color: "text-[#b4b4b4]"},
    jsx: {icon: "code", color: "text-[#b4b4b4]"},
    default: {icon: "draft", color: "text-[#898989]"},
};

function getFileIcon(filename) {
    const extension = filename?.split(".").pop()?.toLowerCase();
    return FILE_ICONS[extension] || FILE_ICONS.default;
}

function formatDate(dateStr) {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
    });
}

function getFileKind(filename) {
    const ext = filename?.split(".").pop()?.toLowerCase();
    if (["mp4", "mkv", "webm", "mov"].includes(ext)) return "video";
    if (["mp3", "wav", "ogg"].includes(ext)) return "audio";
    if (ext === "pdf") return "pdf";
    return null;
}

function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function getToken() {
    return localStorage.getItem("token");
}

/* -------------------------------------------------------------------- */
/* Sidebar                                                             */

/* -------------------------------------------------------------------- */

function Sidebar({activeTab, onTabSelect, onUpload, onCreateFolder, onLogout}) {
    return (<nav className="flex h-screen w-60 flex-col border-r border-[#2e2e2e] bg-[#171717]">
        {/* Brand */}
        <div className="flex h-14 items-center gap-2.5 border-b border-[#2e2e2e] px-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#3ecf8e]">
                    <span
                        className="material-symbols-outlined text-[18px] text-[#0f0f0f]"
                        style={{fontVariationSettings: "'FILL' 1"}}
                        aria-hidden="true"
                    >
                        cloud
                    </span>
            </div>
            <div className="leading-tight">
                <h1 className="text-sm font-medium tracking-tight text-[#fafafa]">DriveBot</h1>
                <p className="text-[11px] text-[#707070]">File Management</p>
            </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-3">
            <div className="flex flex-col gap-2">
                <button
                    type="button"
                    onClick={onUpload}
                    className={`${btnPrimary} h-9 w-full justify-center text-sm`}
                >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                        cloud_upload
                    </span>
                    Upload Files
                </button>
                <button
                    type="button"
                    onClick={onCreateFolder}
                    className={`${btnSecondary} h-9 w-full justify-center text-sm`}
                >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                        create_new_folder
                    </span>
                    Create Folder
                </button>
            </div>

            <div className="flex flex-1 flex-col gap-0.5">
                {NAV_ITEMS.map(({id, icon, label, enabled}) => {
                    const isActive = activeTab === id;
                    return (<button
                        key={id}
                        type="button"
                        disabled={!enabled}
                        onClick={enabled ? () => onTabSelect(id) : undefined}
                        title={enabled ? undefined : "Coming soon"}
                        className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors ${isActive ? "bg-[#2a2a2a] text-[#fafafa]" : enabled ? "text-[#898989] hover:bg-[#232323] hover:text-[#fafafa]" : "cursor-not-allowed text-[#4d4d4d]"}`}
                    >
                                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                                    {icon}
                                </span>
                        {label}
                    </button>);
                })}
            </div>

            <div className="flex flex-col gap-0.5 border-t border-[#2e2e2e] pt-3">
                <button
                    type="button"
                    className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-[#898989] transition-colors hover:bg-[#232323] hover:text-[#fafafa]"
                >
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                            help_outline
                        </span>
                    Help
                </button>

                <button
                    type="button"
                    onClick={onLogout}
                    className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-[#898989] transition-colors hover:bg-[#e5484d]/10 hover:text-[#ff6369]"
                >
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                            logout
                        </span>
                    Sign Out
                </button>
            </div>
        </div>
    </nav>);
}

/* -------------------------------------------------------------------- */
/* Create Folder Modal                                                 */

/* -------------------------------------------------------------------- */

function CreateFolderModal({targetPath, onClose, onCreate}) {
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === "Escape" && !creating) onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [creating, onClose]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        const cleanName = name.trim();

        if (!cleanName) {
            setError("Folder name cannot be empty.");
            return;
        }
        if (cleanName === "." || cleanName === ".." || cleanName.includes("/") || cleanName.includes("\\")) {
            setError("Folder name contains invalid characters.");
            return;
        }

        setCreating(true);
        setError("");
        try {
            await onCreate(cleanName);
        } catch (err) {
            setError(err.message || "Failed to create folder.");
        } finally {
            setCreating(false);
        }
    };

    return (<div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
        onClick={() => !creating && onClose()}
    >
        <div
            className="w-full max-w-md rounded-lg border border-[#2e2e2e] bg-[#1c1c1c] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-base font-medium text-[#fafafa]">Create New Folder</h2>
                    <p className="mt-1 text-sm text-[#898989]">
                        Will be created inside <span className="text-[#fafafa]">{targetPath || "Root"}</span>.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    disabled={creating}
                    aria-label="Close"
                    className={iconBtn}
                >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
                </button>
            </div>

            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        setError("");
                    }}
                    placeholder="Folder name"
                    autoFocus
                    disabled={creating}
                    className={inputClass}
                />
                {error && <p className="mt-2 text-sm text-[#ff6369]">{error}</p>}
                <div className="mt-6 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={creating}
                        className={btnSecondary}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={creating}
                        className={btnPrimary}
                    >
                        {creating ? "Creating…" : "Create Folder"}
                    </button>
                </div>
            </form>
        </div>
    </div>);
}

function FileActionsMenu({file, position, onCopy, onCut, onPreview, onDelete, onClose}) {
    useEffect(() => {
        window.addEventListener("click", onClose);
        window.addEventListener("scroll", onClose, true);
        return () => {
            window.removeEventListener("click", onClose);
            window.removeEventListener("scroll", onClose, true);
        };
    }, [onClose]);

    const itemClass = "flex w-full items-center gap-2 px-3 py-1.5 text-sm text-[#fafafa] hover:bg-[#2a2a2a]";

    return createPortal(<div
        className="fixed z-[200] w-40 overflow-hidden rounded-md border border-[#363636] bg-[#1f1f1f] py-1 shadow-xl"
        style={{top: position.top, left: position.left}}
        onClick={(e) => e.stopPropagation()}
    >
        <button type="button" onClick={() => {
            onCopy(file);
            onClose();
        }} className={itemClass}>
            <span className="material-symbols-outlined text-[16px] text-[#898989]" aria-hidden="true">content_copy</span>Copy
        </button>
        <button type="button" onClick={() => {
            onCut(file);
            onClose();
        }} className={itemClass}>
            <span className="material-symbols-outlined text-[16px] text-[#898989]" aria-hidden="true">content_cut</span>Cut
        </button>
        <button type="button" onClick={() => {
            onPreview(file);
            onClose();
        }} className={itemClass}>
            <span className="material-symbols-outlined text-[16px] text-[#898989]" aria-hidden="true">visibility</span>Preview
        </button>
        <button type="button" onClick={() => {
            onDelete(file);
            onClose();
        }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-[#ff6369] hover:bg-[#e5484d]/10">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">delete</span>Delete
        </button>
    </div>, document.body);
}

/* -------------------------------------------------------------------- */
/* Dashboard Page                                                      */
/* -------------------------------------------------------------------- */

export default function DashboardPage() {
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState("files");
    const [files, setFiles] = useState([]);
    const [folders, setFolders] = useState([]);
    const [currentFolder, setCurrentFolder] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState("");
    const [loadingFiles, setLoadingFiles] = useState(true);
    const [pageError, setPageError] = useState("");
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [openMenuFileId, setOpenMenuFileId] = useState(null);
    const [clipboard, setClipboard] = useState(null);
    const [menuPosition, setMenuPosition] = useState(null);
    const [uploadJobs, setUploadJobs] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("storelimitless_upload_jobs") || "[]");
        } catch {
            return [];
        }
    });

    /* ---------------------------- fetch files --------------------------- */

    const fetchFiles = useCallback(async () => {
        const token = getToken();
        if (!token) {
            navigate("/");
            return;
        }

        setLoadingFiles(true);
        setPageError("");

        try {
            const directory = currentFolder || "/home";
            const directoryRes = await fetch(`${API_URL}/auth/directory?directory=${encodeURIComponent(directory)}`, {
                headers: {Authorization: `Bearer ${token}`},
            });

            if (directoryRes.status === 401) {
                localStorage.removeItem("token");
                navigate("/");
                return;
            }

            const directoryData = await directoryRes.json();
            if (!directoryRes.ok) throw new Error(directoryData.detail || "Failed to fetch files");

            const [activeFolders, activeFiles] = directoryData;

            const trashRes = await fetch(`${API_URL}/auth/trash`, {
                headers: {Authorization: `Bearer ${token}`},
            });

            const trashData = trashRes.ok ? await trashRes.json() : [[], []];
            const [trashFolders, trashFiles] = trashData;

            const normalizedActive = (Array.isArray(activeFiles) ? activeFiles : []).map(f => ({
                ...f, directory: currentFolder, is_deleted: false,
            }));

            const normalizedTrash = (Array.isArray(trashFiles) ? trashFiles : []).map(f => ({
                ...f, is_deleted: true,
            }));

            setFiles([...normalizedActive, ...normalizedTrash]);

            const normalizedFolders = [...(Array.isArray(activeFolders) ? activeFolders : []).map(f => ({
                path: f.path, id: f.id, is_deleted: false,
            })), ...(Array.isArray(trashFolders) ? trashFolders : []).map(f => ({
                path: f.path, id: f.id, is_deleted: true,
            })),];

            setFolders(normalizedFolders);
        } catch (error) {
            console.error("Failed to fetch files:", error);
            setPageError(error.message || "Failed to load files.");
        } finally {
            setLoadingFiles(false);
        }
    }, [navigate, currentFolder]);


    const handleFileClick = (file) => {
        const kind = getFileKind(file.name);
        const params = new URLSearchParams({name: file.name});
        if (kind) params.set("kind", kind);

        // Open the viewer in a separate tab, keeping the dashboard intact.
        const viewUrl = `${window.location.origin}/view/${file.id}?${params.toString()}`;
        window.open(viewUrl, "_blank", "noopener,noreferrer");
    };

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    // Poll active jobs. On completion, remove the job from the tray and
    // refresh the directory so the new file appears without a page reload.
    useEffect(() => {
        let cancelled = false;
        let polling = false;
        const jobsKey = "storelimitless_upload_jobs";
        const refreshUploadJobs = async () => {
            if (polling || cancelled) return;
            polling = true;
            try {
                let jobs;
                try {
                    jobs = JSON.parse(localStorage.getItem(jobsKey) || "[]");
                    if (!Array.isArray(jobs)) jobs = [];
                } catch {
                    jobs = [];
                }

                const token = getToken();
                const updatedJobs = await Promise.all(jobs.map(async (job) => {
                    if (!job?.jobId || job.status === "error" || job.status === "cancelled") return job;
                    try {
                        const response = await fetch(`${API_URL}/public/upload/${job.jobId}/status`, {
                            headers: token ? {Authorization: `Bearer ${token}`} : {},
                            cache: "no-store",
                        });
                        if (!response.ok) return job;
                        const data = await response.json();
                        const message = String(data.message || "");
                        const isComplete = data.status === "completed"
                            || /upload\s+complete/i.test(message)
                            || /complete/i.test(message) && Number(data.total) > 0 && Number(data.transfer) >= Number(data.total);
                        const isError = data.status === "error" || /upload\s+failed/i.test(message);
                        const transfer = Number.isFinite(Number(data.transfer)) ? Number(data.transfer) : (job.transfer || 0);
                        const total = Number.isFinite(Number(data.total)) ? Number(data.total) : (job.total || 0);
                        return {
                            ...job,
                            transfer,
                            total,
                            progress: isComplete ? 100 : total > 0 ? Math.min(99, transfer / total * 100) : (job.progress || 0),
                            status: isComplete ? "completed" : isError ? "error" : "uploading",
                            message: isError ? (data.error || message || "Upload failed") : (message || job.message || "Uploading"),
                        };
                    } catch {
                        return job;
                    }
                }));

                if (cancelled) return;
                const completedIds = new Set(updatedJobs.filter(job => job?.status === "completed").map(job => job.jobId));
                const remainingJobs = updatedJobs.filter(job => job?.status !== "completed" && job?.status !== "cancelled");

                // Write the filtered list first, then update React state. This avoids
                // completed items reappearing from stale localStorage on the next poll.
                localStorage.setItem(jobsKey, JSON.stringify(remainingJobs));
                setUploadJobs(remainingJobs);
                if (completedIds.size > 0) {
                    // The completed jobs have already been removed from localStorage.
                    // Reload the dashboard once so the finished upload appears in the
                    // current directory and the upload tray no longer lists it.
                    window.location.reload();
                }
            } finally {
                polling = false;
            }
        };

        void refreshUploadJobs();
        const intervalId = window.setInterval(refreshUploadJobs, 1200);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [fetchFiles]);

    const dismissUploadJob = (jobId) => {
        setUploadJobs(current => {
            const next = current.filter(job => job.jobId !== jobId);
            localStorage.setItem("storelimitless_upload_jobs", JSON.stringify(next));
            return next;
        });
    };

    const cancelUploadJob = (jobId) => {
        const transfer = window.__storeLimitlessUploadTransfers?.get(jobId);
        if (transfer) {
            transfer.cancelToken.cancelled = true;
            for (const xhr of transfer.xhrs || []) xhr.abort();
            window.__storeLimitlessUploadTransfers.delete(jobId);
        }
        // Remove it immediately from the tray. The browser transfer is aborted;
        // no server-side cancellation endpoint is required for chunked file uploads.
        dismissUploadJob(jobId);
    };

    // Global recursive search is performed by the backend so files inside
    // nested folders are returned even when they are not in the current view.
    useEffect(() => {
        const query = searchQuery.trim();
        if (!query) {
            setSearchResults([]);
            setSearchError("");
            setSearchLoading(false);
            return;
        }

        const token = getToken();
        if (!token) {
            navigate("/");
            return;
        }

        let cancelled = false;
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setSearchLoading(true);
            setSearchError("");

            try {
                const response = await fetch(`${API_URL}/auth/search?query=${encodeURIComponent(query)}${activeTab === "trash" ? "&trash=true" : ""}`, {
                    headers: {Authorization: `Bearer ${token}`}, signal: controller.signal,
                },);

                if (response.status === 401) {
                    localStorage.removeItem("token");
                    navigate("/");
                    return;
                }

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.detail || "Failed to search files.");
                }

                // The search API should return each file with its containing
                // directory path. directory_id is an ID, not a display location.
                const resultList = Array.isArray(data) ? (Array.isArray(data[1]) ? data[1] : data) : (data.results ?? data.files ?? []);

                const normalized = (Array.isArray(resultList) ? resultList : [])
                    .filter(file => file && file.name && file.name !== ".__folder__")
                    .map(file => ({
                        ...file,
                        directory: file.directory_path ?? file.directory ?? "",
                        is_deleted: Boolean(file.is_deleted ?? (activeTab === "trash")),
                    }));

                if (!cancelled) setSearchResults(normalized);
            } catch (error) {
                if (error.name !== "AbortError" && !cancelled) {
                    console.error("Global file search failed:", error);
                    setSearchError(error.message || "Failed to search files.");
                    setSearchResults([]);
                }
            } finally {
                if (!cancelled) setSearchLoading(false);
            }
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [searchQuery, activeTab, navigate]);

    useEffect(() => {
        if (!sidebarOpen) return;
        const onKeyDown = (event) => {
            if (event.key === "Escape") setSidebarOpen(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [sidebarOpen]);

    /* ----------------------------- download ------------------------------ */

    const downloadFile = async (fileId) => {
        const token = getToken();
        if (!token) {
            navigate("/");
            return;
        }

        try {
            const {public_token} = await (await fetch(`${API_URL}/auth/file/${fileId}/public-link`, {
                method: "POST", headers: {Authorization: `Bearer ${token}`},
            })).json();
            const downloadUrl = `${API_URL}/public/download/${public_token}`;

            const anchor = document.createElement("a");
            anchor.href = downloadUrl;
            anchor.setAttribute("download", "");
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        } catch (error) {
            console.error("Download failed:", error);
            alert(error.message || "Failed to download file.");
        }
    };

    /* ------------------------------ delete/restore ----------------------- */

    const deleteFile = async (fileId, filename, permanent = false) => {
        const token = getToken();
        if (!token) {
            navigate("/");
            return;
        }

        const confirmMsg = permanent ? `Permanently delete "${filename}"? This action cannot be undone.` : `Move "${filename}" to Trash?`;

        if (!window.confirm(confirmMsg)) return;

        setDeletingId(fileId);

        try {
            const endpoint = permanent ? `${API_URL}/auth/trash/file/${fileId}` : `${API_URL}/auth/file/${fileId}`;

            const response = await fetch(endpoint, {
                method: "DELETE", headers: {Authorization: `Bearer ${token}`},
            });

            if (!response.ok) {
                let message = "Failed to delete file.";
                try {
                    const data = await response.json();
                    message = data.detail || message;
                } catch {
                }
                throw new Error(message);
            }

            await fetchFiles();
        } catch (error) {
            console.error("Delete failed:", error);
            alert(error.message || "Failed to delete file.");
        } finally {
            setDeletingId(null);
        }
    };

    const restoreItem = async (itemId) => {
        const token = getToken();
        if (!token) {
            navigate("/");
            return;
        }

        try {
            const response = await fetch(`${API_URL}/auth/trash/file/${itemId}/restore`, {
                method: "POST", headers: {Authorization: `Bearer ${token}`},
            });

            if (!response.ok) {
                let message = "Failed to restore item.";
                try {
                    const data = await response.json();
                    message = data.detail || message;
                } catch {
                }
                throw new Error(message);
            }

            await fetchFiles();
        } catch (error) {
            console.error("Restore failed:", error);
            alert(error.message || "Failed to restore item.");
        }
    };


    const restoreFolder = async (folderId) => {
        const token = getToken();
        if (!token) {
            navigate("/");
            return;
        }

        try {
            const response = await fetch(`${API_URL}/auth/trash/directory/${folderId}/restore`, {
                method: "POST", headers: {Authorization: `Bearer ${token}`},
            });

            if (!response.ok) {
                let message = "Failed to restore folder.";
                try {
                    const data = await response.json();
                    message = data.detail || message;
                } catch {
                }
                throw new Error(message);
            }

            await fetchFiles();
        } catch (error) {
            console.error("Folder restore failed:", error);
            alert(error.message || "Failed to restore folder.");
        }
    };


    /* ------------------------------ folders -------------------------------- */

    const createFolder = async (cleanName) => {
        const token = getToken();
        if (!token) {
            navigate("/");
            return;
        }

        const directory = currentFolder || "/home";
        const response = await fetch(`${API_URL}/auth/create-folder?directory=${encodeURIComponent(directory)}&name=${encodeURIComponent(cleanName)}`, {
            method: "POST", headers: {Authorization: `Bearer ${token}`},
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to create folder.");

        await fetchFiles();
        setShowFolderModal(false);
    };


    const deleteFolder = async (folderId, folderPath, permanent = false) => {
        const token = getToken();
        if (!token) {
            navigate("/");
            return;
        }

        const folderName = folderPath.split("/").pop();
        const confirmMsg = permanent ? `Permanently delete folder "${folderName}"?` : `Move folder "${folderName}" to Trash?`;

        if (!window.confirm(confirmMsg)) return;

        setDeletingId(`folder-${folderId}`);

        try {
            const endpoint = permanent ? `${API_URL}/auth/trash/directory/${folderId}` : `${API_URL}/auth/directory/${folderId}`;

            const response = await fetch(endpoint, {
                method: "DELETE", headers: {Authorization: `Bearer ${token}`},
            });

            if (!response.ok) {
                let data = {};
                try {
                    data = await response.json();
                } catch {
                }
                throw new Error(data.detail || "Failed to delete folder.");
            }

            await fetchFiles();
        } catch (error) {
            console.error("Folder deletion failed:", error);
            alert(error.message || "Failed to delete folder.");
        } finally {
            setDeletingId(null);
        }
    };


    const handleLogout = () => {
        localStorage.removeItem("token");
        navigate("/");
    };

    const openFolder = (folderPath) => {
        setCurrentFolder(folderPath);
        setSearchQuery("");
    };

    const goBack = () => {
        if (!currentFolder) return;
        const parts = currentFolder.split("/");
        parts.pop();
        setCurrentFolder(parts.join("/"));
    };

    const handleTabChange = (tabId) => {
        setActiveTab(tabId);
        setCurrentFolder("");
        setSearchQuery("");
    };

    /* ------------------------------ derived data ---------------------------- */

    const isTrash = activeTab === "trash";
    // Treat all supported root representations as Home, so Back is hidden there.
    const isHomeFolder = !currentFolder || currentFolder === "/home" || currentFolder === "home";

    const visibleFolders = useMemo(() => {
        return folders.filter(({path, is_deleted}) => {
            if (isTrash) return Boolean(is_deleted);
            if (is_deleted) return false;
            if (!currentFolder) {
                if (!path.startsWith("/home/")) return false;
                const remainder = path.slice(6);
                return remainder && !remainder.includes("/");
            }
            if (!path.startsWith(`${currentFolder}/`)) return false;
            const remainder = path.slice(currentFolder.length + 1);
            return remainder && !remainder.includes("/");
        });
    }, [folders, currentFolder, isTrash]);

    const visibleFiles = useMemo(() => {
        return files.filter((file) => {
            if (file.name === ".__folder__") return false;
            if (isTrash) return Boolean(file.is_deleted);
            return !file.is_deleted && (file.directory || "") === currentFolder;
        });
    }, [files, currentFolder, isTrash]);

    const isSearching = Boolean(searchQuery.trim());

    const filteredFiles = useMemo(() => {
        if (isSearching) return searchResults;
        return visibleFiles;
    }, [visibleFiles, searchResults, isSearching]);

    const filteredFolders = useMemo(() => {
        if (isSearching) return [];
        return visibleFolders;
    }, [visibleFolders, isSearching]);

    const breadcrumbSegments = useMemo(() => {
        // Keep the internal folder paths for navigation, but show `home` as the root label.
        const parts = (currentFolder || "").split("/").filter(Boolean);
        const segments = [{label: "home", path: "", isHome: true}];
        let accumulatedPath = "";

        for (const part of parts) {
            accumulatedPath += `/${part}`;
            if (part.toLowerCase() === "home" && segments.length === 1) continue;
            segments.push({label: part, path: accumulatedPath, isHome: false});
        }

        return segments;
    }, [currentFolder]);

    const isEmpty = filteredFiles.length === 0 && filteredFolders.length === 0;
    const isSearchBusy = isSearching && searchLoading;

    return (<div
        className="flex h-screen overflow-hidden bg-[#1c1c1c] text-[#fafafa]"
        style={{fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"}}
    >
        {/* Desktop sidebar */}
        <div className="fixed left-0 top-0 hidden h-screen md:flex">
            <Sidebar
                activeTab={activeTab}
                onTabSelect={handleTabChange}
                onUpload={() => navigate(`/upload?directory=${encodeURIComponent(currentFolder || "/home")}`)}
                onCreateFolder={() => setShowFolderModal(true)}
                onLogout={handleLogout}
            />
        </div>

        {/* Mobile sidebar */}
        {sidebarOpen && (<div className="fixed inset-0 z-50 flex md:hidden">
            <div className="flex-shrink-0">
                <Sidebar
                    activeTab={activeTab}
                    onTabSelect={(tab) => {
                        handleTabChange(tab);
                        setSidebarOpen(false);
                    }}
                    onUpload={() => navigate(`/upload?directory=${encodeURIComponent(currentFolder || "/home")}`)}
                    onCreateFolder={() => {
                        setShowFolderModal(true);
                        setSidebarOpen(false);
                    }}
                    onLogout={handleLogout}
                />
            </div>
            <div
                className="flex-1 bg-black/60"
                onClick={() => setSidebarOpen(false)}
                aria-hidden="true"
            />
        </div>)}

        <div className="flex h-screen flex-1 flex-col md:ml-60">
            {/* Header */}
            <header
                className="fixed top-0 right-0 z-40 flex h-14 w-full items-center justify-between border-b border-[#2e2e2e] bg-[#171717] px-6 md:w-[calc(100%-240px)]">
                <div className="flex w-full max-w-md items-center gap-4">
                    <button
                        type="button"
                        className="text-[#898989] transition-colors hover:text-[#fafafa] md:hidden"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Open menu"
                    >
                            <span className="material-symbols-outlined" aria-hidden="true">
                                menu
                            </span>
                    </button>

                    <div className="relative hidden w-full sm:block">
                            <span
                                className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#707070]"
                                style={{fontSize: 18}}
                                aria-hidden="true"
                            >
                                search
                            </span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder={isTrash ? "Search trash…" : "Search files…"}
                            aria-label="Search files"
                            className="h-8 w-full rounded-md border border-[#363636] bg-white/[0.026] pl-9 pr-3 text-sm text-[#fafafa] outline-none transition-colors placeholder:text-[#707070] focus:border-[#707070] focus:ring-2 focus:ring-[#4d4d4d]/50"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#363636] bg-[#242424]">
                            <span className="material-symbols-outlined text-[18px] text-[#898989]" aria-hidden="true">
                                person
                            </span>
                    </div>
                </div>
            </header>

            {/* Main View Area */}
            <main className="flex-1 overflow-y-auto bg-[#1c1c1c] px-4 pb-8 pt-20 md:px-8">
                <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                    <div>
                        {!isTrash && (
                            <nav
                                aria-label="Folder path"
                                className="mt-2 flex flex-wrap items-center gap-1 text-sm text-[#898989]"
                            >
                                {breadcrumbSegments.map(({label, path, isHome}, i) => (
                                    <span key={`${path}-${i}`} className="flex items-center gap-0.5">
                                        {i > 0 && <span className="text-[#4d4d4d]">/</span>}
                                        <button
                                            type="button"
                                            onClick={() => openFolder(isHome ? "" : path)}
                                            aria-current={i === breadcrumbSegments.length - 1 ? "location" : undefined}
                                            className={`transition-colors hover:text-[#fafafa] ${i === breadcrumbSegments.length - 1 ? "text-[#fafafa]" : ""}`}
                                        >
                                            {label}
                                        </button>
                                    </span>
                                ))}
                            </nav>
                        )}
                    </div>

                </div>

                {!isTrash && !isHomeFolder && (<button
                    type="button"
                    onClick={goBack}
                    className="mb-4 flex items-center gap-1.5 text-sm text-[#898989] transition-colors hover:text-[#fafafa]"
                >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span>
                    Back
                </button>)}

                {pageError && (<div
                    className="mb-6 flex items-center justify-between rounded-md border border-[#e5484d]/30 bg-[#e5484d]/10 px-4 py-3 text-sm text-[#ff6369]">
                    <span>{pageError}</span>
                    <button type="button" onClick={fetchFiles} className="text-xs underline underline-offset-4">
                        Retry
                    </button>
                </div>)}

                {searchError && isSearching && (
                    <div className="mb-6 rounded-md border border-[#e5484d]/30 bg-[#e5484d]/10 px-4 py-3 text-sm text-[#ff6369]">
                        {searchError}
                    </div>)}

                {(loadingFiles || isSearchBusy) ? (<div className="flex flex-col items-center justify-center py-24 text-sm text-[#898989]">
                            <span className="material-symbols-outlined mb-3 animate-spin text-[32px]" aria-hidden="true">
                                progress_activity
                            </span>
                    {isSearchBusy ? "Searching all folders…" : "Loading files…"}
                </div>) : (<>
                    {isSearching && !searchError && (<p className="mb-4 text-xs text-[#707070]">
                        Search results across all folders
                    </p>)}
                    {filteredFolders.length > 0 && (<div className="mb-8">
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-[#b4b4b4]">
                                        <span className="material-symbols-outlined text-[18px] text-[#898989]" aria-hidden="true">
                                            folder
                                        </span>
                            Folders
                        </h3>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                            {filteredFolders.map(({path, id}) => {
                                const displayName = path.split("/").pop();
                                return (<div
                                    key={path}
                                    className="group relative rounded-lg border border-[#2e2e2e] bg-[#1f1f1f] p-4 text-left transition-colors hover:border-[#4d4d4d] hover:bg-[#232323]"
                                >
                                    <button
                                        type="button"
                                        onClick={() => !isTrash && openFolder(path)}
                                        className={`block w-full text-left ${isTrash ? "cursor-default" : ""}`}
                                    >
                                                        <span
                                                            className="material-symbols-outlined text-[36px] text-[#898989] transition-colors group-hover:text-[#3ecf8e]"
                                                            style={{fontVariationSettings: "'FILL' 1"}}
                                                            aria-hidden="true"
                                                        >
                                                            folder
                                                        </span>
                                        <p className="mt-3 truncate text-sm text-[#fafafa]">
                                            {displayName}
                                        </p>
                                    </button>
                                    <div
                                        className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                        {isTrash ? (<>
                                            <button
                                                type="button"
                                                onClick={() => restoreFolder(id)}
                                                title="Restore Folder"
                                                className={iconBtn}
                                            >
                                                <span className="material-symbols-outlined text-[16px]">restore</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteFolder(id, path, true)}
                                                title="Delete Permanently"
                                                className={iconBtnDanger}
                                            >
                                                <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                                            </button>
                                        </>) : (<button
                                            type="button"
                                            onClick={() => deleteFolder(id, path, false)}
                                            disabled={deletingId === `folder-${id}`}
                                            title="Move to Trash"
                                            className={iconBtnDanger}
                                        >
                                                                <span className="material-symbols-outlined text-[16px]">
                                                                    {deletingId === `folder-${id}` ? "progress_activity" : "delete"}
                                                                </span>
                                        </button>)}
                                    </div>
                                </div>);
                            })}
                        </div>
                    </div>)}

                    {isEmpty ? (<div className="flex flex-col items-center justify-center py-24 text-[#898989]">
                                    <span className="material-symbols-outlined mb-4 text-[48px] text-[#4d4d4d]" aria-hidden="true">
                                        {isTrash ? "auto_delete" : "cloud_off"}
                                    </span>
                        <p className="text-sm font-medium text-[#fafafa]">
                            {isTrash ? "Trash is empty" : searchQuery ? "No matching files" : "No files yet"}
                        </p>
                    </div>) : (filteredFiles.length > 0 && (<div>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-[#b4b4b4]">
                                            <span className="material-symbols-outlined text-[18px] text-[#898989]" aria-hidden="true">
                                                description
                                            </span>
                            Files
                        </h3>

                        <div className="overflow-hidden rounded-lg border border-[#2e2e2e] bg-[#1c1c1c]">
                            <div className="grid grid-cols-12 gap-2 border-b border-[#2e2e2e] bg-[#1f1f1f] px-4 py-2.5">
                                <div className="col-span-5 text-xs font-medium text-[#898989] sm:col-span-4">
                                    Name
                                </div>
                                <div className="col-span-2 hidden text-xs font-medium text-[#898989] sm:block">
                                    Size
                                </div>
                                <div className="col-span-2 hidden text-xs font-medium text-[#898989] sm:block">
                                    Location
                                </div>
                                <div className="col-span-4 text-xs font-medium text-[#898989] sm:col-span-2">
                                    Data Center
                                </div>
                                <div className="col-span-3 text-right text-xs font-medium text-[#898989] sm:col-span-2">
                                    Actions
                                </div>
                            </div>

                            {filteredFiles.map((file, index) => {
                                const {icon, color} = getFileIcon(file.name);
                                const isLast = index === filteredFiles.length - 1;
                                const isDeleting = deletingId === file.id;

                                return (<div
                                    key={file.id}
                                    className={`group grid grid-cols-12 items-center gap-2 px-4 py-2.5 transition-colors hover:bg-[#232323] ${isLast ? "" : "border-b border-[#2e2e2e]"}`}
                                >
                                    {/* File Name & Mobile Metadata */}
                                    <div className="col-span-5 flex min-w-0 items-center gap-3 sm:col-span-4">
                                                            <span className={`material-symbols-outlined text-[18px] ${color}`} aria-hidden="true">
                                                                {icon}
                                                            </span>
                                        <div className="min-w-0">
                                            {isTrash ? (<p className="truncate text-sm text-[#fafafa]">{file.name}</p>) : (<button
                                                type="button"
                                                onClick={() => handleFileClick(file)}
                                                className="block max-w-full truncate text-left text-sm text-[#fafafa] transition-colors hover:underline hover:underline-offset-4"
                                            >
                                                {file.name}
                                            </button>)}
                                            <p className="mt-0.5 text-xs text-[#707070] sm:hidden">
                                                {formatFileSize(file.size)} • {formatDate(file.modified_at)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Desktop File Size */}
                                    <div className="col-span-2 hidden font-mono text-xs text-[#898989] sm:block">
                                        {formatFileSize(file.size)}
                                    </div>

                                    {/* Location */}
                                    <div className="col-span-2 hidden truncate text-sm text-[#898989] sm:block">
                                        {file.directory || "Root"}
                                    </div>

                                    {/* Data Center */}
                                    <div className="col-span-4 sm:col-span-2">
                                                            <span
                                                                className="inline-block max-w-full truncate rounded border border-[#363636] bg-[#242424] px-2 py-0.5 text-xs text-[#b4b4b4]">
                                                                {file.data_center || "—"}
                                                            </span>
                                    </div>

                                    {/* Actions */}
                                    <div
                                        className="col-span-3 flex justify-end gap-0.5 opacity-100 transition-opacity sm:col-span-2 sm:opacity-0 sm:group-hover:opacity-100">
                                        {isTrash ? (<>
                                            <button
                                                type="button"
                                                onClick={() => restoreItem(file.id)}
                                                title="Restore File"
                                                className={iconBtn}
                                            >
                                                <span className="material-symbols-outlined text-[18px]">restore</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteFile(file.id, file.name, true)}
                                                title="Delete Permanently"
                                                className={iconBtnDanger}
                                            >
                                                <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                                            </button>
                                        </>) : (<>
                                            <button
                                                type="button"
                                                onClick={() => downloadFile(file.id)}
                                                title="Download"
                                                className={iconBtn}
                                            >
                                                                    <span className="material-symbols-outlined text-[18px]">
                                                                        download
                                                                    </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteFile(file.id, file.name, false)}
                                                disabled={isDeleting}
                                                title="Move to Trash"
                                                className={iconBtnDanger}
                                            >
                                                                    <span className="material-symbols-outlined text-[18px]">
                                                                        {isDeleting ? "progress_activity" : "delete"}
                                                                    </span>
                                            </button>
                                        </>)}
                                    </div>
                                </div>);
                            })}
                        </div>
                    </div>))}
                </>)}
            </main>
        </div>

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
                <button type="button" onClick={() => setUploadJobs(current => {
                    const next = current.filter(job => job.status === "uploading");
                    localStorage.setItem("storelimitless_upload_jobs", JSON.stringify(next));
                    return next;
                })} className="text-xs text-[#898989] transition-colors hover:text-[#fafafa]" title="Hide completed uploads">Clear completed
                </button>
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
                                    <div className={`h-full rounded-full transition-all duration-300 ${isComplete ? "bg-[#3ecf8e]" : "bg-[#3ecf8e]"}`}
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

        {showFolderModal && (<CreateFolderModal
            targetPath={currentFolder}
            onClose={() => setShowFolderModal(false)}
            onCreate={createFolder}
        />)}
    </div>);
}
