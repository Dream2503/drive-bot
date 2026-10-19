import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import {createPortal} from "react-dom";

const API_URL = window.STORELIMITLESS_CONFIG?.API_URL ?? import.meta.env.VITE_API_URL
const DASHBOARD_SELECTION_STORAGE_KEY = "storelimitless_dashboard_selection_restore";
const DASHBOARD_SELECTIONS_BY_VIEW_KEY = "storelimitless_dashboard_selections_by_view";

function makeSelectionViewKey(pathname, activeTab, searchQuery) {
    return JSON.stringify([pathname, activeTab, searchQuery]);
}

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

function Sidebar({activeTab, onTabSelect, onUpload, onCreateFolder, onLogout, storageUsed}) {
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

            <div className="rounded-lg border border-[#343434] bg-[#1d1d1d] px-3 py-3">
                <div className="flex items-center gap-2 text-[#a0a0a0]">
                    <span className="material-symbols-outlined text-[17px] text-[#3ecf8e]" aria-hidden="true">
                        database
                    </span>
                    <span className="text-xs">Storage used</span>
                </div>
                <p className="mt-2 text-lg font-medium tracking-tight text-[#fafafa]">
                    {storageUsed === null ? "Calculating…" : formatFileSize(storageUsed)}
                </p>
                <p className="mt-0.5 text-[10px] text-[#707070]">Across your files and trash</p>
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

function RenameItemModal({item, onClose, onRename}) {
    const [name, setName] = useState(item.name || "");
    const [error, setError] = useState("");
    const [renaming, setRenaming] = useState(false);
    const inputRef = useRef(null);
    const cancelButtonRef = useRef(null);
    const renameButtonRef = useRef(null);

    const handleDialogKeyDown = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!renaming) onClose();
            return;
        }

        const target = event.target;
        const isActionButton = target === cancelButtonRef.current || target === renameButtonRef.current;

        // From the name field, Down enters the action buttons. Up returns to
        // editing, while Left/Right switches between Cancel and Rename.
        if (event.key === "ArrowDown" && target === inputRef.current) {
            event.preventDefault();
            event.stopPropagation();
            cancelButtonRef.current?.focus();
            return;
        }

        if (isActionButton && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            (target === cancelButtonRef.current ? renameButtonRef.current : cancelButtonRef.current)?.focus();
            return;
        }

        if (isActionButton && event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            const input = inputRef.current;
            input?.focus();
            if (input) {
                const end = input.value.length;
                input.setSelectionRange(end, end);
            }
            return;
        }

        // Keep Enter on an action button local to the dialog so the dashboard's
        // global shortcuts cannot also react to it. Native button activation remains intact.
        if (isActionButton && event.key === "Enter") event.stopPropagation();
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const cleanName = name.trim();
        if (!cleanName) {
            setError("Name cannot be empty.");
            return;
        }
        if (cleanName === "." || cleanName === ".." || cleanName.includes("/") || cleanName.includes("\\")) {
            setError("Name cannot contain path separators.");
            return;
        }
        if (cleanName.length > 255) {
            setError("Name must be 255 characters or fewer.");
            return;
        }

        setRenaming(true);
        setError("");
        try {
            await onRename(item, cleanName);
        } catch (renameError) {
            setError(renameError instanceof Error ? renameError.message : "Failed to rename item.");
        } finally {
            setRenaming(false);
        }
    };

    return (<div
        className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
        onClick={() => !renaming && onClose()}
    >
        <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-item-title"
            className="w-full max-w-md rounded-lg border border-[#2e2e2e] bg-[#1c1c1c] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleDialogKeyDown}
        >
            <div className="mb-5 flex items-start gap-3">
                <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#3ecf8e]/20 bg-[#3ecf8e]/10 text-[#3ecf8e]">
                        <span className="material-symbols-outlined text-[21px]" aria-hidden="true">
                            drive_file_rename_outline
                        </span>
                </div>
                <div className="min-w-0 flex-1">
                    <h2 id="rename-item-title" className="text-base font-medium text-[#fafafa]">
                        Rename {item.type === "folder" ? "folder" : "file"}
                    </h2>
                    <p className="mt-1.5 text-sm leading-5 text-[#898989]">
                        Enter a new name for “{item.name}”.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(event) => {
                        setName(event.target.value);
                        setError("");
                    }}
                    autoFocus
                    maxLength={255}
                    disabled={renaming}
                    className={inputClass}
                    aria-label="New name"
                    placeholder="Enter a name"
                />
                {error && <p className="mt-2 text-sm text-[#ff6369]">{error}</p>}
                <div className="mt-6 flex justify-end gap-2">
                    <button
                        ref={cancelButtonRef}
                        type="button"
                        onClick={onClose}
                        disabled={renaming}
                        className={`${btnSecondary} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3ecf8e]/70`}
                    >
                        Cancel
                    </button>
                    <button
                        ref={renameButtonRef}
                        type="submit"
                        disabled={renaming || !name.trim()}
                        className={`${btnPrimary} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3ecf8e]/70`}
                    >
                        {renaming ? "Renaming…" : "Rename"}
                    </button>
                </div>
            </form>
        </section>
    </div>);
}

function DashboardContextMenu({menu, onClose, onAction}) {
    useEffect(() => {
        const closeOnOutsideClick = () => onClose();
        const closeOnScroll = () => onClose();
        window.addEventListener("click", closeOnOutsideClick);
        window.addEventListener("scroll", closeOnScroll, true);
        return () => {
            window.removeEventListener("click", closeOnOutsideClick);
            window.removeEventListener("scroll", closeOnScroll, true);
        };
    }, [onClose]);

    let items;
    if (menu.kind === "background") {
        items = [{id: "upload", label: "Upload files", icon: "cloud_upload"}];
    } else if (menu.item?.is_deleted) {
        items = [{id: "restore", label: "Restore", icon: "restore"}];
    } else if (menu.item?.type === "folder") {
        items = [{id: "rename", label: "Rename", icon: "drive_file_rename_outline"}];
    } else {
        items = [{id: "rename", label: "Rename", icon: "drive_file_rename_outline"}, {id: "download", label: "Download", icon: "download"},];
    }

    return createPortal(<div
        role="menu"
        data-selection-ignore
        className="fixed z-[220] w-48 overflow-hidden rounded-lg border border-[#363636] bg-[#1f1f1f] py-1 shadow-2xl"
        style={{top: menu.y, left: menu.x}}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
    >
        {items.map((item) => <button
            key={item.id}
            type="button"
            role="menuitem"
            onClick={() => onAction(item.id)}
            className="flex h-9 w-full items-center gap-2.5 px-3 text-left text-sm text-[#fafafa] transition-colors hover:bg-[#2a2a2a] focus:bg-[#2a2a2a] focus:outline-none"
        >
            <span className="material-symbols-outlined text-[18px] text-[#a0a0a0]" aria-hidden="true">{item.icon}</span>
            {item.label}
        </button>)}
    </div>, document.body);
}

/* -------------------------------------------------------------------- */
/* Dashboard Page                                                      */

/* -------------------------------------------------------------------- */

function folderPathToRoute(folderPath) {
    const segments = (folderPath || "").split("/").filter(Boolean);
    const relativeSegments = segments[0] === "home" ? segments.slice(1) : segments;
    return `/home${relativeSegments.length ? `/${relativeSegments.map(encodeURIComponent).join("/")}` : ""}`;
}

