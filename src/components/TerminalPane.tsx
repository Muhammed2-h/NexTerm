import React, { Suspense } from 'react';
import { Toolbar } from './Toolbar';
import { TabBar } from './TabBar';
import { ErrorBoundary } from './ErrorBoundary';
import { useStore } from '../store/useStore';

const Terminal = React.lazy(() =>
  import('./Terminal').then((module) => ({ default: module.Terminal })),
);

const TerminalSkeleton = () => (
  <div className="w-full h-full p-4 animate-pulse bg-[#0a0f14]/80 flex flex-col gap-2">
    <div className="h-4 bg-white/10 rounded w-1/4 mb-4"></div>
    <div className="h-4 bg-white/10 rounded w-1/2"></div>
    <div className="h-4 bg-white/10 rounded w-1/3"></div>
  </div>
);

export const TerminalPane: React.FC = () => {
  const activeSessionId = useStore((state) => state.activeSessionId);
  const activeSession = useStore((state) => state.sessions.find((s) => s.id === activeSessionId));
  const status = activeSession?.status || 'disconnected';

  const handleClear = () => {
    window.dispatchEvent(new Event('nexterm_clear'));
  };

  const handleCopy = () => {
    window.dispatchEvent(new Event('nexterm_copy'));
  };

  const statusClasses = {
    connected: 'border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.05)]',
    connecting: 'border-yellow-500/20 shadow-[0_0_30px_rgba(234,179,8,0.05)]',
    error: 'border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.05)]',
    disconnected: 'border-white/5 shadow-2xl',
  };

  return (
    <div
      className={`w-full h-full flex flex-col relative glass-panel rounded-2xl overflow-hidden border transition-all duration-500 ${statusClasses[status]}`}
    >
      {/* Window Chrome - simplified since we have TabBar and Toolbar now */}
      <div className="h-4 bg-white/5 flex items-center px-4 gap-2 shrink-0 border-b border-white/5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/80 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/80 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
      </div>

      <TabBar />
      <Toolbar onClear={handleClear} onCopy={handleCopy} />

      <div className="flex-1 relative bg-[#0a0f14]/80 backdrop-blur-md">
        {activeSessionId ? (
          <ErrorBoundary key={activeSessionId}>
            <Suspense fallback={<TerminalSkeleton />}>
              <Terminal sessionId={activeSessionId} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <div className="flex items-center justify-center w-full h-full text-white/30 flex-col gap-6">
            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.05)]">
              <div className="text-4xl text-white/50">⚡</div>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-light text-white/70 mb-2">System Ready</h2>
              <div className="text-sm font-mono mt-2 mb-6">No active terminal session</div>
            </div>
            <button
              onClick={() => {
                const newId = Math.random().toString(36).substring(7);
                useStore
                  .getState()
                  .setSessions([
                    { id: newId, name: 'Local Shell', status: 'disconnected', logs: [] },
                  ]);
                useStore.getState().setActiveSession(newId);
              }}
              className="px-6 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 transition-colors cursor-pointer"
            >
              Initialize Component Sequence
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
