import React, { useEffect } from 'react';
import { useStore } from '../store/useStore';

export const TabBar: React.FC = () => {
  const sessions = useStore((state) => state.sessions);
  const activeSessionId = useStore((state) => state.activeSessionId);
  const setActiveSession = useStore((state) => state.setActiveSession);
  const setSessions = useStore((state) => state.setSessions);

  useEffect(() => {
    fetch('/api/sessions')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.length > 0) {
          const loadedSessions = data.map((s: any) => ({
            id: s.id,
            name: s.name || `Session ${s.id.substring(0, 4)}`,
            status: 'disconnected',
            logs: [],
          }));
          setSessions(loadedSessions);
        }
      })
      .catch((err) => console.error('Failed to fetch sessions:', err));
  }, [setSessions]);

  const createSession = async () => {
    // Generate new local sessionId, Terminal component will send connect msg
    const newId = Math.random().toString(36).substring(7);
    const newSession = {
      id: newId,
      name: `Terminal-${newId}`,
      status: 'disconnected' as const,
      logs: [],
    };
    useStore.getState().setSessions([...useStore.getState().sessions, newSession]);
    useStore.getState().setActiveSession(newId);
  };

  const closeSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error(err);
    }
    useStore.getState().removeSession(id);
  };

  return (
    <div className="flex bg-[#0a0a0c] border-b border-white/5 h-10 shrink-0 overflow-x-auto no-scrollbar font-mono text-sm px-1 pt-1 space-x-1 items-end relative z-20">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20"></div>
      {sessions.map((s) => {
        const isActive = s.id === activeSessionId;
        return (
          <div
            key={s.id}
            onClick={() => setActiveSession(s.id)}
            className={`
              group cursor-pointer flex items-center justify-between px-4 py-[7px] rounded-t-lg min-w-[140px] max-w-[220px] border border-b-0 transition-all
              ${
                isActive
                  ? 'bg-[#1a1b26] text-[#a9b1d6] border-white/10 z-10 -mb-[1px]'
                  : 'bg-black/20 text-white/40 border-transparent hover:bg-black/40 hover:text-white/70 shadow-inner'
              }
            `}
          >
            <div className="flex items-center gap-2 overflow-hidden w-full">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  s.status === 'connected'
                    ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'
                    : s.status === 'connecting'
                      ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]'
                      : s.status === 'error'
                        ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                        : 'bg-white/20'
                }`}
              />
              <span className="truncate flex-1">{s.name}</span>
            </div>
            <button
              onClick={(e) => closeSession(s.id, e)}
              className="w-5 h-5 ml-2 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-red-400 transition-all text-xs cursor-pointer shrink-0"
              title="Close Session"
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        onClick={createSession}
        className="w-8 h-8 mb-[2px] ml-1 flex items-center justify-center rounded-md hover:bg-white/10 text-white/50 hover:text-white transition-colors pb-1 cursor-pointer"
        title="New Tab"
      >
        +
      </button>
    </div>
  );
};
