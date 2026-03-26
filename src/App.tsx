import React, { useEffect, Suspense } from 'react';
import { useStore } from './store/useStore';

const Terminal = React.lazy(() =>
  import('./components/Terminal').then((m) => ({ default: m.Terminal })),
);

export default function App() {
  const sessions = useStore((state) => state.sessions);
  const activeSessionId = useStore((state) => state.activeSessionId);
  const setSessions = useStore((state) => state.setSessions);
  const setActiveSession = useStore((state) => state.setActiveSession);

  useEffect(() => {
    if (sessions.length === 0) {
      const newId = crypto.randomUUID();
      setSessions([{ id: newId, name: 'Local Shell', status: 'disconnected', logs: [] }]);
      setActiveSession(newId);
    }
  }, [sessions.length, setSessions, setActiveSession]);

  return (
    // position: relative so Terminal's absolute inset-0 is contained here
    <div className="relative w-screen h-screen overflow-hidden bg-[#050505] text-[#a9b1d6]">
      {/* Mobile warning */}
      <div className="md:hidden absolute top-0 left-0 w-full bg-yellow-500/90 text-yellow-950 text-xs font-semibold py-1 text-center z-50">
        Best experienced on desktop
      </div>

      {activeSessionId ? (
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center animate-pulse text-white/40 text-sm tracking-widest">
              INITIALIZING TERMINAL...
            </div>
          }
        >
          <Terminal sessionId={activeSessionId} />
        </Suspense>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm tracking-widest animate-pulse">
          STARTING...
        </div>
      )}
    </div>
  );
}
