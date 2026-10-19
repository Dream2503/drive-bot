import {useState} from "react";
import {useNavigate} from "react-router-dom";

// Supabase-style field styling
const labelClass = "block text-sm text-[#b4b4b4] mb-2";
const inputClass = "w-full h-[38px] rounded-md border border-[#363636] bg-white/[0.026] px-3 text-sm text-[#fafafa] placeholder:text-[#707070] outline-none transition-colors focus:border-[#707070] focus:ring-2 focus:ring-[#4d4d4d]/50";

export default function AuthPage() {
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({
        first_name: "", last_name: "", username: "", password: ""
    });
    const [message, setMessage] = useState("");
    const [messageIsError, setMessageIsError] = useState(true);
    const [loading, setLoading] = useState(false);

    const API_URL = window.STORELIMITLESS_CONFIG?.API_URL ?? import.meta.env.VITE_API_URL

    const handleChange = (e) => {
        setFormData((prev) => ({...prev, [e.target.name]: e.target.value}));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage("");
        setLoading(true);
        try {
            const endpoint = isLogin ? `${API_URL}/auth/login?username=${encodeURIComponent(formData.username)}&password=${encodeURIComponent(formData.password)}` : `${API_URL}/auth/register`;

            const bodyData = isLogin ? undefined : {...formData};

            const response = await fetch(endpoint, {
                method: "POST", headers: {"Content-Type": "application/json"}, ...(bodyData ? {body: JSON.stringify(bodyData)} : {}),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "Something went wrong");

            if (isLogin) {
                const [loginData, homeDirectory] = data;
                localStorage.setItem("token", loginData.access_token);
                navigate("/dashboard");
            } else {
                setIsLogin(true);
                setMessageIsError(false);
                setMessage("Registration successful. Please login.");
            }
        } catch (error) {
            setMessageIsError(true);
            setMessage(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (<div
        className="min-h-screen flex flex-col bg-[#171717] text-[#fafafa]"
        style={{fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"}}
    >
        {/* Header */}
        <header className="h-16 flex items-center px-6">
            <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-[#3ecf8e] flex items-center justify-center">
                    <span
                        className="material-symbols-outlined text-[#0f0f0f] text-[18px]"
                        style={{fontVariationSettings: "'FILL' 1"}}
                    >
                        cloud
                    </span>
                </div>
                <span className="text-[15px] font-medium tracking-tight">DriveBot</span>
            </div>
        </header>

        {/* Form */}
        <main className="flex-1 flex items-center justify-center px-6 pb-16">
            <div className="w-full max-w-[340px]">
                <h1 className="text-2xl font-medium tracking-tight">
                    {isLogin ? "Welcome back" : "Get started"}
                </h1>
                <p className="text-sm text-[#898989] mt-2 mb-8">
                    {isLogin ? "Sign in to your account" : "Create a new account"}
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLogin && (<>
                        <div>
                            <label htmlFor="first_name" className={labelClass}>First name</label>
                            <input
                                id="first_name"
                                type="text" name="first_name"
                                value={formData.first_name} onChange={handleChange} required
                                autoComplete="given-name"
                                className={inputClass}
                                placeholder="John"
                            />
                        </div>
                        <div>
                            <label htmlFor="last_name" className={labelClass}>Last name</label>
                            <input
                                id="last_name"
                                type="text" name="last_name"
                                value={formData.last_name} onChange={handleChange} required
                                autoComplete="family-name"
                                className={inputClass}
                                placeholder="Doe"
                            />
                        </div>
                    </>)}

                    <div>
                        <label htmlFor="username" className={labelClass}>Username</label>
                        <input
                            id="username"
                            type="text" name="username"
                            value={formData.username} onChange={handleChange} required
                            autoComplete="username"
                            className={inputClass}
                            placeholder="your_username"
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className={labelClass}>Password</label>
                        <input
                            id="password"
                            type="password" name="password"
                            value={formData.password} onChange={handleChange} required
                            autoComplete={isLogin ? "current-password" : "new-password"}
                            className={inputClass}
                            placeholder="••••••••"
                        />
                    </div>

                    {message && (<div
                        className={`flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm ${messageIsError ? "border-[#e5484d]/30 bg-[#e5484d]/10 text-[#ff6369]" : "border-[#3ecf8e]/30 bg-[#3ecf8e]/10 text-[#3ecf8e]"}`}
                    >
                        <span className="material-symbols-outlined text-[18px] mt-px">
                            {messageIsError ? "error" : "check_circle"}
                        </span>
                        <p>{message}</p>
                    </div>)}

                    <button
                        type="submit" disabled={loading}
                        className="w-full h-[38px] flex items-center justify-center gap-2 rounded-md border border-[#3ecf8e]/40 bg-[#006239] text-sm text-[#fafafa] transition-colors hover:border-[#3ecf8e]/70 hover:bg-[#007a46] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                    >
                        {loading && (<span className="material-symbols-outlined text-[16px] animate-spin">
                            autorenew
                        </span>)}
                        {loading ? "Processing..." : isLogin ? "Sign In" : "Sign Up"}
                    </button>
                </form>

                <p className="text-center mt-8 text-sm text-[#898989]">
                    {isLogin ? "Don't have an account?" : "Have an account?"}
                    <button
                        type="button"
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setMessage("");
                            setMessageIsError(true);
                        }}
                        className="ml-1.5 text-[#fafafa] underline underline-offset-4 decoration-[#4d4d4d] hover:decoration-[#fafafa] transition-colors"
                    >
                        {isLogin ? "Sign Up Now" : "Sign In Now"}
                    </button>
                </p>
            </div>
        </main>
    </div>);
}
