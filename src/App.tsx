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
      const newId = Math.random().toString(36).substring(7);
      setSessions([{ id: newId, name: 'Local Shell', status: 'disconnected', logs: [] }]);
      setActiveSession(newId);
    }
  }, [sessions.length, setSessions, setActiveSession]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#050505] text-[#a9b1d6] relative">
      <div className="md:hidden absolute top-0 left-0 w-full bg-yellow-500/90 text-yellow-950 text-xs font-semibold py-1 text-center z-50">
        Best experienced on desktop
      </div>

      {activeSessionId ? (
        <Suspense
          fallback={
            <div className="w-screen h-screen flex items-center justify-center animate-pulse text-white/50">
              Initializing System...
            </div>
          }
        >
          <Terminal sessionId={activeSessionId} />
        </Suspense>
      ) : (
        <div className="w-screen h-screen flex items-center justify-center text-white/50">
          Starting Terminal...
        </div>
      )}
    </div>
  );
}
