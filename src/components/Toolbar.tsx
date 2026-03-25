import React, { useEffect, useState } from 'react';

interface ToolbarProps {
  onClear: () => void;
  onCopy: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ onClear, onCopy }) => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [fontSize, setFontSize] = useState<number>(14);

  useEffect(() => {
    const savedTheme = (localStorage.getItem('nexterm_theme') as 'dark' | 'light') || 'dark';
    const savedSize = parseInt(localStorage.getItem('nexterm_font_size') || '14', 10);
    setTheme(savedTheme);
    setFontSize(savedSize);

    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }

    // Dispatch custom event for terminal to pick up font size
    window.dispatchEvent(new CustomEvent('nexterm_fontsize', { detail: savedSize }));
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('nexterm_theme', newTheme);
    if (newTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  };

  const adjustFontSize = (delta: number) => {
    const newSize = Math.max(8, Math.min(36, fontSize + delta));
    setFontSize(newSize);
    localStorage.setItem('nexterm_font_size', newSize.toString());
    window.dispatchEvent(new CustomEvent('nexterm_fontsize', { detail: newSize }));
  };

  return (
    <div className="h-10 glass-panel border-b border-white/5 flex items-center justify-between px-3 shrink-0 text-xs font-mono text-white/50 relative z-20 shadow-sm">
      <div className="flex items-center gap-2">
        <button
          onClick={onClear}
          className="px-3 py-1.5 hover:bg-white/10 hover:text-white rounded transition-colors"
          title="Clear Terminal"
        >
          Clear
        </button>
        <button
          onClick={onCopy}
          className="px-3 py-1.5 hover:bg-white/10 hover:text-white rounded transition-colors"
          title="Copy Selection"
        >
          Copy
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="px-3 py-1.5 hover:bg-white/10 rounded transition-colors flex gap-2 items-center"
          title="Toggle Theme"
        >
          <span>{theme === 'dark' ? '☀️' : '🌙'}</span> Theme
        </button>
        <div className="flex items-center pl-3 border-l border-white/10 gap-1.5">
          <span className="mr-1">Font: {fontSize}px</span>
          <button
            onClick={() => adjustFontSize(-1)}
            className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded transition-colors text-lg lead-none cursor-pointer"
          >
            -
          </button>
          <button
            onClick={() => adjustFontSize(1)}
            className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded transition-colors text-lg lead-none cursor-pointer"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};
