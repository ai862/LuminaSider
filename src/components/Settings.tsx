import { useState, useEffect } from 'react';
import { useStore, ApiProvider, defaultProviderConfigs } from '../store';
import { Save, ArrowLeft, RefreshCw } from 'lucide-react';

interface ModelInfo {
  name: string;
  displayName: string;
}

export function Settings() {
  const { apiProvider, providerConfigs, setSettings, setActiveProvider, setIsSettingsOpen } = useStore();
  const [localApiProvider, setLocalApiProvider] = useState<string>(apiProvider || 'gemini');
  
  // Initialize local state with the config of the currently selected provider, fallback to default if missing
  const currentConfig = providerConfigs[localApiProvider as ApiProvider] || defaultProviderConfigs[localApiProvider as ApiProvider] || defaultProviderConfigs['gemini'];
  const [localApiKey, setLocalApiKey] = useState(currentConfig.apiKey);
  const [localBaseUrl, setLocalBaseUrl] = useState(currentConfig.baseUrl);
  const [localModel, setLocalModel] = useState(currentConfig.model);
  
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState('');

  const fetchModels = async () => {
    if (!localApiKey && localApiProvider !== 'ollama' && localApiProvider !== 'anthropic') {
      setModelError('请先输入 API 密钥');
      return;
    }

    setIsLoadingModels(true);
    setModelError('');

    try {
      const cleanBaseUrl = localBaseUrl.replace(/\/$/, '');
      
      if (localApiProvider === 'gemini') {
        const url = `${cleanBaseUrl}/models`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': '*/*',
            'Accept-Language': 'zh-CN',
            'Content-Type': 'application/json',
            'x-goog-api-key': localApiKey,
          },
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        if (data.models && Array.isArray(data.models)) {
          const modelsList = data.models.map((m: { name: string; displayName?: string }) => {
            const cleanName = m.name.replace(/^models\//, '');
            return { name: cleanName, displayName: m.displayName || cleanName };
          });
          setAvailableModels(modelsList);
          if (modelsList.length > 0 && !modelsList.find((m: ModelInfo) => m.name === localModel)) {
            setLocalModel(modelsList[0].name);
          }
        } else {
          throw new Error('Invalid response format');
        }
      } else if (localApiProvider === 'anthropic') {
        // Anthropic doesn't have a standard models endpoint, provide static list
        const modelsList = [
          { name: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet' },
          { name: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku' },
          { name: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus' },
        ];
        setAvailableModels(modelsList);
        if (!modelsList.find((m: ModelInfo) => m.name === localModel)) {
          setLocalModel(modelsList[0].name);
        }
      } else if (localApiProvider === 'ollama') {
        // Ollama uses /api/tags
        let url = `${cleanBaseUrl}/api/tags`;
        if (cleanBaseUrl.endsWith('/v1')) {
          url = `${cleanBaseUrl.replace(/\/v1$/, '')}/api/tags`;
        }
        const response = await fetch(url, {
          method: 'GET',
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        if (data.models && Array.isArray(data.models)) {
          const modelsList = data.models.map((m: { name: string }) => ({
            name: m.name,
            displayName: m.name
          }));
          setAvailableModels(modelsList);
          if (modelsList.length > 0 && !modelsList.find((m: ModelInfo) => m.name === localModel)) {
            setLocalModel(modelsList[0].name);
          }
        } else {
          throw new Error('Invalid response format');
        }
      } else {
        // OpenAI Compatible (OpenAI, DeepSeek, Groq)
        const url = `${cleanBaseUrl}/models`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${localApiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        if (data.data && Array.isArray(data.data)) {
          const modelsList = data.data.map((m: { id: string }) => ({
            name: m.id,
            displayName: m.id
          }));
          setAvailableModels(modelsList);
          if (modelsList.length > 0 && !modelsList.find((m: ModelInfo) => m.name === localModel)) {
            setLocalModel(modelsList[0].name);
          }
        } else {
          throw new Error('Invalid response format');
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setModelError('获取模型列表失败，请检查 API 密钥和接口地址');
      // Fallbacks
      if (localApiProvider === 'gemini') {
        setAvailableModels([
          { name: 'gemini-1.5-flash', displayName: 'gemini-1.5-flash (默认)' },
          { name: 'gemini-1.5-pro', displayName: 'gemini-1.5-pro' },
          { name: 'gemini-2.0-flash', displayName: 'gemini-2.0-flash' }
        ]);
      } else if (localApiProvider === 'deepseek') {
        setAvailableModels([
          { name: 'deepseek-chat', displayName: 'deepseek-chat (默认)' },
          { name: 'deepseek-reasoner', displayName: 'deepseek-reasoner' }
        ]);
      } else if (localApiProvider === 'groq') {
        setAvailableModels([
          { name: 'llama3-8b-8192', displayName: 'llama3-8b-8192 (默认)' },
          { name: 'llama3-70b-8192', displayName: 'llama3-70b-8192' },
          { name: 'mixtral-8x7b-32768', displayName: 'mixtral-8x7b-32768' }
        ]);
      } else if (localApiProvider === 'anthropic') {
        setAvailableModels([
          { name: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet' },
          { name: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku' },
          { name: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus' },
        ]);
      } else if (localApiProvider === 'ollama') {
        setAvailableModels([
          { name: 'llama3', displayName: 'llama3 (默认)' },
          { name: 'qwen2.5', displayName: 'qwen2.5' }
        ]);
      } else {
        setAvailableModels([
          { name: 'gpt-4o-mini', displayName: 'gpt-4o-mini (默认)' },
          { name: 'gpt-4o', displayName: 'gpt-4o' },
          { name: 'claude-3-5-sonnet-20240620', displayName: 'claude-3-5-sonnet' }
        ]);
      }
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Fetch models on mount if we have an API key
  useEffect(() => {
    if (localApiKey || localApiProvider === 'ollama' || localApiProvider === 'anthropic') {
      fetchModels();
    } else {
      // Set defaults if no API key
      if (localApiProvider === 'gemini') {
        setAvailableModels([
          { name: 'gemini-1.5-flash', displayName: 'gemini-1.5-flash (默认)' },
          { name: 'gemini-1.5-pro', displayName: 'gemini-1.5-pro' },
          { name: 'gemini-2.0-flash', displayName: 'gemini-2.0-flash' }
        ]);
      } else if (localApiProvider === 'deepseek') {
        setAvailableModels([
          { name: 'deepseek-chat', displayName: 'deepseek-chat (默认)' },
          { name: 'deepseek-reasoner', displayName: 'deepseek-reasoner' }
        ]);
      } else if (localApiProvider === 'groq') {
        setAvailableModels([
          { name: 'llama3-8b-8192', displayName: 'llama3-8b-8192 (默认)' },
          { name: 'llama3-70b-8192', displayName: 'llama3-70b-8192' },
          { name: 'mixtral-8x7b-32768', displayName: 'mixtral-8x7b-32768' }
        ]);
      } else if (localApiProvider === 'anthropic') {
        setAvailableModels([
          { name: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet' },
          { name: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku' },
          { name: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus' },
        ]);
      } else if (localApiProvider === 'ollama') {
        setAvailableModels([
          { name: 'llama3', displayName: 'llama3 (默认)' },
          { name: 'qwen2.5', displayName: 'qwen2.5' }
        ]);
      } else {
        setAvailableModels([
          { name: 'gpt-4o-mini', displayName: 'gpt-4o-mini (默认)' },
          { name: 'gpt-4o', displayName: 'gpt-4o' },
          { name: 'claude-3-5-sonnet-20240620', displayName: 'claude-3-5-sonnet' }
        ]);
      }
    }
  }, [localApiProvider]);

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value as ApiProvider;
    setLocalApiProvider(newProvider);
    
    // Load the saved config for the newly selected provider, fallback to default if missing
    const newConfig = providerConfigs[newProvider] || defaultProviderConfigs[newProvider];
    if (newConfig) {
      setLocalApiKey(newConfig.apiKey);
      setLocalBaseUrl(newConfig.baseUrl);
      setLocalModel(newConfig.model);
    }
  };

  const handleSave = () => {
    const provider = localApiProvider as ApiProvider;
    setActiveProvider(provider);
    setSettings(provider, {
      apiKey: localApiKey,
      baseUrl: localBaseUrl,
      model: localModel,
    });
    setIsSettingsOpen(false);
  };

  return (
    <div className="absolute inset-0 bg-white dark:bg-primary z-50 flex flex-col animate-in slide-in-from-bottom-4 fade-in duration-200">
      <header className="h-[60px] border-b border-gray-200 dark:border-gray-800 flex items-center px-4 shrink-0">
        <button
          onClick={() => setIsSettingsOpen(false)}
          className="p-2 -ml-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300 mr-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-lg">模型与 API 设置</h2>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            API 提供商
          </label>
          <select
            value={localApiProvider}
            onChange={handleProviderChange}
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI 兼容接口</option>
            <option value="deepseek">DeepSeek</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="groq">Groq</option>
            <option value="ollama">Ollama (本地模型)</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            API 密钥 (API Key)
          </label>
          <input
            type="password"
            value={localApiKey}
            onChange={(e) => setLocalApiKey(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
          <p className="text-xs text-gray-500">
            你的 API 密钥仅保存在浏览器本地，不会上传到任何第三方服务器。
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            自定义接口地址 (Base URL)
          </label>
          <input
            type="text"
            value={localBaseUrl}
            onChange={(e) => setLocalBaseUrl(e.target.value)}
            placeholder="https://generativelanguage.googleapis.com/v1beta"
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
          <p className="text-xs text-gray-500">
            如果你使用代理或第三方中转，请在此修改。
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              模型选择
            </label>
            <button
              onClick={fetchModels}
              disabled={isLoadingModels || !localApiKey}
              className="flex items-center gap-1 text-xs text-accent hover:text-blue-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
              获取模型
            </button>
          </div>
          <select
            value={localModel}
            onChange={(e) => setLocalModel(e.target.value)}
            disabled={isLoadingModels}
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:bg-gray-50 disabled:dark:bg-gray-800"
          >
            {availableModels.map((m) => (
              <option key={m.name} value={m.name}>
                {m.displayName}
              </option>
            ))}
          </select>
          {modelError && (
            <p className="text-xs text-red-500 mt-1">{modelError}</p>
          )}
        </div>
      </main>

      <footer className="p-4 border-t border-gray-200 dark:border-gray-800 shrink-0">
        <button
          onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-blue-600 text-white py-2.5 rounded-md font-medium transition-colors"
        >
          <Save className="w-4 h-4" />
          保存并返回
        </button>
      </footer>
    </div>
  );
}
