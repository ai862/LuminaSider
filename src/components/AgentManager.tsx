import { useState } from 'react';
import { X, Plus, Trash2, Edit3, BookOpen, Languages, Code, Bot, Check } from 'lucide-react';
import { useStore, Agent } from '../store';
import { v4 as uuidv4 } from 'uuid';

const iconOptions = [
  { name: 'BookOpen', icon: BookOpen },
  { name: 'Languages', icon: Languages },
  { name: 'Code', icon: Code },
  { name: 'Bot', icon: Bot },
];

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen,
  Languages,
  Code,
  Bot,
};

export function AgentManager() {
  const {
    agents,
    addAgent,
    updateAgent,
    deleteAgent,
    isAgentManagerOpen,
    setIsAgentManagerOpen,
  } = useStore();

  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formWelcomeMessage, setFormWelcomeMessage] = useState('');
  const [formPlaceholder, setFormPlaceholder] = useState('');
  const [formIcon, setFormIcon] = useState('Bot');

  if (!isAgentManagerOpen) return null;

  const startCreate = () => {
    setEditingAgent(null);
    setFormName('');
    setFormPrompt('');
    setFormWelcomeMessage('');
    setFormPlaceholder('');
    setFormIcon('Bot');
    setIsCreating(true);
  };

  const startEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setFormName(agent.name);
    setFormPrompt(agent.systemPrompt);
    setFormWelcomeMessage(agent.defaultWelcomeMessage || '');
    setFormPlaceholder(agent.inputPlaceholder || '');
    setFormIcon(agent.icon);
    setIsCreating(false);
  };

  const handleSave = () => {
    if (!formName.trim() || !formPrompt.trim()) return;

    if (editingAgent) {
      // 所有智能体统一处理
      updateAgent(editingAgent.id, {
        name: formName.trim(),
        systemPrompt: formPrompt.trim(),
        icon: formIcon,
        defaultWelcomeMessage: formWelcomeMessage.trim() || undefined,
        inputPlaceholder: formPlaceholder.trim() || undefined,
      });
    } else {
      addAgent({
        id: uuidv4(),
        name: formName.trim(),
        icon: formIcon,
        systemPrompt: formPrompt.trim(),
        defaultWelcomeMessage: formWelcomeMessage.trim() || undefined,
        inputPlaceholder: formPlaceholder.trim() || undefined,
      });
    }

    // 重置表单
    setEditingAgent(null);
    setIsCreating(false);
    setFormName('');
    setFormPrompt('');
    setFormWelcomeMessage('');
    setFormPlaceholder('');
    setFormIcon('Bot');
  };

  const handleCancel = () => {
    setEditingAgent(null);
    setIsCreating(false);
  };

  const showForm = isCreating || editingAgent !== null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">管理智能体</h2>
          <button
            onClick={() => setIsAgentManagerOpen(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Agent List */}
          <div className="p-4 space-y-2">
            {agents.map((agent) => {
              const Icon = iconMap[agent.icon] || Bot;
              const isEditing = editingAgent?.id === agent.id;

              return (
                <div
                  key={agent.id}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors ${
                    isEditing
                      ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20'
                      : 'border-gray-100 dark:border-gray-800'
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                    <Icon className="w-4.5 h-4.5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {agent.name}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate mt-0.5">
                      {agent.systemPrompt.slice(0, 50)}...
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(agent)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="编辑"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {!agent.isBuiltIn && (
                      <button
                        onClick={() => deleteAgent(agent.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Form */}
          {showForm && (
            <div className="mx-4 mb-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {editingAgent ? '编辑智能体' : '新建智能体'}
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">名称</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="例如：写作助手"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">图标</label>
                  <div className="flex gap-2">
                    {iconOptions.map(({ name, icon: IconComp }) => (
                      <button
                        key={name}
                        onClick={() => setFormIcon(name)}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-colors ${
                          formIcon === name
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-500'
                            : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">系统提示词</label>
                  <textarea
                    value={formPrompt}
                    onChange={(e) => setFormPrompt(e.target.value)}
                    placeholder="定义这个智能体的行为和角色..."
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">默认欢迎消息（选填）</label>
                  <input
                    type="text"
                    value={formWelcomeMessage}
                    onChange={(e) => setFormWelcomeMessage(e.target.value)}
                    placeholder="切换到此智能体时自动发送的消息，如：请帮我分析当前网页"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">留空则不自动发送消息</p>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">输入框占位符（选填）</label>
                  <input
                    type="text"
                    value={formPlaceholder}
                    onChange={(e) => setFormPlaceholder(e.target.value)}
                    placeholder="输入提示用户的占位符文本..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">留空则使用默认占位符</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={!formName.trim() || !formPrompt.trim()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    保存
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!showForm && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={startCreate}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              <Plus className="w-4 h-4" />
              新建智能体
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
