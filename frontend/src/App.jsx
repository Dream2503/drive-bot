import {BrowserRouter, Route, Routes} from "react-router-dom";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/Dashboard";
import UploadPage from "./pages/upFiles";
import ViewPage from "./pages/ViewPage";

function App() {
    return (<BrowserRouter>
        <Routes>
            <Route path="/" element={<AuthPage/>}/>
            <Route path="/dashboard" element={<DashboardPage/>}/>
            <Route path="/upload" element={<UploadPage/>}/>
            <Route path="/view/:fileId" element={<ViewPage/>}/>
        </Routes>
    </BrowserRouter>);
}

export default App;