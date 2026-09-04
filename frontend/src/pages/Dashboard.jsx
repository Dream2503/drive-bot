import {useCallback, useEffect, useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

const NAV_ITEMS = [
    {icon: "folder_open", label: "All Files", enabled: true},
    {icon: "schedule", label: "Recent", enabled: false},
    {icon: "group", label: "Shared", enabled: false},
    {icon: "delete", label: "Trash", enabled: false},
];

const FILE_ICONS = {
    pdf: {icon: "picture_as_pdf", color: "#F66"},
    jpg: {icon: "image", color: "#7B93DB"},
    jpeg: {icon: "image", color: "#7B93DB"},
    png: {icon: "image", color: "#7B93DB"},
    gif: {icon: "image", color: "#7B93DB"},
    webp: {icon: "image", color: "#7B93DB"},
    txt: {icon: "subject", color: "#9B9B9B"},
    zip: {icon: "folder_zip", color: "#F0A500"},
    rar: {icon: "folder_zip", color: "#F0A500"},
    mp4: {icon: "movie", color: "#3ECF8E"},
    mkv: {icon: "movie", color: "#3ECF8E"},
    mp3: {icon: "music_note", color: "#3ECF8E"},
    wav: {icon: "music_note", color: "#3ECF8E"},
    py: {icon: "code", color: "#3ECF8E"},
    js: {icon: "code", color: "#F0A500"},
    jsx: {icon: "code", color: "#7B93DB"},
    default: {icon: "draft", color: "#9B9B9B"},
};

function getFileIcon(filename) {
    const extension = filename?.split(".").pop()?.toLowerCase();
    return FILE_ICONS[extension] || FILE_ICONS.default;
}

function formatDate(dateStr) {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"});
}

function getToken() {
    return localStorage.getItem("token");
}

function Sidebar({onUpload, onGoHome, onLogout}) {
    return (
        <nav style={{
            width: 260,
            height: "100vh",
            background: "#1a1a1a",
            borderRight: "1px solid #2a2a2a",
            display: "flex",
            flexDirection: "column",
            padding: "16px 12px",
            flexShrink: 0,
        }}>
            {/* Logo */}
            <div style={{display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 20px"}}>
                <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: "#3ECF8E", display: "flex",
                    alignItems: "center", justifyContent: "center",
                }}>
                    <span className="material-symbols-outlined" style={{fontSize: 16, color: "#000", fontVariationSettings: "'FILL' 1"}}>cloud</span>
                </div>
                <span style={{fontWeight: 600, fontSize: 14, color: "#fff", letterSpacing: 0.2}}>DriveBot</span>
            </div>

            {/* Upload button */}
            <button onClick={onUpload} style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "#3ECF8E", color: "#000", border: "none",
                borderRadius: 6, padding: "8px 12px", fontSize: 13,
                fontWeight: 600, cursor: "pointer", marginBottom: 16,
                width: "100%",
            }}>
                <span className="material-symbols-outlined" style={{fontSize: 16}}>add</span>
                New Upload
            </button>

            {/* Nav */}
            <div style={{display: "flex", flexDirection: "column", gap: 1, flex: 1}}>
                {NAV_ITEMS.map(({icon, label, enabled}) => (
                    <button key={label} type="button" disabled={!enabled}
                        onClick={enabled ? onGoHome : undefined}
                        style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "7px 10px", borderRadius: 6, border: "none",
                            background: label === "All Files" ? "#2a2a2a" : "transparent",
                            color: !enabled ? "#444" : label === "All Files" ? "#fff" : "#888",
                            fontSize: 13, cursor: enabled ? "pointer" : "not-allowed",
                            width: "100%", textAlign: "left",
                        }}
                    >
                        <span className="material-symbols-outlined" style={{fontSize: 16}}>{icon}</span>
                        {label}
                    </button>
                ))}
            </div>

            {/* Bottom */}
            <div style={{borderTop: "1px solid #2a2a2a", paddingTop: 12, display: "flex", flexDirection: "column", gap: 1}}>
                <button type="button" style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "7px 10px", borderRadius: 6, border: "none",
                    background: "transparent", color: "#888", fontSize: 13, cursor: "pointer", width: "100%", textAlign: "left",
                }}>
                    <span className="material-symbols-outlined" style={{fontSize: 16}}>help_outline</span>
                    Help
                </button>
                <button type="button" onClick={onLogout} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "7px 10px", borderRadius: 6, border: "none",
                    background: "transparent", color: "#888", fontSize: 13, cursor: "pointer", width: "100%", textAlign: "left",
                }}>
                    <span className="material-symbols-outlined" style={{fontSize: 16}}>logout</span>
                    Sign out
                </button>
            </div>
        </nav>
    );
}

