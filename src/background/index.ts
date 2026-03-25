chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: any) => console.error(error));

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
