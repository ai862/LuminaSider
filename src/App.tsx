import { useEffect } from 'react';
import { Header } from './components/Header';
import { ChatArea } from './components/ChatArea';
import { InputArea } from './components/InputArea';
import { Settings } from './components/Settings';
import { HistoryDrawer } from './components/HistoryDrawer';
import { useStore } from './store';

function App() {
  const { isSettingsOpen, theme } = useStore();

  useEffect(() => {
    const root = window.document.documentElement;
    
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      applyTheme(theme === 'dark');
    }
  }, [theme]);

  return (
    <div className="w-full h-screen bg-white dark:bg-primary text-primary dark:text-white flex flex-col relative overflow-hidden">
      <Header />
      <ChatArea />
      <InputArea />
      <HistoryDrawer />
      {isSettingsOpen && <Settings />}
    </div>
  );
}

export default App;
