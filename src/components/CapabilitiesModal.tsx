import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Server, Shield, Cpu, Network, Package, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useStore } from '../store/useStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CapabilitiesModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const capabilities = useStore((state) => state.capabilities);

  if (!capabilities) return null;

  const renderStatus = (condition: boolean, text: string) => (
    <div className="flex items-center gap-2 text-sm">
      {condition ? <CheckCircle2 size={16} className="text-green-400" /> : <XCircle size={16} className="text-red-400" />}
      <span className={condition ? 'text-zinc-200' : 'text-zinc-500'}>{text}</span>
    </div>
  );

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5 shrink-0">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Server size={18} className="text-blue-400" />
                Environment Capabilities
              </h2>
              <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-8 custom-scrollbar flex-1">
              
              {/* System Info */}
              <section>
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Cpu size={14} /> System Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <div className="text-xs text-zinc-500 mb-1">OS / Distro</div>
                    <div className="text-sm font-medium text-zinc-200 truncate">{capabilities.osDistro}</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <div className="text-xs text-zinc-500 mb-1">Kernel</div>
                    <div className="text-sm font-medium text-zinc-200 truncate">{capabilities.kernelVersion}</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <div className="text-xs text-zinc-500 mb-1">Architecture</div>
                    <div className="text-sm font-medium text-zinc-200 truncate">{capabilities.architecture}</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <div className="text-xs text-zinc-500 mb-1">Environment Type</div>
                    <div className="text-sm font-medium text-blue-400 uppercase tracking-wider">{capabilities.environmentType}</div>
                  </div>
                </div>
              </section>

              {/* Privileges & Core */}
              <section>
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Shield size={14} /> Privileges & Core
                </h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6 bg-white/5 p-4 rounded-xl border border-white/5">
                  {renderStatus(capabilities.isRoot, 'Running as Root')}
                  {renderStatus(capabilities.hasSystemd, 'Systemd (PID 1)')}
                  {renderStatus(capabilities.canUseSystemctl, 'Systemctl Usable')}
                  {renderStatus(!capabilities.isReadOnly, 'Writable Filesystem')}
                  {renderStatus(!capabilities.isEphemeral, 'Persistent Session')}
                  {renderStatus(capabilities.canRunBackgroundDaemons, 'Background Daemons')}
                </div>
              </section>

              {/* Networking & Tools */}
              <section>
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Network size={14} /> Networking & Tools
                </h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6 bg-white/5 p-4 rounded-xl border border-white/5">
                  {renderStatus(capabilities.hasOutboundInternet, 'Outbound Internet')}
                  {renderStatus(capabilities.hasTunDevice, '/dev/net/tun Available')}
                  {renderStatus(capabilities.canRunTailscale, 'Tailscale Support')}
                  {renderStatus(capabilities.hasIptables, 'iptables Available')}
                  {renderStatus(capabilities.supportsSshClient, 'SSH Client Installed')}
                  {renderStatus(capabilities.supportsSshServer, 'SSH Server Installed')}
                  {renderStatus(capabilities.hasTmux, 'Tmux Available')}
                  {renderStatus(capabilities.hasScreen, 'Screen Available')}
                </div>
              </section>

              {/* Software */}
              <section>
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Package size={14} /> Software Management
                </h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6 bg-white/5 p-4 rounded-xl border border-white/5">
                  {renderStatus(capabilities.canInstallPackages, 'Package Manager Available')}
                  {renderStatus(capabilities.canRunDocker, 'Docker Support')}
                </div>
              </section>

              {/* Notes */}
              {capabilities.notes.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-yellow-500/70 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <AlertTriangle size={14} /> Important Notes
                  </h3>
                  <div className="space-y-2">
                    {capabilities.notes.map((note, idx) => (
                      <div key={idx} className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-xl text-sm text-yellow-200/80">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5 text-yellow-500/50" />
                        <p>{note}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
