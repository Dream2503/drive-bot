import {useCallback, useEffect, useRef, useState} from "react";
import {API_URL} from "../constants.js";
import {getToken} from "../utils.js";

/** Owns directory file/folder state and account storage metadata. */
export default function useDashboardData(currentFolder, navigate) {
    const [files, setFiles] = useState([]);
    const [folders, setFolders] = useState([]);
    const [storageUsed, setStorageUsed] = useState(null);
    const [loadingFiles, setLoadingFiles] = useState(true);
    const [loadedFolder, setLoadedFolder] = useState(null);
    const [pageError, setPageError] = useState("");
    const currentFolderRef = useRef(currentFolder);
    currentFolderRef.current = currentFolder;
    const fileFetchSequenceRef = useRef(0);

    /* -------------------------- fetch metadata ------------------------- */

    /**
     * Fetch account storage usage without blocking file browsing.
     * @returns {Promise<void>}
     */
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

    /**
     * Load the current directory and trash while preventing stale responses from overwriting newer navigation.
     * @returns {Promise<void>}
     */
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


    useEffect(() => {
        void fetchFiles();
    }, [fetchFiles, currentFolder]);

    return {
        files, setFiles, folders, setFolders, storageUsed, loadingFiles, loadedFolder, pageError, setPageError, fetchFiles,
    };
}
