import { useEffect, useState, useCallback } from 'react';
import { Settings, X, MessageSquarePlus, AlignLeft, Bot, BookOpen, Languages, Code, RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import { Readability } from '@mozilla/readability';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen,
  Languages,
  Code,
  Bot,
};

export function Header() {
  const {
    isSettingsOpen, setIsSettingsOpen,
    pageContext, setPageContext,
    isDrawerOpen, setIsDrawerOpen,
    createNewSession, getCurrentSession,
    getCurrentAgent,
    isAgentDrawerOpen, setIsAgentDrawerOpen,
  } = useStore();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const currentSession = getCurrentSession();
  const currentAgent = getCurrentAgent();
  const AgentIcon = iconMap[currentAgent.icon] || Bot;

  const extractContext = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Skip restricted URLs
      if (!tab || !tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        setPageContext(null);
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return {
            html: document.documentElement.outerHTML,
            title: document.title,
            url: window.location.href
          };
        }
      });

      if (results && results[0] && results[0].result) {
        const { html, title, url } = results[0].result;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const reader = new Readability(doc);
        const article = reader.parse();

        if (article && article.textContent && article.textContent.trim().length > 0) {
          setPageContext({
            title: article.title || title,
            content: article.textContent,
            url: url
          });
        } else {
          // Fallback
          setPageContext({
            title: title,
            content: doc.body?.textContent || '',
            url: url
          });
        }
      } else {
        setPageContext(null);
      }
    } catch (error) {
      console.error('Failed to extract context:', error);
      setPageContext(null);
    }
  }, [setPageContext]);

  const handleRefresh = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    await extractContext();

    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = 'fixed top-20 right-4 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm font-medium animate-pulse';
    toast.textContent = '页面内容已更新';
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 2000);

    setIsRefreshing(false);
  };

  useEffect(() => {
    extractContext();

    // Listen for tab changes
    chrome.tabs.onActivated.addListener(extractContext);

    const handleTabUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status === 'complete') {
        extractContext();
      }
    };
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(extractContext);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    };
  }, [extractContext]);

  return (
    <header className="h-[60px] border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 shrink-0 bg-white dark:bg-primary relative z-10">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          className="p-1.5 -ml-1.5 mr-0.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
          title="历史记录"
        >
          <AlignLeft className="w-5 h-5" />
        </button>
        <div className="font-semibold text-base flex items-center gap-2 text-slate-800 dark:text-slate-100">
          <img src="/icons/icon48.png" alt="Logo" className="w-5 h-5 rounded overflow-hidden" />
          <span className="hidden sm:inline tracking-tight">LuminaSider</span>
        </div>
        <button
          onClick={() => setIsAgentDrawerOpen(!isAgentDrawerOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300 ml-2"
          title="切换智能体"
        >
          <AgentIcon className="w-4 h-4" />
          <span className="text-xs font-medium hidden sm:inline max-w-[80px] truncate">{currentAgent.name}</span>
        </button>
      </div>

      <div className="flex-1 flex justify-center px-2 overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700 text-xs max-w-[240px] shadow-sm transition-all">
          {pageContext ? (
            <>
              <div className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 shadow-[0_0_8px_#10B981]"></span>
              </div>
              <span className="truncate text-slate-600 dark:text-slate-300 font-medium flex-1">
                {pageContext.title || '已读取网页'}
              </span>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-1 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="刷新页面内容"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </>
          ) : (
            <>
              <div className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-slate-300 dark:bg-slate-600"></span>
              </div>
              <span className="truncate text-slate-500 dark:text-slate-400">未读取网页</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {currentSession?.messages.length ? (
          <button
            onClick={() => createNewSession()}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
            title="新建对话"
          >
            <MessageSquarePlus className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        ) : null}
        <button
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300"
          title="设置"
        >
          <Settings className="w-5 h-5" />
        </button>
        <button
          onClick={() => window.close()}
          className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300"
          title="关闭"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