function CreateFolderModal({nestedDisabled, onClose, onCreate}) {
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        const onKeyDown = (e) => { if (e.key === "Escape" && !creating) onClose(); };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [creating, onClose]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const cleanName = name.trim();
        if (!cleanName) { setError("Folder name cannot be empty."); return; }
        if (cleanName === "." || cleanName === ".." || cleanName.includes("/") || cleanName.includes("\\")) {
            setError("Folder name contains invalid characters."); return;
        }
        setCreating(true); setError("");
        try { await onCreate(cleanName); }
        catch (err) { setError(err.message || "Failed to create folder."); }
        finally { setCreating(false); }
    };

    return (
        <div onClick={() => !creating && onClose()} style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.7)", display: "flex",
            alignItems: "center", justifyContent: "center",
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                background: "#1a1a1a", border: "1px solid #2a2a2a",
                borderRadius: 10, padding: 24, width: "100%", maxWidth: 420,
            }}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20}}>
                    <div>
                        <h2 style={{color: "#fff", fontSize: 16, fontWeight: 600, margin: 0}}>Create folder</h2>
                        <p style={{color: "#888", fontSize: 13, margin: "4px 0 0"}}>Enter a name for your new folder.</p>
                    </div>
                    <button onClick={onClose} disabled={creating} style={{background: "none", border: "none", color: "#888", cursor: "pointer", padding: 4}}>
                        <span className="material-symbols-outlined" style={{fontSize: 18}}>close</span>
                    </button>
                </div>

                {nestedDisabled && (
                    <div style={{background: "#2a2a2a", borderRadius: 6, padding: "8px 12px", marginBottom: 16, fontSize: 12, color: "#888"}}>
                        Nested folders aren't supported yet — folder will be created at top level.
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <input
                        type="text" value={name} onChange={e => { setName(e.target.value); setError(""); }}
                        placeholder="e.g. my-documents" autoFocus disabled={creating}
                        style={{
                            width: "100%", background: "#111", border: "1px solid #333",
                            borderRadius: 6, padding: "9px 12px", color: "#fff",
                            fontSize: 13, outline: "none", boxSizing: "border-box",
                        }}
                    />
                    {error && <p style={{color: "#F66", fontSize: 12, marginTop: 6}}>{error}</p>}
                    <div style={{display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20}}>
                        <button type="button" onClick={onClose} disabled={creating} style={{
                            background: "transparent", border: "1px solid #333",
                            borderRadius: 6, padding: "7px 14px", color: "#888",
                            fontSize: 13, cursor: "pointer",
                        }}>Cancel</button>
                        <button type="submit" disabled={creating} style={{
                            background: "#3ECF8E", border: "none", borderRadius: 6,
                            padding: "7px 14px", color: "#000", fontSize: 13,
                            fontWeight: 600, cursor: "pointer",
                        }}>{creating ? "Creating…" : "Create folder"}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const navigate = useNavigate();
    const [files, setFiles] = useState([]);
    const [folders, setFolders] = useState([]);
    const [currentFolder, setCurrentFolder] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [loadingFiles, setLoadingFiles] = useState(true);
    const [pageError, setPageError] = useState("");
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    const fetchFiles = useCallback(async () => {
        const token = getToken();
        if (!token) { navigate("/"); return; }
        setLoadingFiles(true); setPageError("");
        try {
            const response = await fetch(`${API_URL}/auth/files`, {
                headers: {Authorization: `Bearer ${token}`},
            });
            if (response.status === 401) { localStorage.removeItem("token"); navigate("/"); return; }
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "Failed to fetch files");
            const allFiles = Array.isArray(data) ? data : [];
            setFiles(allFiles);
            const uniqueFolders = [...new Set(
                allFiles.filter(f => f.name === ".__folder__").map(f => f.directory).filter(Boolean)
            )];
            setFolders(uniqueFolders);
        } catch (error) {
            setPageError(error.message || "Failed to load files.");
        } finally {
            setLoadingFiles(false);
        }
    }, [navigate]);

    useEffect(() => { fetchFiles(); }, [fetchFiles]);

    const downloadFile = async (fileId, filename) => {
        const token = getToken();
        if (!token) { navigate("/"); return; }
        try {
            const response = await fetch(`${API_URL}/auth/download/${fileId}`, {
                headers: {Authorization: `Bearer ${token}`},
            });
            if (!response.ok) throw new Error("Failed to download file.");
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) { alert(error.message); }
    };

    const deleteFile = async (fileId, filename) => {
        const token = getToken();
        if (!token) { navigate("/"); return; }
        if (!window.confirm(`Delete "${filename}"?`)) return;
        setDeletingId(fileId);
        try {
            const response = await fetch(`${API_URL}/auth/files/${fileId}`, {
                method: "DELETE", headers: {Authorization: `Bearer ${token}`},
            });
            if (!response.ok) throw new Error("Failed to delete file.");
            setFiles(prev => prev.filter(f => f.id !== fileId));
        } catch (error) { alert(error.message); }
        finally { setDeletingId(null); }
    };

    const createFolder = async (cleanName) => {
        const token = getToken();
        if (!token) { navigate("/"); return; }
        const response = await fetch(`${API_URL}/auth/create-folder`, {
            method: "POST",
            headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
            body: JSON.stringify({directory: cleanName}),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to create folder.");
        await fetchFiles();
        setShowFolderModal(false);
    };

    const visibleFolders = useMemo(() => folders.filter(fp => {
        if (!currentFolder) return !fp.includes("/");
        if (!fp.startsWith(`${currentFolder}/`)) return false;
        return !fp.slice(currentFolder.length + 1).includes("/");
    }), [folders, currentFolder]);

    const visibleFiles = useMemo(() =>
        files.filter(f => f.name !== ".__folder__" && (f.directory || "") === currentFolder),
    [files, currentFolder]);

    const filteredFiles = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return q ? visibleFiles.filter(f => f.name?.toLowerCase().includes(q)) : visibleFiles;
    }, [visibleFiles, searchQuery]);

    const filteredFolders = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return q ? visibleFolders.filter(fp => fp.split("/").pop()?.toLowerCase().includes(q)) : visibleFolders;
    }, [visibleFolders, searchQuery]);

    const isEmpty = filteredFiles.length === 0 && filteredFolders.length === 0;

    return (
        <div style={{display: "flex", height: "100vh", background: "#111", color: "#fff", fontFamily: "Inter, sans-serif"}}>
            <Sidebar
                onUpload={() => navigate("/upload")}
                onGoHome={() => { setCurrentFolder(""); setSearchQuery(""); }}
                onLogout={() => { localStorage.removeItem("token"); navigate("/"); }}
            />

            {/* Main */}
            <div style={{flex: 1, display: "flex", flexDirection: "column", overflow: "hidden"}}>
                {/* Top bar */}
                <div style={{
                    height: 56, borderBottom: "1px solid #2a2a2a",
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between", padding: "0 20px", flexShrink: 0,
                }}>
                    <div style={{position: "relative", width: 320}}>
                        <span className="material-symbols-outlined" style={{
                            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                            fontSize: 16, color: "#555",
                        }}>search</span>
                        <input
                            type="text" value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search files and folders..."
                            style={{
                                width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a",
                                borderRadius: 6, padding: "7px 12px 7px 34px", color: "#fff",
                                fontSize: 13, outline: "none", boxSizing: "border-box",
                            }}
                        />
                    </div>

                    <div style={{display: "flex", alignItems: "center", gap: 12}}>
                        <span style={{fontSize: 12, color: "#555"}}>{files.length} items</span>
                        <div style={{
                            width: 30, height: 30, borderRadius: "50%",
                            background: "#2a2a2a", display: "flex",
                            alignItems: "center", justifyContent: "center",
                        }}>
                            <span className="material-symbols-outlined" style={{fontSize: 16, color: "#888"}}>person</span>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div style={{flex: 1, overflow: "auto", padding: 24}}>
                    {/* Breadcrumb + actions */}
                    <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20}}>
                        <div style={{display: "flex", alignItems: "center", gap: 6}}>
                            {currentFolder ? (
                                <>
                                    <button onClick={() => { setCurrentFolder(""); setSearchQuery(""); }} style={{
                                        background: "none", border: "none", color: "#888",
                                        fontSize: 13, cursor: "pointer", padding: 0,
                                    }}>All Files</button>
                                    <span style={{color: "#444"}}>/</span>
                                    <span style={{fontSize: 13, color: "#fff"}}>{currentFolder}</span>
                                </>
                            ) : (
                                <span style={{fontSize: 14, fontWeight: 600, color: "#fff"}}>All Files</span>
                            )}
                        </div>

                        <div style={{display: "flex", gap: 8}}>
                            <button onClick={() => setShowFolderModal(true)} style={{
                                display: "flex", alignItems: "center", gap: 6,
                                background: "transparent", border: "1px solid #2a2a2a",
                                borderRadius: 6, padding: "7px 12px", color: "#ccc",
                                fontSize: 13, cursor: "pointer",
                            }}>
                                <span className="material-symbols-outlined" style={{fontSize: 15}}>create_new_folder</span>
                                New folder
                            </button>
                            <button onClick={() => navigate(`/upload?directory=${encodeURIComponent(currentFolder)}`)} style={{
                                display: "flex", alignItems: "center", gap: 6,
                                background: "#3ECF8E", border: "none",
                                borderRadius: 6, padding: "7px 12px", color: "#000",
                                fontSize: 13, fontWeight: 600, cursor: "pointer",
                            }}>
                                <span className="material-symbols-outlined" style={{fontSize: 15}}>upload</span>
                                Upload
                            </button>
                        </div>
                    </div>

                    {currentFolder && (
                        <button onClick={() => {
                            const parts = currentFolder.split("/");
                            parts.pop();
                            setCurrentFolder(parts.join("/"));
                        }} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            background: "none", border: "none", color: "#888",
                            fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 16,
                        }}>
                            <span className="material-symbols-outlined" style={{fontSize: 15}}>arrow_back</span>
                            Back
                        </button>
                    )}

                    {pageError && (
                        <div style={{
                            background: "#2a1515", border: "1px solid #5a2020",
                            borderRadius: 6, padding: "10px 14px", marginBottom: 16,
                            fontSize: 13, color: "#F66", display: "flex",
                            justifyContent: "space-between", alignItems: "center",
                        }}>
                            <span>{pageError}</span>
                            <button onClick={fetchFiles} style={{background: "none", border: "none", color: "#F66", cursor: "pointer", fontSize: 12, textDecoration: "underline"}}>Retry</button>
                        </div>
                    )}

                    {loadingFiles ? (
                        <div style={{display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "#555", gap: 10, fontSize: 13}}>
                            <span className="material-symbols-outlined" style={{fontSize: 20, animation: "spin 1s linear infinite"}}>progress_activity</span>
                            Loading…
                        </div>
                    ) : isEmpty ? (
                        <div style={{display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 360, gap: 12}}>
                            <div style={{
                                width: 60, height: 60, borderRadius: "50%",
                                background: "#1a1a1a", border: "1px solid #2a2a2a",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                <span className="material-symbols-outlined" style={{fontSize: 28, color: "#444"}}>folder_open</span>
                            </div>
                            <p style={{color: "#fff", fontSize: 15, fontWeight: 500, margin: 0}}>
                                {searchQuery ? "No results found" : "No files yet"}
                            </p>
                            <p style={{color: "#555", fontSize: 13, margin: 0}}>
                                {searchQuery ? "Try a different search term." : "Upload a file or create a folder to get started."}
                            </p>
                            {!searchQuery && (
                                <div style={{display: "flex", gap: 8, marginTop: 4}}>
                                    <button onClick={() => setShowFolderModal(true)} style={{
                                        background: "transparent", border: "1px solid #2a2a2a",
                                        borderRadius: 6, padding: "7px 14px", color: "#ccc",
                                        fontSize: 13, cursor: "pointer",
                                    }}>New folder</button>
                                    <button onClick={() => navigate(`/upload?directory=${encodeURIComponent(currentFolder)}`)} style={{
                                        background: "#3ECF8E", border: "none", borderRadius: 6,
                                        padding: "7px 14px", color: "#000", fontSize: 13,
                                        fontWeight: 600, cursor: "pointer",
                                    }}>Upload file</button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Folders grid */}
                            {filteredFolders.length > 0 && (
                                <div style={{marginBottom: 28}}>
                                    <p style={{fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, fontWeight: 600}}>Folders</p>
                                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8}}>
                                        {filteredFolders.map(fp => (
                                            <button key={fp} onClick={() => { setCurrentFolder(fp); setSearchQuery(""); }} style={{
                                                background: "#1a1a1a", border: "1px solid #2a2a2a",
                                                borderRadius: 8, padding: "14px 14px 12px",
                                                textAlign: "left", cursor: "pointer",
                                                transition: "border-color 0.15s",
                                            }}
                                                onMouseEnter={e => e.currentTarget.style.borderColor = "#3ECF8E"}
                                                onMouseLeave={e => e.currentTarget.style.borderColor = "#2a2a2a"}
                                            >
                                                <span className="material-symbols-outlined" style={{fontSize: 28, color: "#3ECF8E", fontVariationSettings: "'FILL' 1", display: "block", marginBottom: 8}}>folder</span>
                                                <p style={{fontSize: 12, color: "#ccc", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{fp.split("/").pop()}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Files table */}
                            {filteredFiles.length > 0 && (
                                <div>
                                    <p style={{fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, fontWeight: 600}}>Files</p>
                                    <div style={{background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, overflow: "hidden"}}>
                                        {/* Table header */}
                                        <div style={{
                                            display: "grid", gridTemplateColumns: "1fr 140px 120px 80px",
                                            padding: "8px 16px", borderBottom: "1px solid #2a2a2a",
                                        }}>
                                            {["Name", "Location", "Data center", ""].map((h, i) => (
                                                <span key={i} style={{fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8}}>{h}</span>
                                            ))}
                                        </div>

                                        {filteredFiles.map((file, index) => {
                                            const {icon, color} = getFileIcon(file.name);
                                            const isDeleting = deletingId === file.id;
                                            return (
                                                <div key={file.id}
                                                    style={{
                                                        display: "grid", gridTemplateColumns: "1fr 140px 120px 80px",
                                                        padding: "10px 16px", alignItems: "center",
                                                        borderBottom: index < filteredFiles.length - 1 ? "1px solid #222" : "none",
                                                        transition: "background 0.1s",
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = "#212121"}
                                                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                                >
                                                    <div style={{display: "flex", alignItems: "center", gap: 10, minWidth: 0}}>
                                                        <span className="material-symbols-outlined" style={{fontSize: 18, color, flexShrink: 0}}>{icon}</span>
                                                        <span style={{fontSize: 13, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{file.name}</span>
                                                    </div>
                                                    <span style={{fontSize: 12, color: "#555"}}>{file.directory || "Root"}</span>
                                                    <span style={{
                                                        display: "inline-block", fontSize: 11,
                                                        background: "#111", border: "1px solid #2a2a2a",
                                                        borderRadius: 4, padding: "2px 8px", color: "#888",
                                                    }}>{file.data_center || "—"}</span>
                                                    <div style={{display: "flex", justifyContent: "flex-end", gap: 4}}>
                                                        <button onClick={() => downloadFile(file.id, file.name)} title="Download" style={{
                                                            background: "none", border: "none", color: "#555",
                                                            cursor: "pointer", padding: 4, borderRadius: 4,
                                                            display: "flex", alignItems: "center",
                                                        }}
                                                            onMouseEnter={e => e.currentTarget.style.color = "#3ECF8E"}
                                                            onMouseLeave={e => e.currentTarget.style.color = "#555"}
                                                        >
                                                            <span className="material-symbols-outlined" style={{fontSize: 16}}>download</span>
                                                        </button>
                                                        <button onClick={() => deleteFile(file.id, file.name)} disabled={isDeleting} title="Delete" style={{
                                                            background: "none", border: "none", color: "#555",
                                                            cursor: "pointer", padding: 4, borderRadius: 4,
                                                            display: "flex", alignItems: "center",
                                                        }}
                                                            onMouseEnter={e => e.currentTarget.style.color = "#F66"}
                                                            onMouseLeave={e => e.currentTarget.style.color = "#555"}
                                                        >
                                                            <span className="material-symbols-outlined" style={{fontSize: 16}}>{isDeleting ? "progress_activity" : "delete"}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {showFolderModal && (
                <CreateFolderModal
                    nestedDisabled={Boolean(currentFolder)}
                    onClose={() => setShowFolderModal(false)}
                    onCreate={createFolder}
                />
            )}

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                * { box-sizing: border-box; }
                input::placeholder { color: #444; }
                button { font-family: inherit; }
            `}</style>
        </div>
    );
}