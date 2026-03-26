import { create } from 'zustand';

export interface Session {
  id: string;
  name: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  logs: string[];
}

interface AppState {
  sessions: Session[];
  activeSessionId: string | null;
  addSession: (name: string) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  updateSessionStatus: (id: string, status: Session['status']) => void;
  appendLog: (id: string, log: string) => void;
  setSessions: (sessions: Session[]) => void;
}

export const useStore = create<AppState>((set) => ({
  sessions: [],
  activeSessionId: null,
  setSessions: (sessions) =>
    set({ sessions, activeSessionId: sessions.length > 0 ? sessions[0]?.id || null : null }),
  addSession: (name) =>
    set((state) => {
      const id = Math.random().toString(36).substring(7);
      const newSession: Session = { id, name, status: 'disconnected', logs: [] };
      return {
        sessions: [...state.sessions, newSession],
        activeSessionId: id,
      };
    }),
  removeSession: (id) =>
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== id);
      return {
        sessions: remaining,
        activeSessionId:
          state.activeSessionId === id
            ? remaining.length > 0
              ? remaining[0]?.id || null
              : null
            : state.activeSessionId,
      };
    }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  updateSessionStatus: (id, status) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, status } : s)),
    })),
  appendLog: (id, log) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, logs: [...s.logs, log] } : s)),
    })),
}));