function decodePathSegment(segment) {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

export default function DashboardPage() {
    const navigate = useNavigate();
    const location = useLocation();

    const [activeTab, setActiveTab] = useState("files");
    const [files, setFiles] = useState([]);
    const [folders, setFolders] = useState([]);
    const [storageUsed, setStorageUsed] = useState(null);
    // The URL is the source of truth for the current folder. This keeps links
    // shareable and makes browser back/forward restore the previous folder.
    const currentFolder = useMemo(() => {
        const segments = location.pathname.split("/").filter(Boolean);
        if (segments[0] !== "home") return "";
        const folderSegments = segments.slice(1).map(decodePathSegment);
        return folderSegments.length ? `/home/${folderSegments.join("/")}` : "";
    }, [location.pathname]);
    // Fetches triggered by a completed move may outlive the route where the
    // drag started. Read the latest folder at request time, not from an old closure.
    const currentFolderRef = useRef(currentFolder);
    currentFolderRef.current = currentFolder;
    const fileFetchSequenceRef = useRef(0);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState("");
    const [loadingFiles, setLoadingFiles] = useState(true);
    const [loadedFolder, setLoadedFolder] = useState(null);
    const [pageError, setPageError] = useState("");
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [openMenuFileId, setOpenMenuFileId] = useState(null);
    const [clipboard, setClipboard] = useState(null);
    const [menuPosition, setMenuPosition] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [selectedItems, setSelectedItems] = useState(() => new Set());
    const [marquee, setMarquee] = useState(null);
    const [dropTargetKey, setDropTargetKey] = useState(null);
    const [draggingKeys, setDraggingKeys] = useState(() => new Set());
    const [movingItems, setMovingItems] = useState(false);
    const moveDragRef = useRef(null);
    const movePointerRef = useRef(null);
    const moveDndCallbacksRef = useRef(null);
    const dragPreviewNodeRef = useRef(null);
    const [confirmAction, setConfirmAction] = useState(null);
    const [confirmFocus, setConfirmFocus] = useState("cancel");
    const [bulkActionLoading, setBulkActionLoading] = useState(false);
    const [bulkActionError, setBulkActionError] = useState("");
    const [renameTarget, setRenameTarget] = useState(null);
    const renameSelectionSnapshotRef = useRef(null);
    const cancelConfirmButtonRef = useRef(null);
    const destructiveConfirmButtonRef = useRef(null);
    const selectionSurfaceRef = useRef(null);
    const dragStateRef = useRef(null);
    const suppressClickRef = useRef(false);
    const selectionAnchorRef = useRef(null);
    const selectionRestoreRef = useRef({checked: false, snapshot: null});
    const currentSelectionViewKey = makeSelectionViewKey(location.pathname, activeTab, searchQuery);
    const selectionSnapshotsByViewRef = useRef(null);
    if (selectionSnapshotsByViewRef.current === null) {
        try {
            const stored = JSON.parse(sessionStorage.getItem(DASHBOARD_SELECTIONS_BY_VIEW_KEY) || "{}");
            selectionSnapshotsByViewRef.current = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
        } catch {
            selectionSnapshotsByViewRef.current = {};
        }
    }
    const lastSelectionSnapshotViewKeyRef = useRef(currentSelectionViewKey);
    const selectionSnapshotInitialRenderRef = useRef(true);
    const skipSelectionSnapshotPersistRef = useRef(false);
    const saveCurrentSelectionSnapshot = (keys = Array.from(selectedItems), anchor = selectionAnchorRef.current) => {
        const snapshots = selectionSnapshotsByViewRef.current || (selectionSnapshotsByViewRef.current = {});
        snapshots[currentSelectionViewKey] = {
            pathname: location.pathname, activeTab, searchQuery, keys: Array.from(keys), anchor, savedAt: Date.now(),
        };

        // Keep session storage bounded when users browse many directories.
        const entries = Object.entries(snapshots).sort((a, b) => (b[1]?.savedAt || 0) - (a[1]?.savedAt || 0));
        for (const [key] of entries.slice(80)) delete snapshots[key];
        try {
            sessionStorage.setItem(DASHBOARD_SELECTIONS_BY_VIEW_KEY, JSON.stringify(snapshots));
        } catch (error) {
            console.warn("Could not preserve directory selection:", error);
        }
    };
    if (!selectionRestoreRef.current.checked) {
        selectionRestoreRef.current.checked = true;
        try {
            const rawSnapshot = sessionStorage.getItem(DASHBOARD_SELECTION_STORAGE_KEY);
            if (rawSnapshot) {
                const snapshot = JSON.parse(rawSnapshot);
                if (snapshot?.pathname === location.pathname) {
                    selectionRestoreRef.current.snapshot = snapshot;
                } else {
                    sessionStorage.removeItem(DASHBOARD_SELECTION_STORAGE_KEY);
                }
            }
        } catch {
            sessionStorage.removeItem(DASHBOARD_SELECTION_STORAGE_KEY);
        }
    }
    const [uploadJobs, setUploadJobs] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("storelimitless_upload_jobs") || "[]");
        } catch {
            return [];
        }
    });

    /* -------------------------- fetch metadata ------------------------- */

    const fetchMetadata = useCallback(async () => {
        const token = getToken();
        if (!token) return;

        try {
            const response = await fetch(`${API_URL}/auth/metadata`, {
                headers: {Authorization: `Bearer ${token}`}, cache: "no-store",
            });
            if (!response.ok) return;

            const metadata = await response.json();
            const total = Number(metadata.storage_used_bytes);
            if (Number.isFinite(total) && total >= 0) setStorageUsed(total);
        } catch (error) {
            // Storage metadata must not prevent normal file browsing.
            console.error("Failed to fetch account metadata:", error);
        }
    }, []);

    /* ---------------------------- fetch files --------------------------- */

    const fetchFiles = useCallback(async () => {
        const requestId = ++fileFetchSequenceRef.current;
        const requestedFolder = currentFolderRef.current;
        const token = getToken();
        if (!token) {
            navigate("/");
            return;
        }

        setLoadingFiles(true);
        setPageError("");
        void fetchMetadata();

        try {
            const directory = requestedFolder || "/home";
            const directoryRes = await fetch(`${API_URL}/auth/directory?directory=${encodeURIComponent(directory)}`, {
                headers: {Authorization: `Bearer ${token}`}, cache: "no-store",
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
                headers: {Authorization: `Bearer ${token}`}, cache: "no-store",
            });
            const trashData = trashRes.ok ? await trashRes.json() : [[], []];

            // A newer navigation/refresh has started while this request was in
            // flight. Never allow the older response to overwrite the new folder.
            if (requestId !== fileFetchSequenceRef.current) return;

            const [trashFolders, trashFiles] = trashData;
            const normalizedActive = (Array.isArray(activeFiles) ? activeFiles : []).map((file) => ({
                ...file, directory: requestedFolder, is_deleted: false,
            }));

            const trashDirectoryPaths = new Map((Array.isArray(trashFolders) ? trashFolders : []).map((directory) => [directory.id, directory.path]));
            const normalizedTrash = (Array.isArray(trashFiles) ? trashFiles : []).map((file) => ({
                ...file, directory: trashDirectoryPaths.get(file.directory_id) || file.directory || "", is_deleted: true,
            }));

            setFiles([...normalizedActive, ...normalizedTrash]);
            const normalizedFolders = [...(Array.isArray(activeFolders) ? activeFolders : []).map((folder) => ({
                path: folder.path, id: folder.id, is_deleted: false,
            })), ...(Array.isArray(trashFolders) ? trashFolders : []).map((folder) => ({
                path: folder.path, id: folder.id, is_deleted: true,
            })),];
            setFolders(normalizedFolders);
            setLoadedFolder(requestedFolder);
        } catch (error) {
            if (requestId === fileFetchSequenceRef.current) {
                console.error("Failed to fetch files:", error);
                setPageError(error.message || "Failed to load files.");
            }
        } finally {
            if (requestId === fileFetchSequenceRef.current) setLoadingFiles(false);
        }
    }, [navigate, fetchMetadata]);

    const handleFileClick = (file) => {
        saveCurrentSelectionSnapshot();
        const kind = getFileKind(file.name);
        const params = new URLSearchParams({name: file.name});
        if (kind) params.set("kind", kind);

        // Save the current selection before the dashboard unmounts for the viewer.
        // Backspace, Escape, and browser Back then restore the same selection.
        try {
            sessionStorage.setItem(DASHBOARD_SELECTION_STORAGE_KEY, JSON.stringify({
                pathname: location.pathname, activeTab, searchQuery, keys: Array.from(selectedItems), anchor: selectionAnchorRef.current,
            }));
        } catch (error) {
            console.warn("Could not preserve dashboard selection:", error);
        }

        navigate(`/view/${file.id}?${params.toString()}`);
    };

    useEffect(() => {
        void fetchFiles();
    }, [fetchFiles, currentFolder]);

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
                            headers: token ? {Authorization: `Bearer ${token}`} : {}, cache: "no-store",
                        });
                        if (!response.ok) return job;
                        const data = await response.json();
                        const progressName = typeof data.name === "string" ? data.name.trim() : "";
                        const message = String(data.message || "");
                        const isComplete = data.status === "completed" || /upload\s+complete/i.test(message) || /complete/i.test(message) && Number(data.total) > 0 && Number(data.transfer) >= Number(data.total);
                        const isError = data.status === "error" || /upload\s+failed/i.test(message);
                        const transfer = Number.isFinite(Number(data.transfer)) ? Number(data.transfer) : (job.transfer || 0);
                        const total = Number.isFinite(Number(data.total)) ? Number(data.total) : (job.total || 0);
                        return {
                            ...job, // Adopt the backend's current progress name. For link imports,
                            // this changes the displayed URL to the actual YouTube title
                            // as soon as yt-dlp resolves it.
                            name: progressName || job.name,
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


    const requestSelectionDelete = async (endpoint) => {
        const token = getToken();
        if (!token) {
            navigate("/");
            throw new Error("Your session has expired. Please sign in again.");
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            method: "DELETE", headers: {Authorization: `Bearer ${token}`},
        });

        if (!response.ok) {
            let message = `Request failed (${response.status})`;
            try {
                const data = await response.json();
                message = data.detail || data.message || message;
            } catch {
                // Keep the HTTP status message if the response is not JSON.
            }
            throw new Error(message);
        }
    };

    const executeBulkAction = async () => {
        if (!confirmAction || bulkActionLoading) return;

        setBulkActionLoading(true);
        setBulkActionError("");
        setPageError("");

        const items = confirmAction.items;
        // If a folder and any of its descendants are both selected, handle only
        // the folder. Its backend operation already includes its descendants.
        const roots = items.filter((item) => !items.some((parent) => {
            if (parent.type !== "folder" || parent.key === item.key) return false;
            if (item.type === "folder") return item.path.startsWith(`${parent.path.replace(/\/$/, "")}/`);
            const directory = (item.directory || "").replace(/\/$/, "");
            const parentPath = parent.path.replace(/\/$/, "");
            return directory === parentPath || directory.startsWith(`${parentPath}/`);
        }));

        let succeeded = 0;
        const failures = [];
        const inTrash = activeTab === "trash";

        try {
            for (const item of roots) {
                const kind = item.type === "folder" ? "directory" : "file";
                const ordinaryEndpoint = `/auth/${kind}/${item.id}`;
                const permanentEndpoint = `/auth/trash/${kind}/${item.id}`;

                try {
                    if (confirmAction.mode === "trash") {
                        await requestSelectionDelete(ordinaryEndpoint);
                    } else if (inTrash) {
                        await requestSelectionDelete(permanentEndpoint);
                    } else {
                        // Shift+Delete from active files first moves the item to
                        // Trash, then immediately permanently deletes it.
                        await requestSelectionDelete(ordinaryEndpoint);
                        await requestSelectionDelete(permanentEndpoint);
                    }
                    succeeded += 1;
                } catch (error) {
                    failures.push(`${item.name}: ${error.message || "Operation failed"}`);
                }
            }

            setConfirmAction(null);
            setSelectedItems(new Set());
            selectionAnchorRef.current = null;
            await fetchFiles();

            if (failures.length) {
                const firstFailures = failures.slice(0, 3).join("; ");
                const more = failures.length > 3 ? `; and ${failures.length - 3} more` : "";
                setPageError(`${succeeded} item(s) processed. ${failures.length} failed: ${firstFailures}${more}`);
            }
        } finally {
            setBulkActionLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        navigate("/");
    };

    const openFolder = (folderPath) => {
        // Save the current directory's selection before changing the route. When
        // browser Back/Backspace returns here, restore the same selected items.
        saveCurrentSelectionSnapshot();
        navigate(folderPathToRoute(folderPath));
        setSearchQuery("");
    };

    const handleTabChange = (tabId) => {
        setActiveTab(tabId);
        navigate("/home");
        setSearchQuery("");
    };


    const showContextMenuAt = (x, y, payload) => {
        const menuWidth = 192;
        const menuHeight = payload.kind === "background" || payload.item?.type === "folder" || payload.item?.is_deleted ? 44 : 80;
        setContextMenu({
            ...payload,
            x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
            y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
        });
    };

    const handleItemContextMenu = (event, item) => {
        event.preventDefault();
        event.stopPropagation();
        if (!selectedItems.has(item.key)) {
            setSelectedItems(new Set([item.key]));
            selectionAnchorRef.current = item.key;
        }
        showContextMenuAt(event.clientX, event.clientY, {kind: "item", item});
    };

    const handleItemMenuButton = (event, item) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        showContextMenuAt(rect.right - 192, rect.bottom + 4, {kind: "item", item});
    };

    const handleBackgroundContextMenu = (event) => {
        if (event.target.closest("[data-selection-id], [data-selection-ignore], button, input, textarea, select, a")) return;
        event.preventDefault();
        event.stopPropagation();
        showContextMenuAt(event.clientX, event.clientY, {kind: "background"});
    };

    const performContextMenuAction = (action) => {
        const menu = contextMenu;
        setContextMenu(null);
        if (!menu) return;

        if (action === "upload") {
            navigate(`/upload?directory=${encodeURIComponent(currentFolder || "/home")}`);
            return;
        }

        const item = menu.item;
        if (!item) return;
        if (action === "rename") openRenameDialog(item); else if (action === "download" && item.type === "file") downloadFile(item.id); else if (action === "restore" && item.type === "file") restoreItem(item.id); else if (action === "restore" && item.type === "folder") restoreFolder(item.id);
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

    const isSearching = Boolean(searchQuery.trim());

    const filteredFiles = useMemo(() => {
        if (isSearching) return searchResults;
        return visibleFiles;
    }, [visibleFiles, searchResults, isSearching]);

    const filteredFolders = useMemo(() => {
        if (isSearching) return [];
        return visibleFolders;
    }, [visibleFolders, isSearching]);

    const selectableItems = useMemo(() => [...filteredFolders.map((folder) => ({
        key: `folder:${folder.id}`,
        type: "folder",
        id: folder.id,
        name: folder.path.split("/").pop() || folder.path,
        path: folder.path,
        is_deleted: Boolean(folder.is_deleted),
        object: folder,
    })), ...filteredFiles
        .filter((file) => file && file.name !== ".__folder__")
        .map((file) => ({
            key: `file:${file.id}`,
            type: "file",
            id: file.id,
            name: file.name,
            directory: file.directory || "",
            is_deleted: Boolean(file.is_deleted),
            object: file,
        })),], [filteredFolders, filteredFiles]);

    const normalizeDirectoryPath = (path) => path || "/home";

    const reduceMoveItemsToRoots = (items) => items.filter((item) => !items.some((parent) => {
        if (parent.type !== "folder" || parent.key === item.key) return false;
        const parentPath = parent.path.replace(/\/$/, "");
        if (item.type === "folder") {
            return item.path === parentPath || item.path.startsWith(`${parentPath}/`);
        }
        const itemDirectory = normalizeDirectoryPath(item.directory || "").replace(/\/$/, "");
        return itemDirectory === parentPath || itemDirectory.startsWith(`${parentPath}/`);
    }));

    const canDropItemsIntoDirectory = (items, destinationPath) => {
        if (isTrash || !items?.length || movingItems) return false;
        const destination = normalizeDirectoryPath(destinationPath);

        // A folder must never be moved into itself or one of its descendants.
        if (items.some((item) => item.type === "folder" && (destination === item.path || destination.startsWith(`${item.path.replace(/\/$/, "")}/`)))) return false;

        return !items.every((item) => {
            if (item.type === "folder") {
                const parentPath = item.path.slice(0, item.path.lastIndexOf("/")) || "/";
                return normalizeDirectoryPath(parentPath) === destination;
            }
            return normalizeDirectoryPath(item.directory || "") === destination;
        });
    };

    const createMoveDragPreview = (items, pointerX, pointerY) => {
        const preview = document.createElement("div");
        Object.assign(preview.style, {
            position: "fixed",
            left: `${Math.max(0, Math.min(pointerX, window.innerWidth - 330))}px`,
            top: `${Math.max(0, Math.min(pointerY, window.innerHeight - 220))}px`,
            width: "320px",
            maxWidth: "320px",
            padding: "10px",
            border: "1px solid rgba(62, 207, 142, 0.8)",
            borderRadius: "10px",
            background: "#1f1f1f",
            color: "#fafafa",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.4)",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            pointerEvents: "none",
            zIndex: "2147483647",
            opacity: "0",
            transform: "translate3d(0, 8px, 0) scale(0.96)",
            transformOrigin: "top left",
            transition: "opacity 150ms ease-out, transform 150ms cubic-bezier(0.2, 0.75, 0.25, 1)",
            willChange: "opacity, transform",
        });

        const heading = document.createElement("div");
        heading.textContent = `Moving ${items.length} ${items.length === 1 ? "item" : "items"}`;
        Object.assign(heading.style, {
            color: "#3ecf8e", fontSize: "11px", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "7px",
        });
        preview.appendChild(heading);

        const visibleItems = items.slice(0, 6);
        for (const item of visibleItems) {
            const row = document.createElement("div");
            Object.assign(row.style, {
                display: "flex",
                alignItems: "center",
                gap: "9px",
                minWidth: "0",
                padding: "6px 7px",
                borderRadius: "6px",
                background: "rgba(255,255,255,0.045)",
                marginTop: "3px",
                fontSize: "12px",
            });

            const icon = document.createElement("span");
            icon.textContent = item.type === "folder" ? "folder" : getFileIcon(item.name).icon;
            icon.style.fontFamily = "'Material Symbols Outlined'";
            Object.assign(icon.style, {
                flex: "0 0 auto", fontSize: "18px", color: item.type === "folder" ? "#3ecf8e" : "#70b8ff",
            });

            const name = document.createElement("span");
            name.textContent = item.name;
            Object.assign(name.style, {
                display: "block", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1",
            });
            row.append(icon, name);
            preview.appendChild(row);
        }

        if (items.length > visibleItems.length) {
            const extra = document.createElement("div");
            extra.textContent = `+ ${items.length - visibleItems.length} more`;
            Object.assign(extra.style, {fontSize: "11px", color: "#a0a0a0", padding: "7px 7px 0"});
            preview.appendChild(extra);
        }

        document.body.appendChild(preview);
        // Let the browser paint the initial state before transitioning into the
        // floating preview, giving the still-to-drag change a soft entrance.
        window.requestAnimationFrame(() => {
            if (!preview.isConnected) return;
            preview.style.opacity = "1";
            preview.style.transform = "translate3d(0, 0, 0) scale(1)";
        });
        return preview;
    };

    const animateMoveDragPreviewOut = (preview) => {
        if (!preview?.isConnected) return;
        preview.style.transition = "opacity 120ms ease-in, transform 120ms ease-in";
        preview.style.opacity = "0";
        preview.style.transform = "translate3d(0, 4px, 0) scale(0.98)";
        window.setTimeout(() => preview.remove(), 130);
    };

    // Use pointer-driven dragging instead of the browser's native HTML5 drag
    // lifecycle. Native dragging was being cancelled when React updated the
    // source rows during dragstart, especially for a multi-selection.
    const beginMoveDrag = (event, item) => {
        if (event.button !== 0 || isTrash || item.is_deleted || movingItems || confirmAction) return;
        if (event.target.closest("[data-selection-ignore]")) return;

        const isPartOfSelection = selectedItems.has(item.key);
        const selected = isPartOfSelection ? selectableItems.filter((candidate) => selectedItems.has(candidate.key) && !candidate.is_deleted) : [item];
        const itemsToMove = reduceMoveItemsToRoots(selected).map(({key, type, id, name, path, directory}) => ({
            key, type, id, name, path, directory,
        }));
        if (!itemsToMove.length) return;

        movePointerRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            pointerX: event.clientX,
            pointerY: event.clientY,
            item,
            payload: itemsToMove,
            active: false,
            destinationPath: null,
            targetKey: null,
            wasSelected: isPartOfSelection,
        };
    };


    const moveItemsToDirectory = async (items, destinationPath) => {
        if (movingItems) return;
        const token = getToken();
        if (!token) {
            navigate("/");
            return;
        }

        const targetPath = normalizeDirectoryPath(destinationPath);
        const roots = reduceMoveItemsToRoots(items);
        if (!roots.length) return;

        setMovingItems(true);
        setPageError("");

        try {
            // Send the complete mixed file/folder selection in one request. The
            // backend returns per-item results so name conflicts do not hide which
            // items succeeded or failed.
            const response = await fetch(`${API_URL}/auth/move`, {
                method: "PATCH", headers: {
                    Authorization: `Bearer ${token}`, "Content-Type": "application/json",
                }, body: JSON.stringify({
                    directory: targetPath, items: roots.map(({type, id}) => ({type, id})),
                }),
            });

            let data = {};
            try {
                data = await response.json();
            } catch {
                // Keep the generic error below if the response is not JSON.
            }
            if (!response.ok) throw new Error(data.detail || data.message || "Failed to move selected items.");

            const movedCount = Array.isArray(data.moved) ? data.moved.length : 0;
            const unchangedCount = Array.isArray(data.unchanged) ? data.unchanged.length : 0;
            const failedItems = Array.isArray(data.failed) ? data.failed : [];
            if (failedItems.length) {
                const rootsByIdentity = new Map(roots.map((item) => [`${item.type}:${item.id}`, item]));
                const failures = failedItems.map((failure) => {
                    const item = rootsByIdentity.get(`${failure.type}:${failure.id}`);
                    return `${item?.name || `${failure.type} ${failure.id}`}: ${failure.error || "Move failed"}`;
                });
                const firstFailures = failures.slice(0, 3).join("; ");
                const more = failures.length > 3 ? `; and ${failures.length - 3} more` : "";
                setPageError(`${movedCount} item(s) moved${unchangedCount ? `, ${unchangedCount} already in the destination` : ""}. ${failures.length} failed: ${firstFailures}${more}`);
            }

            clearSelection();
            setSearchQuery("");
            setSearchResults([]);
            await fetchFiles();
        } catch (error) {
            setPageError(error.message || "Failed to move selected items.");
        } finally {
            setMovingItems(false);
            moveDragRef.current = null;
            dragDropAcceptedRef.current = false;
            setDraggingKeys(new Set());
            setDropTargetKey(null);
        }
    };

    // The document-level pointer handlers are installed once, so give them the
    // latest React callbacks on every render (not stale folder/loading closures).
    moveDndCallbacksRef.current = {canDropItemsIntoDirectory, moveItemsToDirectory};

    const handleSelectItem = (item, event) => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }

        const itemIndex = selectableItems.findIndex((candidate) => candidate.key === item.key);
        const anchorIndex = selectableItems.findIndex((candidate) => candidate.key === selectionAnchorRef.current);

        if (event.shiftKey && anchorIndex >= 0 && itemIndex >= 0) {
            const next = event.ctrlKey || event.metaKey ? new Set(selectedItems) : new Set();
            const start = Math.min(anchorIndex, itemIndex);
            const end = Math.max(anchorIndex, itemIndex);
            for (let i = start; i <= end; i += 1) next.add(selectableItems[i].key);
            setSelectedItems(next);
        } else if (event.ctrlKey || event.metaKey) {
            const next = new Set(selectedItems);
            if (next.has(item.key)) next.delete(item.key); else next.add(item.key);
            setSelectedItems(next);
            selectionAnchorRef.current = item.key;
        } else {
            setSelectedItems(new Set([item.key]));
            selectionAnchorRef.current = item.key;
        }
    };

    const clearSelection = () => {
        setSelectedItems(new Set());
        selectionAnchorRef.current = null;
    };

    const openSelectedItem = (item) => {
        if (!item || activeTab === "trash") return;
        if (item.type === "folder") openFolder(item.path); else handleFileClick(item.object);
    };

    const renameItem = async (item, newName) => {
        const token = getToken();
        if (!token) {
            navigate("/");
            throw new Error("Your session has expired. Please sign in again.");
        }

        if (newName === item.name) {
            setRenameTarget(null);
            renameSelectionSnapshotRef.current = null;
            return;
        }

        const resource = item.type === "folder" ? "directory" : "file";
        const response = await fetch(`${API_URL}/auth/${resource}/${item.id}/rename?name=${encodeURIComponent(newName)}`, {
            method: "PATCH", headers: {Authorization: `Bearer ${token}`},
        },);

        let data = {};
        try {
            data = await response.json();
        } catch {
            // Keep the fallback response below if the server sends no JSON.
        }
        if (!response.ok) {
            throw new Error(data.detail || data.message || `Failed to rename ${item.type}.`);
        }

        const finalName = data.name || newName;
        if (item.type === "file") {
            setFiles((current) => current.map((file) => (String(file.id) === String(item.id) ? {...file, name: finalName} : file)));
            setSearchResults((current) => current.map((file) => (String(file.id) === String(item.id) ? {...file, name: finalName} : file)));
        } else {
            const oldPath = item.path;
            const newPath = data.path || `${oldPath.slice(0, oldPath.lastIndexOf("/"))}/${finalName}`;
            const replacePath = (path) => {
                if (path === oldPath) return newPath;
                if (path.startsWith(`${oldPath}/`)) return `${newPath}${path.slice(oldPath.length)}`;
                return path;
            };
            setFolders((current) => current.map((folder) => ({...folder, path: replacePath(folder.path)})));
            setFiles((current) => current.map((file) => ({
                ...file, directory: replacePath(file.directory || ""),
            })));
            setSearchResults((current) => current.map((file) => ({
                ...file, directory: replacePath(file.directory || ""),
            })));
        }

        setRenameTarget(null);
        renameSelectionSnapshotRef.current = null;
        await fetchFiles();
    };

    const openRenameDialog = (item) => {
        // Keep selection and the range-selection anchor intact when the dialog
        // is cancelled. The selected item remains selected after a successful rename too.
        renameSelectionSnapshotRef.current = {
            keys: Array.from(selectedItems), anchor: selectionAnchorRef.current,
        };
        setRenameTarget(item);
    };

    const closeRenameDialog = () => {
        const snapshot = renameSelectionSnapshotRef.current;
        if (snapshot) {
            setSelectedItems(new Set(snapshot.keys));
            selectionAnchorRef.current = snapshot.anchor;
        }
        renameSelectionSnapshotRef.current = null;
        setRenameTarget(null);
    };

    const requestBulkConfirmation = (mode) => {
        const items = selectableItems.filter((item) => selectedItems.has(item.key));
        if (!items.length) return;
        setBulkActionError("");
        setConfirmFocus("cancel");
        setConfirmAction({
            mode, items, // Keep the exact pre-dialog selection so Escape/Cancel restores it.
            selectionSnapshot: Array.from(selectedItems), selectionAnchor: selectionAnchorRef.current,
        });
    };

    const cancelBulkConfirmation = () => {
        if (!confirmAction || bulkActionLoading) return;
        setSelectedItems(new Set(confirmAction.selectionSnapshot ?? confirmAction.items.map((item) => item.key)));
        selectionAnchorRef.current = confirmAction.selectionAnchor ?? confirmAction.items[0]?.key ?? null;
        setConfirmAction(null);
        setBulkActionError("");
    };

    useEffect(() => {
        if (!confirmAction) return undefined;
        setConfirmFocus("cancel");
        const frame = window.requestAnimationFrame(() => cancelConfirmButtonRef.current?.focus());
        return () => window.cancelAnimationFrame(frame);
    }, [confirmAction]);

    const handleSelectionMouseDown = (event) => {
        if (event.button !== 0 || confirmAction) return;
        if (event.target.closest("[data-selection-ignore]")) return;

        const itemNode = event.target.closest("[data-selection-id]");
        // Item drags are native HTML drag-and-drop; the marquee starts only on empty space.
        if (itemNode) return;
        if (event.target.closest("button, input, textarea, select, a")) return;

        dragStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            dragging: false,
            baseSelection: new Set(selectedItems),
            preserve: event.ctrlKey || event.metaKey || event.shiftKey,
        };
        event.preventDefault();
    };

    useEffect(() => {
        const onMouseMove = (event) => {
            const move = movePointerRef.current;
            if (move) {
                move.pointerX = event.clientX;
                move.pointerY = event.clientY;
                const dx = event.clientX - move.startX;
                const dy = event.clientY - move.startY;

                if (!move.active && Math.hypot(dx, dy) >= 6) {
                    move.active = true;
                    suppressClickRef.current = true;
                    moveDragRef.current = move.payload;
                    if (!move.wasSelected) {
                        setSelectedItems(new Set([move.item.key]));
                        selectionAnchorRef.current = move.item.key;
                    }
                    setDraggingKeys(new Set(move.payload.map((entry) => entry.key)));
                    const preview = createMoveDragPreview(move.payload, event.clientX + 12, event.clientY + 12);
                    dragPreviewNodeRef.current = preview;
                }

                if (move.active) {
                    const preview = dragPreviewNodeRef.current;
                    if (preview?.isConnected) {
                        preview.style.left = `${Math.max(8, Math.min(event.clientX + 12, window.innerWidth - 328))}px`;
                        preview.style.top = `${Math.max(8, Math.min(event.clientY + 12, window.innerHeight - 220))}px`;
                    }

                    const hovered = document.elementFromPoint(event.clientX, event.clientY);
                    const dropNode = hovered?.closest?.("[data-drop-path][data-drop-key]");
                    const destinationPath = dropNode?.getAttribute("data-drop-path") || null;
                    const targetKey = dropNode?.getAttribute("data-drop-key") || null;
                    const callbacks = moveDndCallbacksRef.current;
                    const canDrop = Boolean(destinationPath && callbacks?.canDropItemsIntoDirectory?.(move.payload, destinationPath));

                    move.destinationPath = canDrop ? destinationPath : null;
                    move.targetKey = canDrop ? targetKey : null;
                    setDropTargetKey(canDrop ? targetKey : null);
                }
                return;
            }

            const drag = dragStateRef.current;
            const surface = selectionSurfaceRef.current;
            if (!drag || !surface) return;

            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;
            if (!drag.dragging && Math.hypot(dx, dy) < 5) return;
            drag.dragging = true;
            suppressClickRef.current = true;

            const surfaceRect = surface.getBoundingClientRect();
            const left = Math.min(drag.startX, event.clientX);
            const top = Math.min(drag.startY, event.clientY);
            const right = Math.max(drag.startX, event.clientX);
            const bottom = Math.max(drag.startY, event.clientY);
            setMarquee({
                left: left - surfaceRect.left, top: top - surfaceRect.top, width: right - left, height: bottom - top,
            });

            const next = drag.preserve ? new Set(drag.baseSelection) : new Set();
            surface.querySelectorAll("[data-selection-id]").forEach((node) => {
                const rect = node.getBoundingClientRect();
                const intersects = rect.right >= left && rect.left <= right && rect.bottom >= top && rect.top <= bottom;
                if (intersects) next.add(node.getAttribute("data-selection-id"));
            });
            setSelectedItems(next);
        };

        const onMouseUp = (event) => {
            const move = movePointerRef.current;
            if (move) {
                movePointerRef.current = null;
                if (move.active) {
                    suppressClickRef.current = true;
                    const hovered = document.elementFromPoint(event.clientX, event.clientY);
                    const dropNode = hovered?.closest?.("[data-drop-path][data-drop-key]");
                    const destinationPath = dropNode?.getAttribute("data-drop-path") || move.destinationPath;
                    const callbacks = moveDndCallbacksRef.current;
                    const canDrop = Boolean(destinationPath && callbacks?.canDropItemsIntoDirectory?.(move.payload, destinationPath));

                    animateMoveDragPreviewOut(dragPreviewNodeRef.current);
                    dragPreviewNodeRef.current = null;
                    setDropTargetKey(null);

                    if (canDrop) {
                        setDraggingKeys(new Set(move.payload.map((entry) => entry.key)));
                        callbacks.moveItemsToDirectory(move.payload, destinationPath);
                    } else {
                        moveDragRef.current = null;
                        setDraggingKeys(new Set());
                    }
                    window.requestAnimationFrame(() => {
                        suppressClickRef.current = false;
                    });
                }
                return;
            }

            const drag = dragStateRef.current;
            if (!drag) return;
            dragStateRef.current = null;
            if (drag.dragging) {
                setMarquee(null);
                // Suppress the click that the browser emits after a marquee drag.
                window.requestAnimationFrame(() => {
                    suppressClickRef.current = false;
                });
            }
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        return () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };
    }, []);

    // Persist selection changes under the route where they occurred, so both
    // browser Back/Forward and Backspace can restore each directory independently.
    useEffect(() => {
        if (selectionSnapshotInitialRenderRef.current) {
            // Don't overwrite a saved selection with the initial empty React state
            // before the current directory has finished loading and restoration runs.
            selectionSnapshotInitialRenderRef.current = false;
            return;
        }
        if (lastSelectionSnapshotViewKeyRef.current !== currentSelectionViewKey) {
            lastSelectionSnapshotViewKeyRef.current = currentSelectionViewKey;
            return;
        }
        if (skipSelectionSnapshotPersistRef.current) {
            skipSelectionSnapshotPersistRef.current = false;
            return;
        }
        saveCurrentSelectionSnapshot();
        // The callback intentionally reads the latest selection anchor from its ref.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentSelectionViewKey, selectedItems]);

    useEffect(() => {
        const legacySnapshot = selectionRestoreRef.current.snapshot;
        const legacyMatchesCurrentView = legacySnapshot && legacySnapshot.pathname === location.pathname && legacySnapshot.activeTab === activeTab && legacySnapshot.searchQuery === searchQuery;
        const directorySnapshot = selectionSnapshotsByViewRef.current?.[currentSelectionViewKey];
        const shouldRestoreSelection = Boolean(legacyMatchesCurrentView || directorySnapshot);

        if (!shouldRestoreSelection) {
            if (selectedItems.size > 0) {
                // The next render is the intentional reset caused by navigation;
                // don't persist that reset over the target view's saved snapshot.
                skipSelectionSnapshotPersistRef.current = true;
                setSelectedItems(new Set());
                selectionAnchorRef.current = null;
            }
        }

        // A completed or interrupted drag must never leave matching item IDs
        // hidden after navigation. Clear transient drag styling on every view change.
        setDraggingKeys(new Set());
        setDropTargetKey(null);
        movePointerRef.current = null;
        if (dragPreviewNodeRef.current?.isConnected) {
            animateMoveDragPreviewOut(dragPreviewNodeRef.current);
        }
        dragPreviewNodeRef.current = null;
    }, [location.pathname, activeTab, searchQuery]);

    useEffect(() => {
        const legacySnapshot = selectionRestoreRef.current.snapshot;
        const legacyMatchesCurrentView = legacySnapshot && legacySnapshot.pathname === location.pathname && legacySnapshot.activeTab === activeTab && legacySnapshot.searchQuery === searchQuery;

        if (legacySnapshot && !legacyMatchesCurrentView) {
            selectionRestoreRef.current.snapshot = null;
            sessionStorage.removeItem(DASHBOARD_SELECTION_STORAGE_KEY);
        }

        const snapshot = legacyMatchesCurrentView ? legacySnapshot : selectionSnapshotsByViewRef.current?.[currentSelectionViewKey];
        if (!snapshot) return;

        // Wait for directory/search data to finish before matching saved IDs.
        // A route change can render once before the new directory fetch flips
        // loadingFiles to true. Wait until results for this exact folder are loaded,
        // otherwise stale rows from the previous directory can erase its snapshot.
        if (loadingFiles || loadedFolder !== (currentFolder || "") || (searchQuery.trim() && searchLoading)) return;

        const availableKeys = new Set(selectableItems.map((item) => item.key));
        const restoredKeys = (Array.isArray(snapshot.keys) ? snapshot.keys : [])
            .filter((key) => availableKeys.has(key));
        setSelectedItems(new Set(restoredKeys));
        selectionAnchorRef.current = availableKeys.has(snapshot.anchor) ? snapshot.anchor : (restoredKeys[0] ?? null);

        if (legacyMatchesCurrentView) {
            selectionRestoreRef.current.snapshot = null;
            sessionStorage.removeItem(DASHBOARD_SELECTION_STORAGE_KEY);
        }
    }, [currentSelectionViewKey, location.pathname, activeTab, searchQuery, currentFolder, loadedFolder, loadingFiles, searchLoading, selectableItems,]);

    useEffect(() => {
        const onKeyDown = (event) => {
            if (contextMenu && event.key === "Escape") {
                event.preventDefault();
                setContextMenu(null);
                return;
            }
            // The rename dialog owns all keyboard input while open, including
            // Escape, so background shortcuts cannot clear or alter the selection.
            if (renameTarget) return;

            if (event.key === "Escape") {
                if (confirmAction) {
                    cancelBulkConfirmation();
                    return;
                }
                clearSelection();
                setMarquee(null);
                dragStateRef.current = null;
                suppressClickRef.current = false;
                setBulkActionError("");
                return;
            }

            // While a confirmation dialog is open, arrow keys switch between
            // Cancel and the destructive action, and Enter activates the focused
            // choice. Keep these keys out of the normal file-selection handler.
            if (confirmAction) {
                if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
                    event.preventDefault();
                    if (bulkActionLoading) return;
                    const nextFocus = confirmFocus === "cancel" ? "confirm" : "cancel";
                    setConfirmFocus(nextFocus);
                    (nextFocus === "cancel" ? cancelConfirmButtonRef : destructiveConfirmButtonRef).current?.focus();
                    return;
                }
                if (event.key === "Enter") {
                    event.preventDefault();
                    if (bulkActionLoading) return;
                    if (confirmFocus === "confirm") executeBulkAction(); else cancelBulkConfirmation();
                    return;
                }
                return;
            }

            const target = event.target;
            if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']"))) return;

            if (event.key === "F2") {
                const selected = selectableItems.filter((item) => selectedItems.has(item.key));
                if (activeTab !== "trash" && selected.length === 1 && !bulkActionLoading) {
                    event.preventDefault();
                    openRenameDialog(selected[0]);
                }
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
                event.preventDefault();
                setSelectedItems(new Set(selectableItems.map((item) => item.key)));
                selectionAnchorRef.current = selectableItems[0]?.key || null;
                return;
            }

            if (event.key === "Delete") {
                const selected = selectableItems.filter((item) => selectedItems.has(item.key));
                if (!selected.length) return;
                event.preventDefault();
                requestBulkConfirmation(activeTab === "trash" || event.shiftKey ? "permanent" : "trash");
                return;
            }

            if (event.key === "Backspace") {
                event.preventDefault();
                if (activeTab !== "trash" && currentFolder) {
                    const parts = currentFolder.split("/").filter(Boolean);
                    if (parts.length > 1) {
                        const parentPath = `/${parts.slice(0, -1).join("/")}`;
                        navigate(folderPathToRoute(parentPath));
                    } else {
                        navigate("/home");
                    }
                    saveCurrentSelectionSnapshot();
                    setSearchQuery("");
                }
                return;
            }

            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
                if (!selectableItems.length) return;
                event.preventDefault();

                const direction = {
                    ArrowUp: {axis: "y", sign: -1, fallback: -1},
                    ArrowDown: {axis: "y", sign: 1, fallback: 1},
                    ArrowLeft: {axis: "x", sign: -1, fallback: -1},
                    ArrowRight: {axis: "x", sign: 1, fallback: 1},
                }[event.key];

                // Prefer the selection anchor; if the current selection came from
                // a marquee, fall back to the first selected item in display order.
                const currentKey = selectedItems.has(selectionAnchorRef.current) ? selectionAnchorRef.current : selectableItems.find((item) => selectedItems.has(item.key))?.key;
                const currentIndex = selectableItems.findIndex((item) => item.key === currentKey);
                let nextItem = null;

                if (currentKey && currentIndex >= 0) {
                    const surface = selectionSurfaceRef.current;
                    const nodes = surface ? Array.from(surface.querySelectorAll("[data-selection-id]")) : [];
                    const currentNode = nodes.find((node) => node.getAttribute("data-selection-id") === currentKey);

                    if (currentNode) {
                        const currentRect = currentNode.getBoundingClientRect();
                        const currentX = currentRect.left + currentRect.width / 2;
                        const currentY = currentRect.top + currentRect.height / 2;
                        let bestScore = Infinity;

                        for (const node of nodes) {
                            const key = node.getAttribute("data-selection-id");
                            if (!key || key === currentKey) continue;
                            const candidate = selectableItems.find((item) => item.key === key);
                            if (!candidate) continue;

                            const rect = node.getBoundingClientRect();
                            const dx = rect.left + rect.width / 2 - currentX;
                            const dy = rect.top + rect.height / 2 - currentY;
                            const primaryDelta = direction.axis === "x" ? dx * direction.sign : dy * direction.sign;
                            if (primaryDelta <= 2) continue;

                            const crossDelta = Math.abs(direction.axis === "x" ? dy : dx);
                            // Favor items in the same row for left/right and in the
                            // same column for up/down, while still allowing grid edges.
                            const score = primaryDelta + crossDelta * 2;
                            if (score < bestScore) {
                                bestScore = score;
                                nextItem = candidate;
                            }
                        }
                    }

                    // File rows occupy the same horizontal span, so left/right may
                    // have no spatial neighbour. Fall back to the display order.
                    if (!nextItem) {
                        const nextIndex = Math.max(0, Math.min(selectableItems.length - 1, currentIndex + direction.fallback));
                        nextItem = selectableItems[nextIndex];
                    }
                } else {
                    // With no selection, start at the nearest end for the direction.
                    nextItem = direction.fallback < 0 ? selectableItems[selectableItems.length - 1] : selectableItems[0];
                }

                if (nextItem) {
                    setSelectedItems(new Set([nextItem.key]));
                    selectionAnchorRef.current = nextItem.key;
                    const node = selectionSurfaceRef.current ? Array.from(selectionSurfaceRef.current.querySelectorAll("[data-selection-id]")).find((element) => element.getAttribute("data-selection-id") === nextItem.key,) : null;
                    node?.scrollIntoView({block: "nearest", inline: "nearest", behavior: "auto"});
                }
                return;
            }

            if (event.key === "Enter") {
                const selected = selectableItems.filter((item) => selectedItems.has(item.key));
                if (selected.length === 1 && activeTab !== "trash") {
                    event.preventDefault();
                    openSelectedItem(selected[0]);
                }
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [activeTab, bulkActionLoading, cancelBulkConfirmation, confirmAction, confirmFocus, contextMenu, currentFolder, navigate, renameTarget, searchQuery, selectableItems, selectedItems]);

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
                storageUsed={storageUsed}
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
                    storageUsed={storageUsed}
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
            </header>

            {/* Main View Area */}
            <main className="flex-1 overflow-y-auto bg-[#1c1c1c] px-4 pb-8 pt-20 md:px-8">
                <div
                    ref={selectionSurfaceRef}
                    onMouseDown={handleSelectionMouseDown}
                    onContextMenu={handleBackgroundContextMenu}
                    onClick={(event) => {
                        // Clicking empty space clears the selection, like the desktop.
                        // Do not clear after a marquee drag or when interacting with an item/control.
                        if (suppressClickRef.current) return;
                        if (event.target.closest("[data-selection-id], [data-selection-ignore], button, input, textarea, select, a")) return;
                        clearSelection();
                    }}
                    className="relative min-h-full select-none"
                >
                    {!isTrash ? (<div
                        className="mb-6 w-full rounded-xl border border-[#343434] bg-gradient-to-r from-[#202020] via-[#1d1d1d] to-[#191919] px-4 py-3.5 shadow-[0_8px_28px_rgba(0,0,0,0.12)] sm:px-5">
                        <div className="flex min-w-0 items-center gap-3">
                            <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#3ecf8e]/20 bg-[#3ecf8e]/10 text-[#3ecf8e]">
                                <span className="material-symbols-outlined text-[21px]" aria-hidden="true">folder_open</span>
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#707070]">Current location</p>
                                <nav aria-label="Folder path" className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                                    {breadcrumbSegments.map(({label, path, isHome}, i) => (
                                        <span key={`${path}-${i}`} className="inline-flex min-w-0 items-center gap-1.5">
                                            {i > 0 && <span className="material-symbols-outlined text-[16px] text-[#555555]"
                                                            aria-hidden="true">chevron_right</span>}
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    if (suppressClickRef.current) {
                                                        event.preventDefault();
                                                        return;
                                                    }
                                                    openFolder(isHome ? "" : path);
                                                }}
                                                data-drop-path={isHome ? "/home" : path}
                                                data-drop-key={`breadcrumb-drop:${isHome ? "/home" : path}`}
                                                aria-current={i === breadcrumbSegments.length - 1 ? "location" : undefined}
                                                className={`max-w-full truncate rounded px-1 py-0.5 transition-colors hover:bg-white/[0.06] hover:text-[#fafafa] ${dropTargetKey === `breadcrumb-drop:${isHome ? "/home" : path}` ? "bg-[#3ecf8e]/15 text-[#3ecf8e] ring-1 ring-[#3ecf8e]/40" : i === breadcrumbSegments.length - 1 ? "font-medium text-[#fafafa]" : "text-[#929292]"}`}
                                                title={label}
                                            >
                                                {label}
                                            </button>
                                        </span>))}
                                </nav>
                            </div>
                        </div>
                    </div>) : (
                        <div className="mb-6 flex w-full items-center gap-3 rounded-xl border border-[#343434] bg-[#202020] px-4 py-3.5 sm:px-5">
                            <div
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#f5a524]/20 bg-[#f5a524]/10 text-[#f5a524]">
                                <span className="material-symbols-outlined text-[21px]" aria-hidden="true">delete</span>
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#707070]">File management</p>
                                <h2 className="mt-1 text-sm font-medium text-[#fafafa]">Trash</h2>
                            </div>
                        </div>)}

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
                                {filteredFolders.map(({path, id, is_deleted: folderIsDeleted}) => {
                                    const displayName = path.split("/").pop();
                                    const itemKey = `folder:${id}`;
                                    const isSelected = selectedItems.has(itemKey);
                                    const selectionItem = {
                                        key: itemKey,
                                        type: "folder",
                                        id,
                                        name: displayName,
                                        path,
                                        is_deleted: Boolean(folderIsDeleted),
                                        object: {path, id, is_deleted: Boolean(folderIsDeleted)}
                                    };
                                    const folderDropKey = `folder-drop:${id}`;
                                    const isFolderDropTarget = dropTargetKey === folderDropKey;
                                    return (<div
                                        key={path}
                                        data-selection-id={itemKey}
                                        onMouseDown={(event) => beginMoveDrag(event, selectionItem)}
                                        data-drop-path={path}
                                        data-drop-key={folderDropKey}
                                        onClick={(event) => handleSelectItem(selectionItem, event)}
                                        onContextMenu={(event) => handleItemContextMenu(event, selectionItem)}
                                        onDoubleClick={(event) => {
                                            if (isTrash || suppressClickRef.current) return;
                                            event.preventDefault();
                                            openFolder(path);
                                        }}
                                        className={`group relative cursor-default rounded-lg border p-4 text-left transition-all duration-200 ease-out motion-reduce:transition-none ${isFolderDropTarget ? "border-[#3ecf8e] bg-[#3ecf8e]/[0.14] ring-2 ring-[#3ecf8e]/30" : isSelected ? "border-[#3ecf8e]/60 bg-[#3ecf8e]/[0.08] ring-1 ring-[#3ecf8e]/30" : "border-[#2e2e2e] bg-[#1f1f1f] hover:border-[#4d4d4d] hover:bg-[#232323]"}`}
                                        style={draggingKeys.has(itemKey) ? {
                                            opacity: 0, transform: "scale(0.985)", pointerEvents: "none",
                                        } : undefined}
                                    >
                                        <button
                                            type="button"
                                            className={`block w-full text-left ${isTrash ? "cursor-default" : "cursor-pointer"}`}
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
                                            data-selection-ignore
                                            onClick={(event) => event.stopPropagation()}
                                            onDoubleClick={(event) => event.stopPropagation()}
                                            className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                            <button
                                                type="button"
                                                onClick={(event) => handleItemMenuButton(event, selectionItem)}
                                                onContextMenu={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                }}
                                                title={isTrash ? "Folder options" : "Folder options"}
                                                aria-label={`Options for folder ${displayName}`}
                                                className={iconBtn}
                                            >
                                                <span className="material-symbols-outlined text-[18px]">more_vert</span>
                                            </button>
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
                                <div
                                    className="grid grid-cols-12 gap-2 border-b border-[#2e2e2e] bg-[#1f1f1f] px-4 py-2.5 sm:grid-cols-[minmax(0,2.7fr)_minmax(64px,0.35fr)_minmax(72px,0.45fr)_28px]">
                                    <div className="col-span-8 text-xs font-medium text-[#898989] sm:col-auto">
                                        Name
                                    </div>
                                    <div className="col-span-1 hidden text-xs font-medium text-[#898989] sm:col-auto sm:block">
                                        Size
                                    </div>
                                    <div className="col-span-3 text-xs font-medium text-[#898989] sm:col-auto">
                                        Data Center
                                    </div>
                                    <div className="col-span-1 sm:col-auto" aria-hidden="true"/>
                                </div>

                                {filteredFiles.map((file, index) => {
                                    const {icon, color} = getFileIcon(file.name);
                                    const isLast = index === filteredFiles.length - 1;
                                    const isDeleting = deletingId === file.id;
                                    const itemKey = `file:${file.id}`;
                                    const isSelected = selectedItems.has(itemKey);
                                    const selectionItem = {
                                        key: itemKey,
                                        type: "file",
                                        id: file.id,
                                        name: file.name,
                                        directory: file.directory || "",
                                        is_deleted: Boolean(file.is_deleted),
                                        object: file
                                    };

                                    return (<div
                                        key={file.id}
                                        data-selection-id={itemKey}
                                        onMouseDown={(event) => beginMoveDrag(event, selectionItem)}
                                        onClick={(event) => handleSelectItem(selectionItem, event)}
                                        onContextMenu={(event) => handleItemContextMenu(event, selectionItem)}
                                        onDoubleClick={(event) => {
                                            if (isTrash || suppressClickRef.current) return;
                                            event.preventDefault();
                                            openSelectedItem(selectionItem);
                                        }}
                                        className={`group grid cursor-default grid-cols-12 items-center gap-2 px-4 py-2.5 transition-all duration-200 ease-out motion-reduce:transition-none sm:grid-cols-[minmax(0,2.7fr)_minmax(64px,0.35fr)_minmax(72px,0.45fr)_28px] ${isSelected ? "bg-[#3ecf8e]/[0.08] ring-1 ring-inset ring-[#3ecf8e]/35" : "hover:bg-[#232323]"} ${isLast ? "" : "border-b border-[#2e2e2e]"}`}
                                        style={draggingKeys.has(itemKey) ? {
                                            opacity: 0, transform: "scale(0.995)", pointerEvents: "none",
                                        } : undefined}
                                    >
                                        {/* File Name & Mobile Metadata */}
                                        <div className="col-span-8 flex min-w-0 items-center gap-3 sm:col-auto">
                                                            <span className={`material-symbols-outlined text-[18px] ${color}`} aria-hidden="true">
                                                                {icon}
                                                            </span>
                                            <div className="min-w-0">
                                                {isTrash ? (<p className="truncate text-sm text-[#fafafa]">{file.name}</p>) : (<button
                                                    type="button"
                                                    className="block max-w-full truncate text-left text-sm text-[#fafafa] transition-colors hover:text-white"
                                                >
                                                    {file.name}
                                                </button>)}
                                                <p className="mt-0.5 text-xs text-[#707070] sm:hidden">
                                                    {formatFileSize(file.size)} • {formatDate(file.modified_at)}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Desktop File Size */}
                                        <div className="col-span-1 hidden font-mono text-xs text-[#898989] sm:col-auto sm:block">
                                            {formatFileSize(file.size)}
                                        </div>

                                        {/* Data Center */}
                                        <div className="col-span-3 sm:col-auto min-w-0">
                                                            <span
                                                                className="inline-block max-w-full truncate rounded border border-[#363636] bg-[#242424] px-2 py-0.5 text-xs text-[#b4b4b4]">
                                                                {file.data_center || "—"}
                                                            </span>
                                        </div>

                                        {/* Per-file options live in a compact overflow menu, not a separate Actions column. */}
                                        <div
                                            data-selection-ignore
                                            onClick={(event) => event.stopPropagation()}
                                            onDoubleClick={(event) => event.stopPropagation()}
                                            className="col-span-1 flex justify-end sm:col-auto">
                                            <button
                                                type="button"
                                                onClick={(event) => handleItemMenuButton(event, selectionItem)}
                                                onContextMenu={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                }}
                                                title={isTrash ? "File options" : "File options"}
                                                aria-label={`Options for file ${file.name}`}
                                                className={iconBtn}
                                            >
                                                <span className="material-symbols-outlined text-[18px]">more_vert</span>
                                            </button>
                                        </div>
                                    </div>);
                                })}
                            </div>
                        </div>))}
                    </>)}
                    {marquee && (<div
                        aria-hidden="true"
                        className="pointer-events-none absolute z-30 rounded-sm border border-[#3ecf8e] bg-[#3ecf8e]/15"
                        style={{left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height}}
                    />)}
                </div>
            </main>
        </div>

        {contextMenu && (<DashboardContextMenu
            menu={contextMenu}
            onClose={() => setContextMenu(null)}
            onAction={performContextMenuAction}
        />)}

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

        {confirmAction && (<div
            className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
            onClick={cancelBulkConfirmation}
        >
            <section
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="bulk-confirm-title"
                aria-describedby="bulk-confirm-description"
                className="w-full max-w-md rounded-lg border border-[#2e2e2e] bg-[#1c1c1c] p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="mb-5 flex items-start gap-3">
                    <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#e5484d]/25 bg-[#e5484d]/10 text-[#ff6369]">
                        <span className="material-symbols-outlined text-[21px]" aria-hidden="true">
                            {confirmAction.mode === "permanent" ? "delete_forever" : "delete"}
                        </span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 id="bulk-confirm-title" className="text-base font-medium text-[#fafafa]">
                            {confirmAction.mode === "permanent" ? "Delete permanently?" : "Move to Trash?"}
                        </h2>
                        <p id="bulk-confirm-description" className="mt-1.5 text-sm leading-5 text-[#898989]">
                            {confirmAction.mode === "permanent" ? `Permanently delete ${confirmAction.items.length} selected item${confirmAction.items.length === 1 ? "" : "s"}? This action cannot be undone.` : `Move ${confirmAction.items.length} selected item${confirmAction.items.length === 1 ? "" : "s"} to Trash? You can restore them later.`}
                        </p>
                        {confirmAction.items.length === 1 &&
                            <p className="mt-2 truncate text-xs text-[#b4b4b4]" title={confirmAction.items[0].name}>{confirmAction.items[0].name}</p>}
                        {bulkActionError && <p className="mt-3 text-sm text-[#ff6369]">{bulkActionError}</p>}
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        ref={cancelConfirmButtonRef}
                        type="button"
                        onClick={cancelBulkConfirmation}
                        onFocus={() => setConfirmFocus("cancel")}
                        disabled={bulkActionLoading}
                        className={`${btnSecondary} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3ecf8e]/70`}
                    >Cancel
                    </button>
                    <button
                        ref={destructiveConfirmButtonRef}
                        type="button"
                        onClick={executeBulkAction}
                        onFocus={() => setConfirmFocus("confirm")}
                        disabled={bulkActionLoading}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#e5484d]/40 bg-[#e5484d]/10 px-3 text-xs text-[#ff8589] transition-colors hover:bg-[#e5484d]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5484d]/70 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {bulkActionLoading &&
                            <span className="material-symbols-outlined animate-spin text-[15px]" aria-hidden="true">progress_activity</span>}
                        {bulkActionLoading ? "Processing…" : confirmAction.mode === "permanent" ? "Delete permanently" : "Move to Trash"}
                    </button>
                </div>
            </section>
        </div>)}

        {renameTarget && (<RenameItemModal
            item={renameTarget}
            onClose={closeRenameDialog}
            onRename={renameItem}
        />)}

        {showFolderModal && (<CreateFolderModal
            targetPath={currentFolder}
            onClose={() => setShowFolderModal(false)}
            onCreate={createFolder}
        />)}
    </div>);
}
