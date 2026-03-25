import { useEffect } from 'react';
import { Settings, X, MessageSquarePlus, AlignLeft } from 'lucide-react';
import { useStore } from '../store';
import { Readability } from '@mozilla/readability';

export function Header() {
  const { 
    isSettingsOpen, setIsSettingsOpen, 
    pageContext, setPageContext, 
    isDrawerOpen, setIsDrawerOpen,
    createNewSession, getCurrentSession
  } = useStore();
  
  const currentSession = getCurrentSession();

  useEffect(() => {
    const extractContext = async () => {
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
    };

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
  }, [setPageContext]);

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
      </div>

      <div className="flex-1 flex justify-center px-2 overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700 text-xs max-w-[180px] shadow-sm transition-all">
          {pageContext ? (
            <>
              <div className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 shadow-[0_0_8px_#10B981]"></span>
              </div>
              <span className="truncate text-slate-600 dark:text-slate-300 font-medium">
                {pageContext.title || '已读取网页'}
              </span>
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
