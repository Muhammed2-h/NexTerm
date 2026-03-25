import React, { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TerminalPane } from './components/TerminalPane';
import { useStore } from './store/useStore';
import { motion } from 'motion/react';

export default function App() {
  const setCapabilities = useStore((state) => state.setCapabilities);

  useEffect(() => {
    fetch('/api/capabilities')
      .then((res) => res.json())
      .then((data) => setCapabilities(data))
      .catch((err) => console.error('Failed to fetch capabilities:', err));
  }, [setCapabilities]);

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden font-sans bg-[var(--bg-color-dark)] text-[var(--text-color-dark)] relative transition-colors duration-300">
      {/* Mobile warning banner */}
      <div className="md:hidden absolute top-0 left-0 w-full bg-yellow-500/90 text-yellow-950 text-xs font-semibold py-1 text-center z-50">
        Best experienced on desktop
      </div>

      <Sidebar />
      <div className="flex-1 flex flex-col relative p-4 pl-4 md:pl-0 z-10 h-full mt-4 md:mt-0">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full h-full"
        >
          <TerminalPane />
        </motion.div>
      </div>
    </div>
  );
}
