import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ── Inline SVG icons (avoids dependency) ── */
const Ico = ({ d, size, color, className, strokeWidth = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
       className={className} style={{ color }}>
    <path d={d} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function DriveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect width="20" height="20" rx="4" fill="#3ecf8e" />
      <path d="M6 14l3-8 3 8" stroke="#0f0f0f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 11.5h4" stroke="#0f0f0f" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

const FolderIcon   = ({ size, active }) => <Ico size={size} d="M1 4a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" strokeWidth={active ? 2 : 1.5} className={active ? "text-sb-green" : "text-sb-text-3"} />;
const ClockIcon    = ({ size, active }) => <Ico size={size} d="M8 4v4l3 2M8 1.5a6.5 6.5 0 100 13A6.5 6.5 0 008 1.5z" className={active ? "text-sb-green" : "text-sb-text-3"} />;
const ShareIcon    = ({ size, active }) => <Ico size={size} d="M11 3a2 2 0 100 4M11 3a2 2 0 10-3.46 2L5 7.5M11 3l-3.46 2M5 7.5a2 2 0 100 4M5 7.5l3.46 2M8.46 9.5L11 11.5a2 2 0 100 4" className={active ? "text-sb-green" : "text-sb-text-3"} />;
const TrashIcon    = ({ size, active }) => <Ico size={size} d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M8 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" className={active ? "text-sb-green" : "text-sb-text-3"} />;
const TrashIconSm  = ({ size }) => <Ico size={size} d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M8 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" />;
const UploadIcon   = ({ size }) => <Ico size={size} d="M8 11V3M5 6l3-3 3 3M2 12v2a1 1 0 001 1h10a1 1 0 001-1v-2" />;
const LogoutIcon   = ({ size }) => <Ico size={size} d="M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" />;
const SearchIcon   = ({ size, className }) => <Ico size={size} className={className} d="M7 12A5 5 0 107 2a5 5 0 000 10zM14 14l-3-3" />;
const PlusIcon     = ({ size }) => <Ico size={size} d="M8 3v10M3 8h10" strokeWidth={2} />;
const BellIcon     = ({ size }) => <Ico size={size} d="M8 2a4 4 0 00-4 4v3l-1 1v1h10v-1l-1-1V6a4 4 0 00-4-4zM6 13a2 2 0 004 0" />;
const MenuIcon     = ({ size }) => <Ico size={size} d="M2 4h12M2 8h12M2 12h12" />;
const DatabaseIcon = ({ size, className }) => <Ico size={size} className={className} d="M8 3c3.3 0 6 .9 6 2s-2.7 2-6 2-6-.9-6-2 2.7-2 6-2zM2 5v3c0 1.1 2.7 2 6 2s6-.9 6-2V5M2 8v3c0 1.1 2.7 2 6 2s6-.9 6-2V8" />;
const FileIcon     = ({ size, color }) => <Ico size={size} color={color} d="M4 2h6l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zM10 2v4h4" />;
const ImageIcon    = ({ size, color }) => <Ico size={size} color={color} d="M2 3h12a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1zM1 10l4-4 3 3 2-2 4 4" />;
const VideoIcon    = ({ size, color }) => <Ico size={size} color={color} d="M1 4h10a1 1 0 011 1v6a1 1 0 01-1 1H1a1 1 0 01-1-1V5a1 1 0 011-1zM11 6l4-2v6l-4-2" />;
const TextIcon     = ({ size, color }) => <Ico size={size} color={color} d="M3 4h10M3 8h8M3 12h6" />;
const ArchiveIcon  = ({ size, color }) => <Ico size={size} color={color} d="M2 3h12a1 1 0 011 1v2a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1zM2 7v7a1 1 0 001 1h10a1 1 0 001-1V7M6 10h4" />;
const DownloadIcon = ({ size }) => <Ico size={size} d="M8 3v8M5 8l3 3 3-3M2 13v1a1 1 0 001 1h10a1 1 0 001-1v-1" />;

/* ── Icon map by extension ── */
const EXT_ICON = {
  pdf: { icon: FileIcon, color: "#f66061" },
  jpg: { icon: ImageIcon, color: "#e8912d" },
  jpeg:{ icon: ImageIcon, color: "#e8912d" },
  png: { icon: ImageIcon, color: "#e8912d" },
  mp4: { icon: VideoIcon, color: "#3ecf8e" },
  zip: { icon: ArchiveIcon, color: "#b4b4b4" },
  txt: { icon: TextIcon,  color: "#b4b4b4" },
};
function getExt(fname) { return fname?.split(".").pop()?.toLowerCase() || ""; }
function getIcon(fname) { return EXT_ICON[getExt(fname)] || { icon: FileIcon, color: "#898989" }; }

const NAV = [
  { id: "files",   label: "All Files",  Icon: FolderIcon },
  { id: "recent",  label: "Recent",     Icon: ClockIcon  },
  { id: "shared",  label: "Shared",     Icon: ShareIcon  },
  { id: "trash",   label: "Trash",      Icon: TrashIcon  },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [active, setActive] = useState("files");
  const [mobileNav, setMobileNav] = useState(false);

  const fetchFiles = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/auth/files", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchFiles(); }, []);

  const downloadFile = async (fid, fname) => {
    const res = await fetch(`http://127.0.0.1:8000/auth/download/${fid}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: fname }).click();
    URL.revokeObjectURL(url);
  };

  const logout = () => { localStorage.removeItem("token"); navigate("/"); };

  return (
    <div className="flex h-screen bg-sb-base text-sb-text overflow-hidden text-14">
      {/* ── Sidebar ── */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40
        flex flex-col w-[232px] bg-sb-canvas border-r border-sb-border
        transition-transform duration-200
        ${mobileNav ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        {/* Brand */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-sb-border flex-shrink-0">
          <DriveIcon />
          <span className="text-13 font-medium text-sb-text">DriveBot</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => { setActive(id); setMobileNav(false); }}
              className={`w-full flex items-center gap-2.5 px-3 h-8 rounded text-13 transition-colors text-left focus-green
                ${active === id
                  ? "bg-sb-elevated text-sb-text"
                  : "text-sb-text-3 hover:text-sb-text-2 hover:bg-sb-surface"
                }`}
            >
              <Icon size={14} active={active === id} />
              {label}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-sb-border px-2 py-3 flex flex-col gap-0.5">
          <button
            onClick={() => navigate("/upload")}
            className="w-full flex items-center gap-2.5 px-3 h-8 rounded text-13
                       text-sb-text-3 hover:text-sb-text-2 hover:bg-sb-surface transition-colors focus-green"
          >
            <UploadIcon size={14} />
            Upload files
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 h-8 rounded text-13
                       text-sb-text-3 hover:text-sb-red transition-colors focus-green"
          >
            <LogoutIcon size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileNav && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/60"
          onClick={() => setMobileNav(false)}
        />
      )}

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between gap-4 px-4 md:px-6 border-b border-sb-border flex-shrink-0 bg-sb-canvas">
          <div className="flex items-center gap-3 flex-1">
            <button
              className="md:hidden text-sb-text-3 hover:text-sb-text transition-colors focus-green rounded"
              onClick={() => setMobileNav(true)}
            >
              <MenuIcon size={16} />
            </button>
            {/* Search */}
            <div className="relative flex-1 max-w-xs hidden sm:block">
              <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sb-text-3" />
              <input
                placeholder="Search files…"
                className="w-full h-8 bg-sb-elevated border border-sb-border rounded pl-8 pr-3 text-13
                           text-sb-text placeholder:text-sb-text-3 focus:outline-none focus:border-sb-green
                           focus:shadow-focus transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/upload")}
              className="hidden sm:flex items-center gap-1.5 h-8 bg-sb-green text-[#0f0f0f] text-12 font-medium
                         rounded-full px-4 hover:bg-sb-green-dk transition-colors focus-green"
            >
              <PlusIcon size={12} />
              New upload
            </button>
            <button className="w-8 h-8 rounded bg-sb-elevated border border-sb-border flex items-center justify-center
                                text-sb-text-2 hover:border-sb-border-hi hover:text-sb-text transition-colors focus-green">
              <BellIcon size={14} />
            </button>
            <div className="w-7 h-7 rounded bg-sb-green/10 border border-sb-green/20 flex items-center justify-center ml-1">
              <span className="text-11 text-sb-green font-medium font-mono">U</span>
            </div>
          </div>
        </header>

        {/* Canvas */}
        <main className="flex-1 overflow-y-auto bg-sb-base">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
            {/* Page header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-1.5 text-12 text-sb-text-3 font-mono mb-1">
                  <span>drivebot</span>
                  <span>/</span>
                  <span className="text-sb-text-2">files</span>
                </div>
                <h1 className="text-20 font-medium text-sb-text">All Files</h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate("/upload")}
                  className="flex items-center gap-1.5 h-8 bg-sb-green text-[#0f0f0f] text-12 font-medium
                             rounded-full px-4 hover:bg-sb-green-dk transition-colors focus-green"
                >
                  <PlusIcon size={12} />
                  New upload
                </button>
              </div>
            </div>

            {/* Storage bar */}
            <div className="bg-sb-surface border border-sb-border rounded-md p-4 mb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <DatabaseIcon size={14} className="text-sb-text-3 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-12 text-sb-text-2">Storage used</span>
                    <span className="text-12 font-mono text-sb-text-3">3.2 GB / 5 GB</span>
                  </div>
                  <div className="h-1 bg-sb-elevated rounded-full overflow-hidden">
                    <div className="h-full bg-sb-green rounded-full" style={{ width: "64%" }} />
                  </div>
                </div>
              </div>
              <button className="text-12 text-sb-green hover:underline underline-offset-2 flex-shrink-0 focus-green rounded-sm">
                Upgrade
              </button>
            </div>

            {/* Files table */}
            {files.length === 0 ? (
              <EmptyState onUpload={() => navigate("/upload")} />
            ) : (
              <div className="bg-sb-surface border border-sb-border rounded-md overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-12 gap-3 px-4 h-9 items-center
                                border-b border-sb-border bg-sb-canvas">
                  <div className="col-span-6 text-11 font-mono uppercase tracking-wider text-sb-text-3">Name</div>
                  <div className="col-span-3 hidden md:block text-11 font-mono uppercase tracking-wider text-sb-text-3">Data Center</div>
                  <div className="col-span-3 hidden md:block text-11 font-mono uppercase tracking-wider text-sb-text-3">Type</div>
                  <div className="col-span-6 md:col-span-0 md:hidden" />
                </div>

                {/* Rows */}
                {files.map((file, i) => {
                  const { icon: FileIconComp, color } = getIcon(file.fname);
                  const ext = getExt(file.fname).toUpperCase() || "FILE";
                  return (
                    <div
                      key={file.fid}
                      className={`grid grid-cols-12 gap-3 px-4 h-12 items-center group
                                  transition-colors hover:bg-sb-elevated cursor-default
                                  ${i < files.length - 1 ? "border-b border-sb-border" : ""}`}
                    >
                      {/* Name */}
                      <div className="col-span-9 md:col-span-6 flex items-center gap-2.5 min-w-0">
                        <FileIconComp size={14} color={color} />
                        <span className="text-13 text-sb-text truncate group-hover:text-sb-green transition-colors">
                          {file.fname}
                        </span>
                      </div>

                      {/* Data center */}
                      <div className="col-span-3 hidden md:flex items-center">
                        {file.data_center && (
                          <span className="text-11 font-mono bg-sb-elevated border border-sb-border
                                           text-sb-text-3 px-2 py-0.5 rounded">
                            {file.data_center}
                          </span>
                        )}
                      </div>

                      {/* Type chip */}
                      <div className="col-span-2 hidden md:block">
                        <span className="text-11 font-mono text-sb-text-3">{ext}</span>
                      </div>

                      {/* Actions */}
                      <div className="col-span-3 md:col-span-1 flex items-center justify-end gap-0.5
                                      opacity-0 group-hover:opacity-100 transition-opacity">
                        <IconBtn
                          title="Download"
                          onClick={() => downloadFile(file.fid, file.fname)}
                        >
                          <DownloadIcon size={13} />
                        </IconBtn>
                        <IconBtn title="Delete" danger>
                          <TrashIconSm size={13} />
                        </IconBtn>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function EmptyState({ onUpload }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-12 h-12 bg-sb-surface border border-sb-border rounded-lg flex items-center justify-center mb-4">
        <FolderIcon size={20} />
      </div>
      <p className="text-14 text-sb-text-2 mb-1">No files yet</p>
      <p className="text-13 text-sb-text-3 mb-6">Upload your first file to get started.</p>
      <button
        onClick={onUpload}
        className="flex items-center gap-1.5 h-8 bg-sb-green text-[#0f0f0f] text-12 font-medium
                   rounded-full px-4 hover:bg-sb-green-dk transition-colors focus-green"
      >
        <PlusIcon size={12} />
        Upload a file
      </button>
    </div>
  );
}

function IconBtn({ children, onClick, danger, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded transition-colors focus-green
        ${danger
          ? "text-sb-text-3 hover:text-sb-red hover:bg-sb-red-dim"
          : "text-sb-text-3 hover:text-sb-text hover:bg-sb-elevated"
        }`}
    >
      {children}
    </button>
  );
}