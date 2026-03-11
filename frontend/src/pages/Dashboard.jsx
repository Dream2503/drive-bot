import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {

    const navigate = useNavigate();

    const [file, setFile] = useState(null);
    const [uploadedSize, setUploadedSize] = useState(0);

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const handleUpload = async () => {

        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);

        try {

            const response = await fetch("http://127.0.0.1:8000/auth/upload", {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                throw new Error("Upload failed");
            }

            const sizeMB = file.size / (1024 * 1024);
            setUploadedSize(prev => prev + sizeMB);

            setFile(null);

        } catch (err) {
            alert(err.message);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">

            <h1 className="text-3xl font-bold mb-8">
                Dashboard
            </h1>


            <div className="bg-white shadow-md rounded-xl p-6 mb-6">

                <h2 className="text-xl font-semibold mb-4">
                    Upload File
                </h2>

                <input
                    type="file"
                    onChange={handleFileChange}
                    className="mb-4"
                />

                <button
                    onClick={handleUpload}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
                >
                    Upload
                </button>

            </div>

            <div className="bg-white shadow-md rounded-xl p-6 mb-6">

                <h2 className="text-xl font-semibold mb-4">
                    Monthly Usage
                </h2>

                <p>Total Uploaded:</p>

                <p className="text-3xl font-bold text-indigo-600 mt-2">
                    {uploadedSize.toFixed(2)} MB
                </p>

            </div>

            <div className="bg-white shadow-md rounded-xl p-6">

                <h2 className="text-xl font-semibold mb-4">
                    Your Files
                </h2>

                <p className="mb-4">
                    View all uploaded files and download them.
                </p>

                <button
                    onClick={() => navigate("/files")}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                >
                    View Files
                </button>

            </div>

        </div>
    );
}