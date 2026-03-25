import { create } from 'zustand';

export interface EnvironmentCapabilities {
  osDistro: string;
  kernelVersion: string;
  architecture: string;
  environmentType: 'docker' | 'lxc' | 'k8s' | 'sandbox' | 'baremetal' | 'vps' | 'unknown';
  isRoot: boolean;
  hasSystemd: boolean;
  canUseSystemctl: boolean;
  hasTunDevice: boolean;
  canRunTailscale: boolean;
  canRunDocker: boolean;
  canInstallPackages: boolean;
  canRunBackgroundDaemons: boolean;
  hasIptables: boolean;
  supportsSshClient: boolean;
  supportsSshServer: boolean;
  hasTmux: boolean;
  hasScreen: boolean;
  isEphemeral: boolean;
  isReadOnly: boolean;
  hasOutboundInternet: boolean;
  notes: string[];
}

export interface Session {
  id: string;
  name: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  logs: string[];
}

interface AppState {
  sessions: Session[];
  activeSessionId: string | null;
  capabilities: EnvironmentCapabilities | null;
  addSession: (name: string) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  updateSessionStatus: (id: string, status: Session['status']) => void;
  appendLog: (id: string, log: string) => void;
  setCapabilities: (caps: EnvironmentCapabilities) => void;
  setSessions: (sessions: Session[]) => void;
}

export const useStore = create<AppState>((set) => ({
  sessions: [],
  activeSessionId: null,
  capabilities: null,
  setSessions: (sessions) =>
    set({ sessions, activeSessionId: sessions.length > 0 ? sessions[0].id : null }),
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
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId:
        state.activeSessionId === id ? state.sessions[0]?.id || null : state.activeSessionId,
    })),
  setActiveSession: (id) => set({ activeSessionId: id }),
  updateSessionStatus: (id, status) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, status } : s)),
    })),
  appendLog: (id, log) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, logs: [...s.logs, log] } : s)),
    })),
  setCapabilities: (caps) => set({ capabilities: caps }),
}));
