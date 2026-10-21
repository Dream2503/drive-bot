import {useEffect, useState} from "react";
import {API_URL} from "../constants.js";
import {getToken} from "../utils.js";

/** Polls the authenticated account's Redis-backed jobs so the tray is shared across devices. */
export default function useUploadJobs(refreshDirectory) {
    const [uploadJobs, setUploadJobs] = useState([]);

    useEffect(() => {
        let cancelled = false;
        let polling = false;

        const authenticatedFetch = (url, options = {}) => {
            const token = getToken();
            if (!token) return Promise.resolve(null);
            return fetch(url, {
                ...options, headers: {
                    ...(options.headers || {}), Authorization: `Bearer ${token}`,
                }, cache: "no-store",
            });
        };

        const removeServerJob = async (jobId) => {
            try {
                await authenticatedFetch(`${API_URL}/auth/upload-jobs/${encodeURIComponent(jobId)}`, {
                    method: "DELETE",
                });
            } catch (error) {
                console.error("Could not dismiss shared upload job:", error);
            }
        };

        const refreshUploadJobs = async () => {
            if (polling || cancelled) return;
            polling = true;

            try {
                const response = await authenticatedFetch(`${API_URL}/auth/upload-jobs`);
                if (!response) {
                    if (!cancelled) setUploadJobs([]);
                    return;
                }

                if (response.status === 401 || response.status === 403) {
                    if (!cancelled) setUploadJobs([]);
                    return;
                }
                if (!response.ok) return;

                const payload = await response.json();
                if (!Array.isArray(payload.jobs)) return;

                const serverJobs = payload.jobs.map((job) => {
                    const transfer = Number.isFinite(Number(job.transfer)) ? Number(job.transfer) : 0;
                    const total = Number.isFinite(Number(job.total)) ? Number(job.total) : 0;
                    const status = ["uploading", "completed", "error", "cancelled"].includes(job.status) ? job.status : "uploading";
                    const progress = status === "completed" ? 100 : total > 0 ? Math.max(0, Math.min(99, transfer / total * 100)) : 0;

                    return {
                        jobId: String(job.job_id),
                        name: String(job.name || "Upload"),
                        kind: job.kind === "file" ? "file" : "link",
                        directory: String(job.directory || "/home"),
                        dataCenter: String(job.data_center || ""),
                        status,
                        progress,
                        transfer,
                        total,
                        message: String(job.message || (status === "error" ? "Upload failed" : "Uploading")),
                        createdAt: Number(job.created_at) || 0,
                    };
                });

                // Completed jobs keep the existing behavior: refresh the destination and
                // remove the terminal job from the shared index so it disappears on all devices.
                const terminalJobs = serverJobs.filter((job) => job.status === "completed" || job.status === "cancelled");
                const visibleJobs = serverJobs.filter((job) => job.status !== "completed" && job.status !== "cancelled");
                if (!cancelled) setUploadJobs(visibleJobs);

                const completedJobs = terminalJobs.filter((job) => job.status === "completed");
                const completedDirectories = new Set(completedJobs.map((job) => job.directory || "/home"));
                await Promise.all([...completedDirectories].map(async (directory) => {
                    try {
                        await refreshDirectory(directory);
                    } catch (error) {
                        console.error("Failed to sync a completed upload into the local tree:", error);
                    }
                }));

                await Promise.all(terminalJobs.map((job) => removeServerJob(job.jobId)));
            } catch (error) {
                // Keep the last known tray when a temporary network/tunnel issue occurs.
                console.error("Could not refresh shared upload jobs:", error);
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
    }, [refreshDirectory]);

    /** Dismiss a job for this account, synchronizing the removal across its devices. */
    const dismissUploadJob = (jobId) => {
        setUploadJobs((current) => current.filter((job) => job.jobId !== jobId));
        const token = getToken();
        if (!token) return;
        void fetch(`${API_URL}/auth/upload-jobs/${encodeURIComponent(jobId)}`, {
            method: "DELETE", headers: {Authorization: `Bearer ${token}`}, cache: "no-store",
        }).catch((error) => console.error("Could not dismiss upload job:", error));
    };

    /** Cancel the server-side job and abort this browser's active chunk requests when present. */
    const cancelUploadJob = (jobId) => {
        const transfer = window.__storeLimitlessUploadTransfers?.get(jobId);
        if (transfer) {
            transfer.cancelToken.cancelled = true;
            for (const xhr of transfer.xhrs || []) xhr.abort();
            window.__storeLimitlessUploadTransfers.delete(jobId);
        }

        setUploadJobs((current) => current.filter((job) => job.jobId !== jobId));
        const token = getToken();
        if (!token) return;
        void fetch(`${API_URL}/auth/upload-jobs/${encodeURIComponent(jobId)}/cancel`, {
            method: "POST", headers: {Authorization: `Bearer ${token}`}, cache: "no-store",
        }).then(async (response) => {
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.detail || `Could not cancel upload (${response.status})`);
            }
        }).catch((error) => {
            console.error("Could not cancel shared upload job:", error);
        });
    };

    return {uploadJobs, dismissUploadJob, cancelUploadJob};
}
