import { create } from 'zustand';

export interface Session {
  id: string;
  name: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
}

interface AppState {
  sessions: Session[];
  activeSessionId: string | null;
  // Actions
  setActiveSession: (id: string | null) => void;
  updateSessionStatus: (id: string, status: Session['status']) => void;
  setSessions: (sessions: Session[]) => void;
}

export const useStore = create<AppState>((set) => ({
  sessions: [],
  activeSessionId: null,

  // Replace entire session list and automatically set active if needed
  setSessions: (sessions) =>
    set({
      sessions,
      activeSessionId:
        sessions.length > 0 ? sessions[0]?.id ?? null : null
    }),

  // Change currently focused session
  setActiveSession: (id) => set({ activeSessionId: id }),

  // Update connection status for a session (connecting, error, etc.)
  updateSessionStatus: (id, status) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, status } : s)),
    })),
}));
