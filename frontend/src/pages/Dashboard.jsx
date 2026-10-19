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

function Sidebar({activeTab, onTabSelect, onUpload, onLogout}) {
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
            <button
                type="button"
                onClick={onUpload}
                className={`${btnPrimary} h-9 w-full justify-center text-sm`}
            >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                        add
                    </span>
                Upload Files
            </button>

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
    const [loadingFiles, setLoadingFiles] = useState(true);
    const [pageError, setPageError] = useState("");
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [openMenuFileId, setOpenMenuFileId] = useState(null);
    const [clipboard, setClipboard] = useState(null);
    const [menuPosition, setMenuPosition] = useState(null);

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
        navigate(`/view/${file.id}?${params}`);
    };

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

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

    const filteredFiles = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return visibleFiles;
        return visibleFiles.filter((file) => file.name?.toLowerCase().includes(query));
    }, [visibleFiles, searchQuery]);

    const filteredFolders = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return visibleFolders;
        return visibleFolders.filter(({path}) => path.split("/").pop()?.toLowerCase().includes(query));
    }, [visibleFolders, searchQuery]);

    const breadcrumbSegments = useMemo(() => {
        if (!currentFolder) return [];
        const parts = currentFolder.split("/");
        return parts.map((label, i) => ({label, path: parts.slice(0, i + 1).join("/")}));
    }, [currentFolder]);

    const isEmpty = filteredFiles.length === 0 && filteredFolders.length === 0;

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
                        <h2 className="text-xl font-medium tracking-tight text-[#fafafa]">
                            {isTrash ? "Trash Bin" : "Your Files"}
                        </h2>
                        {!isTrash && currentFolder && (<div className="mt-2 flex items-center gap-1 text-sm text-[#898989]">
                            <button onClick={() => setCurrentFolder("")} className="transition-colors hover:text-[#fafafa]">
                                All Files
                            </button>
                            {breadcrumbSegments.map(({label, path}, i) => (<span key={path} className="flex items-center gap-1">
                                            <span className="text-[#4d4d4d]">/</span>
                                {i === breadcrumbSegments.length - 1 ? (<span className="text-[#fafafa]">{label}</span>) : (
                                    <button onClick={() => openFolder(path)} className="transition-colors hover:text-[#fafafa]">
                                        {label}
                                    </button>)}
                                        </span>))}
                        </div>)}
                    </div>

                    {!isTrash && (<div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setShowFolderModal(true)}
                            className={btnSecondary}
                        >
                                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                                        create_new_folder
                                    </span>
                            New Folder
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate(`/upload?directory=${encodeURIComponent(currentFolder || "/home")}`)}
                            className={btnPrimary}
                        >
                                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                                        cloud_upload
                                    </span>
                            Upload
                        </button>
                    </div>)}
                </div>

                {!isTrash && currentFolder && (<button
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

                {loadingFiles ? (<div className="flex flex-col items-center justify-center py-24 text-sm text-[#898989]">
                            <span className="material-symbols-outlined mb-3 animate-spin text-[32px]" aria-hidden="true">
                                progress_activity
                            </span>
                    Loading files…
                </div>) : (<>
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

        {showFolderModal && (<CreateFolderModal
            targetPath={currentFolder}
            onClose={() => setShowFolderModal(false)}
            onCreate={createFolder}
        />)}
    </div>);
}