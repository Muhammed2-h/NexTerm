import { type FC, useState, useRef, useEffect, useCallback } from 'react';

interface LoginScreenProps {
  onLogin: (token: string) => void;
}

export const LoginScreen: FC<LoginScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !username || !password) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = (await res.json()) as { token?: string; error?: string };

      if (res.ok && data.token) {
        sessionStorage.setItem('nexterm_token', data.token);
        onLogin(data.token);
      } else {
        setError(data.error ?? 'Authentication failed');
        setShake(true);
        setPassword('');
        setTimeout(() => setShake(false), 600);
      }
    } catch {
      setError('Connection to server failed');
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally {
      setLoading(false);
    }
  }, [username, password, loading, onLogin]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050505] flex items-center justify-center">
      
      {/* Background Ambience blobs */}
      <div className="auth-blob w-[320px] h-[320px] top-[20%] left-[15%] bg-[radial-gradient(circle,rgba(122,162,247,0.12)_0%,transparent_70%)]" />
      <div className="auth-blob w-[280px] h-[280px] bottom-[20%] right-[15%] bg-[radial-gradient(circle,rgba(187,154,247,0.1)_0%,transparent_70%)]" />

      {/* Main card */}
      <div className={`login-card w-[360px] rounded-2xl p-9 flex flex-col items-stretch space-y-8 ${shake ? 'login-card-shake' : ''}`}>
        
        {/* Header section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500/25 to-purple-500/25 border border-indigo-400/30">
            <span className="text-2xl">⌨</span>
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-[#c0caf5] tracking-tight">NexTerm</h1>
            <p className="text-sm text-[#565f89]">Sign in to enter the shell</p>
          </div>
        </div>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
          
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-semibold text-indigo-300/60 tracking-wider px-1">Username</label>
            <input
              ref={usernameRef}
              type="text"
              autoComplete="username"
              className="input-field w-full rounded-lg px-4 py-2.5 text-sm font-mono text-[#c0caf5]"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase font-semibold text-indigo-300/60 tracking-wider px-1">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              className="input-field w-full rounded-lg px-4 py-2.5 text-sm font-mono text-[#c0caf5]"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="px-4 py-2.5 bg-red-400/10 border border-red-500/20 rounded-lg text-xs text-red-400 animate-in fade-in duration-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className={`w-full py-3 rounded-lg text-sm font-bold tracking-tight transition-all duration-200 
              ${loading || !username || !password 
                ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed' 
                : 'bg-indigo-500 text-slate-900 hover:bg-indigo-400 active:scale-[0.98]'
              }`}
          >
            {loading ? 'Authenticating…' : 'Access Console →'}
          </button>
        </form>
      </div>

    </div>
  );
};
