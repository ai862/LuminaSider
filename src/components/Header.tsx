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
      // Detect Firefox by checking the user agent
      const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
      console.log('[LuminaSider] Browser detected:', isFirefox ? 'Firefox' : 'Chrome');

      // Get active tab - always use background script for Firefox
      let tab: chrome.tabs.Tab | undefined;

      if (isFirefox) {
        // Firefox: Always use background script to get the active tab
        // Use callback-style for better Firefox compatibility
        console.log('[LuminaSider] Requesting active tab from background...');

        const response = await new Promise<any>((resolve) => {
          const timeout = setTimeout(() => {
            console.log('[LuminaSider] sendMessage timeout - no response');
            resolve(null);
          }, 5000);

          (chrome as any).runtime.sendMessage(
            { action: 'GET_ACTIVE_TAB' },
            (response: any) => {
              clearTimeout(timeout);
              console.log('[LuminaSider] sendMessage callback received:', response);
              if (chrome.runtime.lastError) {
                console.log('[LuminaSider] runtime.lastError:', chrome.runtime.lastError);
                resolve(null);
              } else {
                resolve(response);
              }
            }
          );
        });

        console.log('[LuminaSider] Background response:', response);

        if (response && response.tab) {
          tab = response.tab;
          console.log('[LuminaSider] Got tab from background:', tab?.url);
        } else if (response && response.error) {
          console.log('[LuminaSider] Background error:', response.error);
        }
      } else {
        // Chrome: Simple query
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        tab = tabs[0];
      }

      // Skip restricted URLs
      if (!tab || !tab.id || !tab.url ||
          tab.url.startsWith('chrome://') ||
          tab.url.startsWith('edge://') ||
          tab.url.startsWith('about:') ||
          tab.url.startsWith('moz-extension://') ||
          tab.url.startsWith('chrome-extension://')) {
        console.log('[LuminaSider] Skipping restricted URL:', tab?.url);
        setPageContext(null);
        return;
      }

      console.log('[LuminaSider] Extracting content from:', tab.url);

      if (isFirefox) {
        // Firefox MV2: Use background script to extract content with callback style
        console.log('[LuminaSider] Sending EXTRACT_CONTENT_BG to background');

        const response = await new Promise<any>((resolve) => {
          const timeout = setTimeout(() => {
            console.log('[LuminaSider] Content extraction timeout');
            resolve(null);
          }, 10000);

          (chrome as any).runtime.sendMessage(
            {
              action: 'EXTRACT_CONTENT_BG',
              tabId: tab.id
            },
            (response: any) => {
              clearTimeout(timeout);
              console.log('[LuminaSider] Content extraction callback received:', response);
              if (chrome.runtime.lastError) {
                console.log('[LuminaSider] Content extraction lastError:', chrome.runtime.lastError);
                resolve(null);
              } else {
                resolve(response);
              }
            }
          );
        });

        console.log('[LuminaSider] Response from background:', response);

        if (response && !response.error) {
          const { title, url, content } = response;
          if (content && content.trim().length > 0) {
            setPageContext({
              title: title,
              content: content,
              url: url
            });
          } else {
            console.log('[LuminaSider] Empty content');
            setPageContext(null);
          }
        } else {
          console.log('[LuminaSider] Error in response:', response?.error);
          setPageContext(null);
        }
      } else {
        // Chrome: Use scripting API
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
      }
    } catch (error) {
      console.error('[LuminaSider] Failed to extract context:', error);
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
