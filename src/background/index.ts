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

// ─────────────────────────────────────────────
// FindSomething 风格的信息提取函数（必须在使用前定义）
// ─────────────────────────────────────────────

// 敏感信息正则（简化版核心规则）
const NUCLEI_REGEX = [
  /["']?(api[_-]?key|apikey)["']?\s*[:=]\s*["']?[\w-]{10,}["']?/gi,
  /["']?(secret[_-]?key|secretkey)["']?\s*[:=]\s*["']?[\w-]{10,}["']?/gi,
  /["']?(password|passwd|pwd)["']?\s*[:=]\s*["'][^"']{3,}["']/gi,
  /["']?(token)["']?\s*[:=]\s*["']?[\w-]{10,}["']?/gi,
  /["']?(access[_-]?key)["']?\s*[:=]\s*["']?[\w-]{10,}["']?/gi,
  /["']?(client[_-]?secret)["']?\s*[:=]\s*["']?[\w-]{10,}["']?/gi,
  /AKIA[0-9A-Z]{16}/g,
  /gh[pousr]_[a-zA-Z0-9_]{36,}/g,
  /glpat-[a-zA-Z0-9\-=_]{20,}/g,
  /AIza[0-9A-Za-z_\-]{35}/g,
];

// 加密算法正则
const ALGORITHM_REGEX = /\W(Base64\.encode|Base64\.decode|btoa|atob|CryptoJS\.AES|CryptoJS\.DES|JSEncrypt|rsa|KJUR|$\.md5|md5|sha1|sha256|sha512)[\(\.]/gi;

// 域名正则
const DOMAIN_REGEX = /['"](([a-zA-Z0-9]+:)?\/\/)?[a-zA-Z0-9\-\.]*?\.(xin|com|cn|net|com.cn|vip|top|cc|shop|club|wang|xyz|luxe|site|news|pub|fun|online|win|red|loan|ren|mom|net\.cn|org|link|biz|bid|help|tech|date|mobi|so|me|tv|co|vc|pw|video|party|pics|website|store|ltd|ink|trade|live|wiki|space|gift|lol|work|band|info|click|photo|market|tel|social|press|game|kim|org\.cn|games|pro|men|love|studio|rocks|asia|group|science|design|software|engineer|lawyer|fit|beer|tw)(\:\d{1,5})?(\/)?['"]/gi;

// 路径正则
const PATH_REGEX = /['"](?:\/|\.\.\/|\.\/)[^\/\>\< \)\(\{\}\,\'\"\\]([^\>\< \)\(\{\}\,\'\"\\])*?['"]/g;

// 不完整路径正则
const INCOMPLETE_PATH_REGEX = /['"][^\/\>\< \)\(\{\}\,\'\"\\][\w\/]*?\/[\w\/]*?['"]/g;

// IP:端口正则
const IP_PORT_REGEX = /['"](([a-zA-Z0-9]+:)?\/\/)?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\:\d{1,5}(\/.*?)?['"]/g;

// JWT 正则
const JWT_REGEX = /['"](ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,})['"]/g;

// 从数据中提取信息
function extractInfo(data: string): any {
  const result: any = {
    secrets: [],
    encryptions: [],
    dangerous: [],
    ips: [],
    ipPorts: [],
    domains: [],
    urls: [],
    paths: [],
    incompletePaths: [],
    emails: [],
    phones: [],
    idCards: [],
    jwts: [],
    routerGuards: null
  };

  // 敏感信息
  for (const regex of NUCLEI_REGEX) {
    const matches = data.match(regex);
    if (matches) {
      result.secrets.push(...matches);
    }
  }

  // 加密算法
  const algoMatches = data.match(ALGORITHM_REGEX);
  if (algoMatches) {
    result.encryptions = [...new Set(algoMatches.map((m: string) => m.replace(/^\W/, '').slice(0, 20)))];
  }

  // 危险函数
  if (data.match(/\beval\(/g)) result.dangerous.push('eval()');
  if (data.match(/document\.write\(/g)) result.dangerous.push('document.write()');
  if (data.match(/\binnerHTML\s*=/g)) result.dangerous.push('innerHTML');
  if (data.match(/\bouterHTML\s*=/g)) result.dangerous.push('outerHTML');
  if (data.match(/\bFunction\(/g)) result.dangerous.push('Function()');

  // IP 地址
  const ipMatches = data.match(/['"](([a-zA-Z0-9]+:)?\/\/)?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/.*?)?['"]/g);
  if (ipMatches) {
    result.ips = ipMatches.map((m: string) => m.replace(/['"]/g, ''));
  }

  // IP:端口
  const ipPortMatches = data.match(IP_PORT_REGEX);
  if (ipPortMatches) {
    result.ipPorts = ipPortMatches.map((m: string) => m.replace(/['"]/g, ''));
  }

  // 域名
  const domainMatches = data.match(DOMAIN_REGEX);
  if (domainMatches) {
    result.domains = domainMatches.map((m: string) => m.replace(/['"]/g, ''));
  }

  // URL（完整）
  const urlMatches = data.match(/['"](([a-zA-Z0-9]+:)?\/\/)?[a-zA-Z0-9\-\.]*?\.(xin|com|cn|net|com\.cn|vip|top|cc|shop|club|wang|xyz|luxe|site|news|pub|fun|online|win|red|loan|ren|mom|net\.cn|org|link|biz|bid|help|tech|date|mobi|so|me|tv|co|vc|pw|video|party|pics|website|store|ltd|ink|trade|live|wiki|space|gift|lol|work|band|info|click|photo|market|tel|social|press|game|kim|org\.cn|games|pro|men|love|studio|rocks|asia|group|science|design|software|engineer|lawyer|fit|beer|tw)(\:\d{1,5})?(\/.*?)?['"]/gi);
  if (urlMatches) {
    result.urls = urlMatches.map((m: string) => m.replace(/['"]/g, ''));
  }

  // 路径
  const pathMatches = data.match(PATH_REGEX);
  if (pathMatches) {
    result.paths = pathMatches.map((m: string) => m.replace(/['"]/g, ''));
  }

  // 不完整路径
  const incompletePathMatches = data.match(INCOMPLETE_PATH_REGEX);
  if (incompletePathMatches) {
    result.incompletePaths = incompletePathMatches.map((m: string) => m.replace(/['"]/g, ''));
  }

  // 邮箱
  const emailMatches = data.match(/['"][a-zA-Z0-9\._\-]*@[a-zA-Z0-9\._\-]{1,63}\.[a-zA-Z]{2,}['"]/g);
  if (emailMatches) {
    result.emails = emailMatches.map((m: string) => m.replace(/['"]/g, ''));
  }

  // 手机号
  const phoneMatches = data.match(/['"]1(3([0-35-9]\d|4[1-8])|4[14-9]\d|5([\d]\d|7[1-79])|66\d|7[2-35-8]\d|8\d{2}|9[89]\d)\d{7}['"]/g);
  if (phoneMatches) {
    result.phones = phoneMatches.map((m: string) => m.replace(/['"]/g, ''));
  }

  // 身份证
  const idCardMatches = data.match(/['"]((\d{8}(0\d|10|11|12)([0-2]\d|30|31)\d{3}$)|(\d{6}(18|19|20)\d{2}(0[1-9]|10|11|12)([0-2]\d|30|31)\d{3}(\d|X|x)))['"]/g);
  if (idCardMatches) {
    result.idCards = idCardMatches.map((m: string) => m.replace(/['"]/g, ''));
  }

  // JWT
  const jwtMatches = data.match(JWT_REGEX);
  if (jwtMatches) {
    result.jwts = jwtMatches.map((m: string) => m.replace(/['"]/g, ''));
  }

  // Vue 路由守卫检测
  if (data.match(/vue.*\.min\.js/i) || data.match(/new Vue\s*\(/i) || data.match(/createApp\s*\(/i)) {
    const guards: any[] = [];
    const protectedRoutes: string[] = [];

    if (data.match(/router\.beforeEach\s*\(/i)) {
      guards.push({ type: 'beforeEach', code: 'router.beforeEach', purpose: 'auth' });
    }
    if (data.match(/beforeEnter\s*:/i)) {
      guards.push({ type: 'beforeEnter', code: 'beforeEnter', purpose: 'auth' });
    }

    const routeMatch = data.match(/path:\s*['"]([^'"]+)['"]/g);
    if (routeMatch) {
      for (const rm of routeMatch) {
        const p = rm.match(/['"]([^'"]+)['"]/);
        if (p && p[1]) protectedRoutes.push(p[1]);
      }
    }

    result.routerGuards = {
      techStack: 'vue',
      guards,
      protectedRoutes: [...new Set(protectedRoutes)].slice(0, 20)
    };
  }

  return result;
}

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

  // 页面 JS 分析（秒级快速版）- 通过 background script 执行
  if (request.action === 'ANALYZE_CURRENT_PAGE') {
    const tabId = request.tabId;
    console.log('[LuminaSider BG] Analyzing current page, tab:', tabId);

    const performAnalysis = (targetTabId: number) => {
      const analysisCode = "(function() {" +
        "var html = document.documentElement.outerHTML;" +
        "var result = {};" +
        "var scriptMatches = html.match(/<script[^>]*src=[\"']([^\"']+)[\"']/gi) || [];" +
        "var jsFiles = [];" +
        "for (var i = 0; i < scriptMatches.length; i++) {" +
        "var match = scriptMatches[i].match(/src=[\"']([^\"']+)[\"']/);" +
        "if (match && match[1]) jsFiles.push(match[1]);" +
        "}" +
        "result.jsFiles = jsFiles;" +
        "var secrets = [];" +
        "var m = html.match(/AKIA[0-9A-Z]{16}/g); if (m) secrets = secrets.concat(m);" +
        "m = html.match(/gh[pousr]_[a-zA-Z0-9_]{36,}/g); if (m) secrets = secrets.concat(m);" +
        "m = html.match(/glpat-[a-zA-Z0-9-=_]{20,}/g); if (m) secrets = secrets.concat(m);" +
        "m = html.match(/eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9._-]{10,}/g); if (m) secrets = secrets.concat(m);" +
        "m = html.match(/AIza[0-9A-Za-z_-]{35}/g); if (m) secrets = secrets.concat(m);" +
        "result.secrets = [...new Set(secrets)];" +
        "var encryptions = [];" +
        "if (html.match(/CryptoJS\\.AES/i)) encryptions.push('CryptoJS.AES');" +
        "if (html.match(/CryptoJS\\.DES/i)) encryptions.push('CryptoJS.DES');" +
        "if (html.match(/CryptoJS\\./i)) encryptions.push('CryptoJS');" +
        "if (html.match(/\\batob\\(/g)) encryptions.push('atob');" +
        "if (html.match(/\\bbtoa\\(/g)) encryptions.push('btoa');" +
        "if (html.match(/MD5\\(/gi)) encryptions.push('MD5');" +
        "if (html.match(/SHA256\\(/gi)) encryptions.push('SHA256');" +
        "if (html.match(/SHA512\\(/gi)) encryptions.push('SHA512');" +
        "if (html.match(/SHA1\\(/gi)) encryptions.push('SHA1');" +
        "result.encryptions = [...new Set(encryptions)];" +
        "var dangerous = [];" +
        "if (html.match(/\\beval\\(/g)) dangerous.push('eval()');" +
        "if (html.match(/document\\.write\\(/g)) dangerous.push('document.write()');" +
        "if (html.match(/\\binnerHTML\\s*=/g)) dangerous.push('innerHTML');" +
        "if (html.match(/\\bouterHTML\\s*=/g)) dangerous.push('outerHTML');" +
        "if (html.match(/\\bFunction\\(/g)) dangerous.push('Function()');" +
        "result.dangerous = dangerous;" +
        "var urls = html.match(/https?:\\/\\/[^\\s'\"<>]+/g) || [];" +
        "result.urls = [...new Set(urls)].slice(0, 100);" +
        "var ips = html.match(/\\b(?:\\d{1,3}\\.){3}\\d{1,3}(?::\\d+)?\\b/g) || [];" +
        "result.ips = [...new Set(ips)];" +
        "var domains = html.match(/https?:\\/\\/([a-zA-Z0-9][a-zA-Z0-9-]*\\.)+[a-zA-Z]{2,}/g) || [];" +
        "result.domains = [...new Set(domains)].map(function(d) { return d.replace(/https?:\\/\\//, ''); });" +
        "var routerGuards = { guards: [], protectedRoutes: [], loginRedirect: null, authLogic: [], techStack: 'unknown' };" +
        "if (html.match(/vue.*\\.min\\.js/i) || html.match(/new Vue\\s*\\(/i) || html.match(/createApp\\s*\\(/i)) {" +
        "routerGuards.techStack = 'vue';" +
        "if (html.match(/router\\.beforeEach\\s*\\(/i)) routerGuards.guards.push({ type: 'beforeEach', code: 'router.beforeEach', purpose: 'auth' });" +
        "if (html.match(/beforeEnter\\s*:/i)) routerGuards.guards.push({ type: 'beforeEnter', code: 'beforeEnter', purpose: 'auth' });" +
        "var routeMatch = html.match(/path:\\s*['\"]([^'\"]+)['\"]/g);" +
        "if (routeMatch) {" +
        "var routes = [];" +
        "for (var j = 0; j < routeMatch.length; j++) {" +
        "var p = routeMatch[j].match(/['\"]([^'\"]+)['\"]/);" +
        "if (p && p[1]) routes.push(p[1]);" +
        "}" +
        "routerGuards.protectedRoutes = [...new Set(routes)].slice(0, 20);" +
        "}" +
        "}" +
        "result.routerGuards = routerGuards;" +
        "result.emails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g) || [];" +
        "result.phones = html.match(/1[3-9]\\d{9}/g) || [];" +
        "return result;" +
        "})()";

      (chrome as any).tabs.executeScript(targetTabId, { code: analysisCode }, (results: any[]) => {
        console.log('[LuminaSider BG] JS analysis results:', results ? 'success' : 'empty');
        if (results && results[0]) {
          sendResponse(results[0]);
        } else {
          sendResponse({ error: 'Failed to analyze page' });
        }
      });
    };

    if (!tabId) {
      findActiveTab().then(tab => {
        if (tab && tab.id) {
          performAnalysis(tab.id);
        } else {
          sendResponse({ error: 'No active tab' });
        }
      });
    } else {
      performAnalysis(tabId);
    }
    return true;
  }

  // 完整 JS 分析：获取所有 JS 文件内容并分析（对齐 FindSomething）
  if (request.action === 'ANALYZE_JS_FILES_FULL') {
    const jsUrls = request.jsUrls || [];
    const currentUrl = request.currentUrl || '';
    console.log('[LuminaSider BG] Full JS analysis, files:', jsUrls.length);

    // 初始化结果
    const combinedResult: any = {
      jsFiles: jsUrls,
      secrets: [],
      encryptions: [],
      dangerous: [],
      ips: [],
      ipPorts: [],
      domains: [],
      urls: [],
      paths: [],
      incompletePaths: [],
      emails: [],
      phones: [],
      idCards: [],
      jwts: [],
      routerGuards: { guards: [], protectedRoutes: [], techStack: 'unknown' }
    };

    // 如果没有 JS 文件，直接返回当前页面的分析
    if (jsUrls.length === 0) {
      sendResponse(combinedResult);
      return true;
    }

    // 使用 fetch 获取 JS 文件并分析
    const fetchAndAnalyze = async () => {
      const myHeaders = new Headers();
      myHeaders.append('accept', '*/*');

      let completed = 0;
      const maxConcurrent = 5; // 最多同时 5 个请求
      let currentIndex = 0;

      const processNext = async () => {
        if (currentIndex >= jsUrls.length) return;

        const url = jsUrls[currentIndex++];
        // 跳过当前页面 URL 和非 JS 文件
        if (url === currentUrl || (!url.endsWith('.js') && !url.includes('.js?'))) {
          completed++;
          processNext();
          return;
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

          const response = await fetch(url, {
            headers: myHeaders,
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            completed++;
            processNext();
            return;
          }

          const text = await response.text();
          const extracted = extractInfo(text);

          // 合并结果
          if (extracted.secrets) combinedResult.secrets.push(...extracted.secrets);
          if (extracted.encryptions) combinedResult.encryptions.push(...extracted.encryptions);
          if (extracted.dangerous) combinedResult.dangerous.push(...extracted.dangerous);
          if (extracted.ips) combinedResult.ips.push(...extracted.ips);
          if (extracted.ipPorts) combinedResult.ipPorts.push(...extracted.ipPorts);
          if (extracted.domains) combinedResult.domains.push(...extracted.domains);
          if (extracted.urls) combinedResult.urls.push(...extracted.urls);
          if (extracted.paths) combinedResult.paths.push(...extracted.paths);
          if (extracted.incompletePaths) combinedResult.incompletePaths.push(...extracted.incompletePaths);
          if (extracted.emails) combinedResult.emails.push(...extracted.emails);
          if (extracted.phones) combinedResult.phones.push(...extracted.phones);
          if (extracted.idCards) combinedResult.idCards.push(...extracted.idCards);
          if (extracted.jwts) combinedResult.jwts.push(...extracted.jwts);

          // Vue 路由守卫检测
          if (extracted.routerGuards) {
            if (extracted.routerGuards.techStack === 'vue') {
              combinedResult.routerGuards.techStack = 'vue';
              if (extracted.routerGuards.guards) {
                combinedResult.routerGuards.guards.push(...extracted.routerGuards.guards);
              }
              if (extracted.routerGuards.protectedRoutes) {
                combinedResult.routerGuards.protectedRoutes.push(...extracted.routerGuards.protectedRoutes);
              }
            }
          }

        } catch (e) {
          // 忽略错误，继续处理下一个
          console.log('[LuminaSider BG] Fetch error:', url, e);
        }

        completed++;
        console.log('[LuminaSider BG] Progress:', completed, '/', jsUrls.length);

        if (completed < jsUrls.length) {
          processNext();
        } else {
          // 去重
          combinedResult.secrets = [...new Set(combinedResult.secrets)];
          combinedResult.encryptions = [...new Set(combinedResult.encryptions)];
          combinedResult.dangerous = [...new Set(combinedResult.dangerous)];
          combinedResult.ips = [...new Set(combinedResult.ips)];
          combinedResult.ipPorts = [...new Set(combinedResult.ipPorts)];
          combinedResult.domains = [...new Set(combinedResult.domains)];
          combinedResult.urls = [...new Set(combinedResult.urls)].slice(0, 200);
          combinedResult.paths = [...new Set(combinedResult.paths)].slice(0, 100);
          combinedResult.incompletePaths = [...new Set(combinedResult.incompletePaths)].slice(0, 50);
          combinedResult.emails = [...new Set(combinedResult.emails)];
          combinedResult.phones = [...new Set(combinedResult.phones)];
          combinedResult.idCards = [...new Set(combinedResult.idCards)];
          combinedResult.jwts = [...new Set(combinedResult.jwts)];

          console.log('[LuminaSider BG] Full analysis complete, sending response');
          sendResponse(combinedResult);
        }
      };

      // 启动多个并发请求
      const promises = [];
      for (let i = 0; i < maxConcurrent; i++) {
        promises.push(processNext());
      }
    };

    fetchAndAnalyze();
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
