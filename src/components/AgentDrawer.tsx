import { BookOpen, Languages, Code, Bot, Settings } from 'lucide-react';
import { useStore, Agent } from '../store';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen,
  Languages,
  Code,
  Bot,
};

export function AgentDrawer() {
  const {
    agents,
    currentAgentId,
    setCurrentAgent,
    isAgentDrawerOpen,
    setIsAgentDrawerOpen,
    setIsAgentManagerOpen,
  } = useStore();

  if (!isAgentDrawerOpen) return null;

  const handleSelect = (agent: Agent) => {
    setCurrentAgent(agent.id);
  };

  const handleManage = () => {
    setIsAgentDrawerOpen(false);
    setIsAgentManagerOpen(true);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-20"
        onClick={() => setIsAgentDrawerOpen(false)}
      />

      {/* Drawer */}
      <div className="absolute top-[60px] left-3 z-30 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
        <div className="p-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">选择智能体</h3>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-2 space-y-1">
          {agents.map((agent) => {
            const Icon = iconMap[agent.icon] || Bot;
            const isActive = agent.id === currentAgentId;

            return (
              <button
                key={agent.id}
                onClick={() => handleSelect(agent)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  isActive
                    ? 'bg-blue-100 dark:bg-blue-800/40'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-500' : 'text-gray-500'}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{agent.name}</div>
                  {!agent.isBuiltIn && (
                    <div className="text-[10px] text-gray-400">自定义</div>
                  )}
                </div>
                {isActive && (
                  <div className="ml-auto w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-2 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={handleManage}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>管理智能体</span>
          </button>
        </div>
      </div>
    </>
  );
}
