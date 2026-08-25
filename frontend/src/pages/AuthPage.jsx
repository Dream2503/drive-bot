import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AuthPage() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    first_name: "", last_name: "", username: "", password: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setFormData((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const endpoint = isLogin
        ? "http://127.0.0.1:8000/auth/login"
        : "http://127.0.0.1:8000/auth/register";
      const body = isLogin
        ? { username: formData.username, password: formData.password }
        : { ...formData };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Something went wrong");
      if (isLogin) {
        localStorage.setItem("token", data.access_token);
        navigate("/dashboard");
      } else {
        setIsLogin(true);
        setMessage("Account created. Sign in to continue.");
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sb-base flex flex-col">
      {/* Top bar */}
      <header className="h-14 border-b border-sb-border flex items-center px-6">
        <div className="flex items-center gap-2">
          <DriveIcon />
          <span className="text-14 font-medium text-sb-text">DriveBot</span>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-[360px]">
          {/* Heading */}
          <h1 className="text-20 font-medium text-sb-text mb-1">
            {isLogin ? "Sign in to DriveBot" : "Create your account"}
          </h1>
          <p className="text-13 text-sb-text-3 mb-6">
            {isLogin
              ? "Enter your credentials to access your files."
              : "Fill in the details below to get started."}
          </p>

          {/* Card */}
          <div className="bg-sb-surface border border-sb-border rounded-md p-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {!isLogin && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name" name="first_name" value={formData.first_name} onChange={handleChange} placeholder="Jane" />
                  <Field label="Last name"  name="last_name"  value={formData.last_name}  onChange={handleChange} placeholder="Smith" />
                </div>
              )}
              <Field label="Username" name="username" value={formData.username} onChange={handleChange} placeholder="your_handle" />
              <Field label="Password" name="password" type="password" value={formData.password} onChange={handleChange} placeholder="••••••••••" />

              {message && (
                <div className={`text-12 px-3 py-2 rounded border ${
                  message.includes("created") || message.includes("successful")
                    ? "bg-sb-green-dim border-sb-green/20 text-sb-green"
                    : "bg-sb-red-dim border-sb-red/20 text-sb-red"
                }`}>
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 h-9 bg-sb-green text-[#0f0f0f] text-13 font-medium rounded-full
                           hover:bg-sb-green-dk transition-colors focus-green disabled:opacity-50
                           disabled:cursor-not-allowed"
              >
                {loading ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
              </button>
            </form>
          </div>

          {/* Toggle */}
          <p className="text-center text-13 text-sb-text-3 mt-4">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            {" "}
            <button
              onClick={() => { setIsLogin(!isLogin); setMessage(""); }}
              className="text-sb-green hover:underline underline-offset-2 focus-green rounded-sm"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Shared sub-components ── */

function Field({ label, name, type = "text", value, onChange, placeholder }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-12 text-sb-text-2 font-mono uppercase tracking-wider">
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required
        className="h-9 bg-sb-canvas border border-sb-border rounded px-3 text-13 text-sb-text
                   placeholder:text-sb-text-3 focus:outline-none focus:border-sb-green
                   focus:shadow-focus transition-colors"
      />
    </div>
  );
}

function DriveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect width="20" height="20" rx="4" fill="#3ecf8e" />
      <path d="M6 14l3-8 3 8" stroke="#0f0f0f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 11.5h4" stroke="#0f0f0f" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}