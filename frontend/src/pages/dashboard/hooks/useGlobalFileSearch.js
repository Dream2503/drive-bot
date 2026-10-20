import {useEffect, useState} from "react";
import {API_URL} from "../constants.js";
import {getToken} from "../utils.js";

/** Performs debounced recursive backend search for the current dashboard view. */
export default function useGlobalFileSearch(searchQuery, activeTab, navigate) {
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState("");

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


    return {searchResults, setSearchResults, searchLoading, searchError};
}
