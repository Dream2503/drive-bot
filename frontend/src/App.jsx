import {BrowserRouter, Navigate, Route, Routes, useSearchParams} from "react-router-dom";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/Dashboard";
import UploadPage from "./pages/upFiles";
import ViewPage from "./pages/ViewPage";

/**
 * Convert a stored folder path into the dashboard route format.
 * @param {string} directory
 * @returns {string}
 */
function directoryToRoute(directory) {
    const segments = (directory || "/home").split("/").filter(Boolean);
    const relativeSegments = segments[0] === "home" ? segments.slice(1) : segments;
    return `/home${relativeSegments.length ? `/${relativeSegments.map(encodeURIComponent).join("/")}` : ""}`;
}

/**
 * Redirect legacy dashboard URLs to the corresponding folder route.
 * @returns {import("react").ReactElement}
 */
function LegacyDashboardRedirect() {
    const [searchParams] = useSearchParams();
    return <Navigate to={directoryToRoute(searchParams.get("directory") || "/home")} replace/>;
}

/**
 * Declare the client-side routes for authentication, browsing, uploading, and previews.
 * @returns {import("react").ReactElement}
 */
function App() {
    return (<BrowserRouter>
        <Routes>
            <Route path="/" element={<AuthPage/>}/>
            <Route path="/home" element={<DashboardPage/>}/>
            <Route path="/home/*" element={<DashboardPage/>}/>
            <Route path="/dashboard" element={<LegacyDashboardRedirect/>}/>
            <Route path="/upload" element={<UploadPage/>}/>
            <Route path="/view/:fileId" element={<ViewPage/>}/>
        </Routes>
    </BrowserRouter>);
}

export default App;