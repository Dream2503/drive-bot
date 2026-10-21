import {FILE_ICONS} from "./constants.js";

/** Stable key for storing per-view selection snapshots. */
export function makeSelectionViewKey(pathname, activeTab, searchQuery) {
    return JSON.stringify([pathname, activeTab, searchQuery]);
}

/** Select the icon/color pair for a file extension. */
export function getFileIcon(filename) {
    const extension = filename?.split(".").pop()?.toLowerCase();
    return FILE_ICONS[extension] || FILE_ICONS.default;
}

/** Format a date for display, returning a placeholder for invalid dates. */
export function formatDate(dateStr) {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"});
}

/** Return the supported preview category for a filename. */
export function getFileKind(filename) {
    const ext = filename?.split(".").pop()?.toLowerCase();
    if (["mp4", "mkv", "webm", "mov", "m4v"].includes(ext)) return "video";
    if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext)) return "audio";
    if (ext === "pdf") return "pdf";
    if (["md", "markdown", "mdown", "mkd"].includes(ext)) return "markdown";
    if (["txt", "text", "log", "csv", "tsv", "json", "jsonl", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "html", "htm", "css", "scss", "sass", "js", "jsx", "mjs", "cjs", "ts", "tsx", "py", "pyw", "ipynb", "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "hxx", "rs", "go", "java", "kt", "kts", "swift", "rb", "php", "sh", "bash", "zsh", "fish", "sql", "r", "lua", "pl", "pm", "ex", "exs", "erl", "hrl", "hs", "lhs", "scala", "sc", "dart", "vue", "svelte", "graphql", "gql", "proto", "make", "cmake", "dockerfile", "gitignore", "editorconfig", "diff", "patch", "properties", "gradle",].includes(ext)) return "text";
    return null;
}

/** Format a byte count using binary units. */
export function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/** Read the current bearer token from browser storage. */
export function getToken() {
    return localStorage.getItem("token");
}

/** Convert a stored folder path into its dashboard route. */
export function folderPathToRoute(folderPath) {
    const segments = (folderPath || "").split("/").filter(Boolean);
    const relativeSegments = segments[0] === "home" ? segments.slice(1) : segments;
    return `/home${relativeSegments.length ? `/${relativeSegments.map(encodeURIComponent).join("/")}` : ""}`;
}

/** Decode a URL path segment without failing on malformed percent escapes. */
export function decodePathSegment(segment) {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}
