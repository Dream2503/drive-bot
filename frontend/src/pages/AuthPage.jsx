import {useState} from "react";
import {useNavigate} from "react-router-dom";

export default function AuthPage() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    first_name: "", last_name: "", username: "", password: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

<<<<<<< HEAD
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
=======
    const handleChange = (e) => {
        setFormData((prev) => ({...prev, [e.target.name]: e.target.value}));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage("");
        setLoading(true);
        try {
            const endpoint = isLogin ? "http://127.0.0.1:8000/auth/login" : "http://127.0.0.1:8000/auth/register";
            const bodyData = isLogin ? {username: formData.username, password: formData.password} : {...formData};
            const response = await fetch(endpoint, {
                method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(bodyData),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "Something went wrong");
            if (isLogin) {
                localStorage.setItem("token", data.access_token);
                navigate("/dashboard");
            } else {
                setIsLogin(true);
                setMessage("Registration successful. Please login.");
            }
        } catch (error) {
            setMessage(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (<div className="min-h-screen flex items-center justify-center bg-background px-4">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]"/>
        </div>

        <div className="relative w-full max-w-md">
            {/* Logo */}
            <div className="flex items-center justify-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-primary" style={{fontVariationSettings: "'FILL' 1"}}>cloud</span>
                </div>
                <h1 className="text-2xl font-bold text-primary">DriveBot</h1>
            </div>

            {/* Card */}
            <div className="glass-panel rounded-2xl p-8 card-shadow border border-outline-variant/20">
                <h2 className="text-xl font-semibold text-on-surface mb-1">
                    {isLogin ? "Welcome back" : "Create your account"}
                </h2>
                <p className="text-sm text-on-surface-variant mb-6">
                    {isLogin ? "Sign in to access your files." : "Join DriveBot to manage your files."}
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLogin && (<div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-on-surface-variant mb-1 uppercase tracking-widest">First
                                Name</label>
                            <input
                                type="text" name="first_name"
                                value={formData.first_name} onChange={handleChange} required
                                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-on-surface-variant/40"
                                placeholder="John"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-on-surface-variant mb-1 uppercase tracking-widest">Last
                                Name</label>
                            <input
                                type="text" name="last_name"
                                value={formData.last_name} onChange={handleChange} required
                                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-on-surface-variant/40"
                                placeholder="Doe"
                            />
                        </div>
                    </div>)}
                    <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1 uppercase tracking-widest">Username</label>
                        <input
                            type="text" name="username"
                            value={formData.username} onChange={handleChange} required
                            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-on-surface-variant/40"
                            placeholder="your_username"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1 uppercase tracking-widest">Password</label>
                        <input
                            type="password" name="password"
                            value={formData.password} onChange={handleChange} required
                            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-on-surface-variant/40"
                            placeholder="••••••••"
                        />
                    </div>

                    {message && (<p className="text-xs text-error bg-error-container/20 border border-error/20 rounded-lg px-3 py-2">
                        {message}
                    </p>)}

                    <button
                        type="submit" disabled={loading}
                        className="w-full bg-primary text-on-primary py-2.5 rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors shadow-[0_0_20px_rgba(192,193,255,0.2)] disabled:opacity-60 mt-2"
                    >
                        {loading ? "Processing..." : isLogin ? "Sign In" : "Create Account"}
                    </button>
                </form>

                <p className="text-center mt-5 text-sm text-on-surface-variant">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setMessage("");
                        }}
                        className="ml-2 text-primary font-semibold hover:underline underline-offset-2"
                    >
                        {isLogin ? "Sign Up" : "Sign In"}
                    </button>
                </p>
            </div>
        </div>
    </div>);
>>>>>>> c4e38fc05abd10c170694ef88ebe21095748476a
}