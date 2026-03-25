import React, { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Terminal } from './components/Terminal';
import { useStore } from './store/useStore';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const activeSessionId = useStore((state) => state.activeSessionId);
  const activeSession = useStore((state) => state.sessions.find(s => s.id === activeSessionId));
  const status = activeSession?.status || 'disconnected';
  const setCapabilities = useStore((state) => state.setCapabilities);
  const setSessions = useStore((state) => state.setSessions);

  useEffect(() => {
    fetch('/api/capabilities')
      .then(res => res.json())
      .then(data => setCapabilities(data))
      .catch(err => console.error('Failed to fetch capabilities:', err));

    fetch('/api/sessions')
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          const sessions = data.map((s: any) => ({
            id: s.id,
            name: s.name,
            status: 'disconnected', // Will connect when Terminal component mounts
            logs: []
          }));
          setSessions(sessions);
        }
      })
      .catch(err => console.error('Failed to fetch sessions:', err));
  }, [setCapabilities, setSessions]);

  // Dynamic classes based on status
  const statusClasses = {
    connected: 'border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.1)]',
    connecting: 'border-yellow-500/30 shadow-[0_0_30px_rgba(234,179,8,0.1)]',
    error: 'border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.1)]',
    disconnected: 'border-white/10 shadow-2xl'
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans bg-[#050505] relative">
      {/* Animated background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-600/10 blur-[120px] pointer-events-none" />
      
      <Sidebar />
      <div className="flex-1 flex flex-col relative p-4 pl-0 z-10 h-full">
        <AnimatePresence mode="wait">
          {activeSessionId ? (
            <motion.div 
              key={activeSessionId}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`w-full h-full glass-panel rounded-2xl overflow-hidden flex flex-col border transition-all duration-500 ${statusClasses[status]}`}
            >
              {/* Window Chrome */}
              <div className="h-10 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2 shrink-0">
                <div className="w-3 h-3 rounded-full bg-red-500/80 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80 shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
                <div className="w-3 h-3 rounded-full bg-green-500/80 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                <div className="ml-4 text-xs font-medium text-white/40 font-mono">bash ~ {activeSession?.name}</div>
              </div>
              <div className="flex-1 relative">
                <Terminal sessionId={activeSessionId} />
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full flex items-center justify-center text-white/30 flex-col gap-6 glass-panel rounded-2xl border border-white/10"
            >
              <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.05)]">
                <div className="text-4xl">⚡</div>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-light text-white/70 mb-2">System Ready</h2>
                <p className="text-sm font-mono">Initialize a new terminal sequence</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
