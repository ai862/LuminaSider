import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ChatArea } from './components/ChatArea';
import { InputArea } from './components/InputArea';
import { Settings } from './components/Settings';
import { HistoryDrawer } from './components/HistoryDrawer';
import { UnlockModal } from './components/UnlockModal';
import { AgentDrawer } from './components/AgentDrawer';
import { AgentManager } from './components/AgentManager';
import { useStore } from './store';
import SecureStorage from './utils/secureStorage';

function App() {
  const { isSettingsOpen } = useStore();
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasMasterPassword, setHasMasterPassword] = useState(false);

  // Check security status on mount
  useEffect(() => {
    checkSecurityStatus();
  }, []);

  const checkSecurityStatus = async () => {
    const hasPassword = await SecureStorage.hasMasterPassword();
    setHasMasterPassword(hasPassword);

    if (hasPassword) {
      const unlocked = await SecureStorage.checkUnlocked();
      setIsUnlocked(unlocked);

      // If has password but not unlocked, show unlock modal
      if (!unlocked) {
        setShowUnlockModal(true);
      }
    }
  };

  const handleUnlock = () => {
    setIsUnlocked(true);
    setShowUnlockModal(false);
  };

  return (
    <div className="w-full h-screen bg-white dark:bg-primary text-primary dark:text-white flex flex-col relative overflow-hidden">
      <Header />
      <ChatArea />
      <InputArea />
      <HistoryDrawer />
      <AgentDrawer />
      <AgentManager />
      {isSettingsOpen && <Settings />}

      {/* Unlock Modal */}
      {showUnlockModal && hasMasterPassword && !isUnlocked && (
        <UnlockModal
          onUnlock={handleUnlock}
          onClose={() => setShowUnlockModal(false)}
        />
      )}
    </div>
  );
}

export default App;
