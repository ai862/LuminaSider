// Detect browser type (Chrome vs Firefox)
const isFirefox = typeof (chrome as any).runtime.getBrowserInfo === 'function';

// Chrome only: sidePanel API
if (!isFirefox && chrome.sidePanel) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: any) => console.error(error));
}

// Firefox: Click browser action to open sidebar
if (isFirefox) {
  (chrome as any).browserAction.onClicked.addListener(() => {
    const result = (chrome as any).sidebarAction.open();
    // sidebarAction.open() may return undefined in some Firefox versions
    if (result && typeof result.catch === 'function') {
      result.catch((error: any) => console.error(error));
    }
  });
}

// Helper: Promisify chrome APIs for Firefox compatibility
const getLastFocusedWindow = (): Promise<chrome.windows.Window | undefined> => {
  return new Promise((resolve) => {
    chrome.windows.getLastFocused({ populate: true, windowTypes: ['normal'] }, (window) => {
      resolve(window);
    });
  });
};

const getAllWindows = (): Promise<chrome.windows.Window[]> => {
  return new Promise((resolve) => {
    chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }, (windows) => {
      resolve(windows || []);
    });
  });
};

// Helper: Find active tab across all windows
const findActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
  console.log('[LuminaSider BG] Finding active tab...');

  // First try: get from last focused window
  const window = await getLastFocusedWindow();
  console.log('[LuminaSider BG] Last focused window:', window?.id, 'tabs:', window?.tabs?.length);

  if (window && window.tabs) {
    const activeTab = window.tabs.find(t => t.active);
    if (activeTab) {
      console.log('[LuminaSider BG] Found active tab:', activeTab.url);
      return activeTab;
    }
  }

  // Fallback: query all windows
  const windows = await getAllWindows();
  console.log('[LuminaSider BG] All windows:', windows?.length);

  if (windows && windows.length > 0) {
    // Find focused window or first normal window
    const focusedWindow = windows.find(w => w.focused) || windows[0];
    const activeTab = focusedWindow?.tabs?.find(t => t.active);

    if (activeTab) {
      console.log('[LuminaSider BG] Found active tab (fallback):', activeTab.url);
      return activeTab;
    }
  }

  console.log('[LuminaSider BG] No active tab found');
  return null;
};

// Handle messages from sidebar (for Firefox compatibility)
// Firefox MV2 requires special handling - use sendResponse with return true
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  console.log('[LuminaSider BG] Received message:', request.action);

  // Get active tab - works in background context
  if (request.action === 'GET_ACTIVE_TAB') {
    // Use callback-based approach for Firefox MV2 compatibility
    findActiveTab().then(tab => {
      if (tab) {
        console.log('[LuminaSider BG] Sending response with tab:', tab.url);
        sendResponse({ tab });
      } else {
        console.log('[LuminaSider BG] Sending error response: No active tab');
        sendResponse({ error: 'No active tab found' });
      }
    }).catch(error => {
      console.error('[LuminaSider BG] Error finding active tab:', error);
      sendResponse({ error: error?.message || 'Unknown error' });
    });
    return true; // Keep channel open for async response
  }

  // Extract content from tab
  if (request.action === 'EXTRACT_CONTENT_BG') {
    const tabId = request.tabId;
    console.log('[LuminaSider BG] Extracting content from tab:', tabId);

    if (!tabId) {
      console.log('[LuminaSider BG] No tabId provided');
      sendResponse({ error: 'No tabId provided' });
      return true;
    }

    (chrome as any).tabs.executeScript(tabId, {
      code: `
        (function() {
          try {
            const title = document.title;
            const url = window.location.href;
            const content = document.body.innerText;
            return { title, url, content };
          } catch (e) {
            return { error: e.message };
          }
        })()
      `
    }, (results: any[]) => {
      console.log('[LuminaSider BG] executeScript results:', results);
      if (results && results[0]) {
        console.log('[LuminaSider BG] Sending extracted content');
        sendResponse(results[0]);
      } else {
        console.log('[LuminaSider BG] No results from executeScript');
        sendResponse({ error: 'Failed to extract content - no results' });
      }
    });
    return true;
  }

  // Storage operations - proxy for Firefox sidebar
  // Firefox MV2: Use sendResponse callback for proper async handling
  if (request.action === 'STORAGE_GET') {
    console.log('[LuminaSider BG] STORAGE_GET, keys:', request.keys);
    const storage = (globalThis as any).browser?.storage?.local || chrome.storage.local;
    storage.get(request.keys).then((result: any) => {
      console.log('[LuminaSider BG] STORAGE_GET result:', result);
      sendResponse({ result: result || {} });
    }).catch((error: any) => {
      console.error('[LuminaSider BG] STORAGE_GET error:', error);
      sendResponse({ result: {} });
    });
    return true; // Keep channel open for async response
  }

  if (request.action === 'STORAGE_SET') {
    console.log('[LuminaSider BG] STORAGE_SET, data keys:', Object.keys(request.data || {}));
    const storage = (globalThis as any).browser?.storage?.local || chrome.storage.local;
    storage.set(request.data).then(() => {
      console.log('[LuminaSider BG] STORAGE_SET completed');
      sendResponse({ success: true });
    }).catch((error: any) => {
      console.error('[LuminaSider BG] STORAGE_SET error:', error);
      sendResponse({ success: false, error: String(error) });
    });
    return true; // Keep channel open for async response
  }

  if (request.action === 'STORAGE_REMOVE') {
    console.log('[LuminaSider BG] STORAGE_REMOVE, keys:', request.keys);
    const storage = (globalThis as any).browser?.storage?.local || chrome.storage.local;
    storage.remove(request.keys).then(() => {
      console.log('[LuminaSider BG] STORAGE_REMOVE completed');
      sendResponse({ success: true });
    }).catch((error: any) => {
      console.error('[LuminaSider BG] STORAGE_REMOVE error:', error);
      sendResponse({ success: false, error: String(error) });
    });
    return true; // Keep channel open for async response
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('LuminaSider installed');
});

// 监听 Tab 切换事件，通知 Side Panel 更新上下文
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
      // 向 Side Panel 发送消息，让它去主动拉取 Content Script 的数据
      chrome.runtime.sendMessage({ action: 'TAB_CHANGED', tabId: tab.id });
    }
  });
});

// 监听 Tab 更新事件（如页面加载完成）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
    chrome.runtime.sendMessage({ action: 'TAB_CHANGED', tabId: tabId });
  }
});
