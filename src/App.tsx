import { Header } from './components/Header';
import { ChatArea } from './components/ChatArea';
import { InputArea } from './components/InputArea';
import { Settings } from './components/Settings';
import { HistoryDrawer } from './components/HistoryDrawer';
import { useStore } from './store';

function App() {
  const { isSettingsOpen } = useStore();

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
