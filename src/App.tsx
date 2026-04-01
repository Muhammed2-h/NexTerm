import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useStore } from './store/useStore';
import { LoginScreen } from './components/LoginScreen';

const Terminal = React.lazy(() =>
  import('./components/Terminal').then((m) => ({ default: m.Terminal })),
);

type AuthState = 'loading' | 'open' | 'login-required' | 'authenticated';

export default function App() {
  const sessions = useStore((state) => state.sessions);
  const activeSessionId = useStore((state) => state.activeSessionId);
  const setSessions = useStore((state) => state.setSessions);
  const setActiveSession = useStore((state) => state.setActiveSession);

  const [authState, setAuthState] = useState<AuthState>('loading');
  const [token, setToken] = useState<string | undefined>(undefined);

  // 1. Initial auth check on mount
  useEffect(() => {
    const storedToken = sessionStorage.getItem('nexterm_token');

    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/auth-required');
        const { required } = (await response.json()) as { required: boolean };

        if (!required) {
          setAuthState('open');
        } else if (storedToken) {
          setToken(storedToken);
          setAuthState('authenticated');
        } else {
          setAuthState('login-required');
        }
      } catch (err) {
        console.warn('Authentication status unknown, assuming open mode.', err);
        setAuthState('open'); // Fallback to open mode if backend is unreachable
      }
    };

    void checkAuthStatus();
  }, []);

  // 2. Initial session setup once authentication state is determined
  useEffect(() => {
    const isReady = authState === 'open' || authState === 'authenticated';
    if (isReady && sessions.length === 0) {
      // Use crypto.randomUUID for stronger IDs if available, else fallback
      const newSessionId = typeof crypto.randomUUID === 'function' 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2, 11);

      setSessions([{ 
        id: newSessionId, 
        name: 'Local Shell', 
        status: 'disconnected' 
      }]);
      setActiveSession(newSessionId);
    }
  }, [authState, sessions.length, setSessions, setActiveSession]);

  const handleLoginSuccess = useCallback((receivedToken: string) => {
    setToken(receivedToken);
    setAuthState('authenticated');
  }, []);

  // ── Render Screens ─────────────────────────────────────────────────────────

  // App initialization state
  if (authState === 'loading') {
    return (
      <div className="w-screen h-screen bg-[#050505] flex items-center justify-center">
        <span className="text-[#565f89] text-sm tracking-[0.2em] font-mono animate-pulse uppercase">
          Initializing NexTerm...
        </span>
      </div>
    );
  }

  // Pre-terminal login screen
  if (authState === 'login-required') {
    return <LoginScreen onLogin={handleLoginSuccess} />;
  }

  // Final Terminal application
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050505] text-[#a9b1d6]">
      
      {/* Visual only on mobile devices */}
      <div className="md:hidden absolute top-0 left-0 w-full bg-indigo-500/80 text-white text-[10px] font-bold py-1.5 text-center z-[100] tracking-wider uppercase">
        Desktop browser recommended
      </div>

      {activeSessionId ? (
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center animate-pulse text-[#565f89] text-xs font-mono tracking-widest">
              LOADING COMPONENT...
            </div>
          }
        >
          <Terminal sessionId={activeSessionId} {...(token ? { token } : {})} />
        </Suspense>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center animate-pulse text-[#565f89] text-xs font-mono tracking-widest">
          WAITING FOR SESSION...
        </div>
      )}
      
    </div>
  );
}
