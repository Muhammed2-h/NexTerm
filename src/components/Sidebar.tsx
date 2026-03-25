import React, { useState } from 'react';
import { Plus, TerminalSquare, Settings, X, Server } from 'lucide-react';
import { useStore } from '../store/useStore';
import { motion } from 'motion/react';
import { CapabilitiesModal } from './CapabilitiesModal';

export const Sidebar: React.FC = () => {
  const { sessions, activeSessionId, addSession, removeSession, setActiveSession } = useStore();
  const [isCapabilitiesOpen, setIsCapabilitiesOpen] = useState(false);

  const handleNewTerminal = () => {
    const count = sessions.length + 1;
    addSession(`Terminal ${count}`);
  };

  const handleRemoveSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete session', err);
    }
    removeSession(id);
  };

  return (
    <div className="w-72 flex flex-col h-full text-zinc-300 p-4 z-10">
      <div className="glass-panel rounded-2xl h-full flex flex-col overflow-hidden border border-white/10 shadow-xl">
        <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/5">
          <h1 className="text-sm font-bold text-white flex items-center gap-3 tracking-widest uppercase">
            <div className="w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
              <TerminalSquare size={14} className="text-blue-400" />
            </div>
            Nexus
          </h1>
          <button
            onClick={handleNewTerminal}
            className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-all border border-white/5 hover:border-white/20 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]"
            title="New Terminal"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {sessions.map((session, i) => (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              key={session.id}
              onClick={() => setActiveSession(session.id)}
              className={`flex items-center justify-between p-3 rounded-xl cursor-pointer group transition-all duration-200 border ${activeSessionId === session.id ? 'bg-blue-500/10 border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'}`}
            >
              <div className="flex items-center gap-3 truncate">
                <div className="relative flex items-center justify-center w-3 h-3">
                  {session.status === 'connected' && (
                    <span className="absolute w-full h-full bg-green-400/40 rounded-full animate-ping" />
                  )}
                  <div
                    className={`w-2 h-2 rounded-full relative z-10 ${session.status === 'connected' ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]' : session.status === 'error' ? 'bg-red-500' : session.status === 'connecting' ? 'bg-yellow-400' : 'bg-zinc-600'}`}
                  />
                </div>
                <span
                  className={`truncate text-sm font-medium ${activeSessionId === session.id ? 'text-blue-100' : 'text-zinc-400 group-hover:text-zinc-200'}`}
                >
                  {session.name}
                </span>
              </div>
              <button
                onClick={(e) => handleRemoveSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-zinc-500 transition-all"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}

          {sessions.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-white/30 text-xs p-6 mt-4 border border-dashed border-white/10 rounded-xl"
            >
              No active sessions.
              <br />
              <br />
              Click the + button to initialize.
            </motion.div>
          )}
        </div>

        <div className="p-4 border-t border-white/5 bg-white/5 space-y-2">
          <button
            onClick={() => setIsCapabilitiesOpen(true)}
            className="flex items-center gap-3 text-sm font-medium text-white/50 hover:text-white transition-colors w-full p-3 hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10"
          >
            <Server size={16} />
            Environment Info
          </button>
          <button className="flex items-center gap-3 text-sm font-medium text-white/50 hover:text-white transition-colors w-full p-3 hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10">
            <Settings size={16} />
            Preferences
          </button>
        </div>
      </div>
      <CapabilitiesModal isOpen={isCapabilitiesOpen} onClose={() => setIsCapabilitiesOpen(false)} />
    </div>
  );
};
