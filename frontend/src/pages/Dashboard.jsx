import { useEffect, useState } from "react";

export default function Dashboard() {

    const [files, setFiles] = useState([]);
    const [file, setFile] = useState(null);
    const [dataCenter, setDataCenter] = useState("discord");

    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        fetchFiles();
    }, []);

    const fetchFiles = async () => {

        try {

            const token = localStorage.getItem("token");

            const res = await fetch("http://127.0.0.1:8000/auth/files", {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!res.ok) throw new Error("Failed to fetch files");

            const data = await res.json();
            setFiles(data);

        } catch (err) {
            console.error(err);
        }
    };

    const handleUpload = async () => {

        if (!file) {
            alert("Please select a file first");
            return;
        }

        const token = localStorage.getItem("token");

        const formData = new FormData();
        formData.append("file", file);
        formData.append("data_center", dataCenter);

        setUploading(true);
        setProgress(0);

        try {

            const response = await fetch(
                "http://127.0.0.1:8000/auth/upload",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    body: formData
                }
            );

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {

                const { done, value } = await reader.read();

                if (done) break;

                const text = decoder.decode(value);
                const lines = text.split("\n");

                for (const line of lines) {

                    if (!line.trim()) continue;

                    const data = JSON.parse(line);

                    if (data.progress !== undefined) {
                        setProgress(data.progress);
                    }

                }
            }

            setUploading(false);
            setProgress(100);
            setFile(null);

            fetchFiles();

        } catch (err) {

            console.error(err);
            alert("Upload failed");
            setUploading(false);

        }
    };

    return (

        <div className="min-h-screen bg-gray-100 p-8">

            <h1 className="text-3xl font-bold mb-8">
                DriveBot Dashboard
            </h1>

            {/* Upload Section */}

            <div className="bg-white shadow rounded-xl p-6 mb-8">

                <h2 className="text-xl font-semibold mb-4">
                    Upload File
                </h2>

                <input
                    type="file"
                    onChange={(e) => setFile(e.target.files[0])}
                    className="mb-4"
                />

                <select
                    value={dataCenter}
                    onChange={(e) => setDataCenter(e.target.value)}
                    className="border p-2 rounded mb-4 w-full"
                >
                    <option value="discord">Discord</option>
                    <option value="telegram">Telegram</option>
                </select>

                <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                    {uploading ? "Uploading..." : "Upload"}
                </button>

                {uploading && (

                    <div className="mt-6">

                        <div className="w-full bg-gray-200 h-3 rounded">

                            <div
                                className="bg-indigo-600 h-3 rounded transition-all"
                                style={{ width: `${progress}%` }}
                            />

                        </div>

                        <p className="text-sm text-gray-600 mt-2">
                            Uploading to {dataCenter} : {progress.toFixed(1)}%
                        </p>

                    </div>

                )}

            </div>

            {/* Files Section */}

            <div className="bg-white shadow rounded-xl p-6">

                <h2 className="text-xl font-semibold mb-4">
                    Uploaded Files
                </h2>

                {files.length === 0 ? (

                    <p className="text-gray-500">
                        No files uploaded yet
                    </p>

                ) : (

                    <div className="grid grid-cols-5 gap-4">

                        {files.map((file) => (

                            <div
                                key={file.id}
                                className="p-4 border rounded hover:bg-gray-50"
                            >
                                <p className="text-lg">📄</p>
                                <p className="text-sm truncate">
                                    {file.name}
                                </p>
                            </div>

                        ))}

                    </div>

                )}

            </div>

        </div>

    );
}