import { Readability } from '@mozilla/readability';

function extractContent() {
  // Clone the document to avoid modifying the actual page
  const documentClone = document.cloneNode(true) as Document;

  const reader = new Readability(documentClone);
  const article = reader.parse();

  if (article && article.textContent && article.textContent.trim().length > 0) {
    return {
      title: article.title,
      content: article.textContent,
      url: window.location.href
    };
  }

  return {
    title: document.title,
    content: document.body.innerText,
    url: window.location.href
  };
}

// 页面 JS 快速分析（秒级）
function analyzePage() {
  const html = document.documentElement.outerHTML;
  const result: any = {};

  // JS 文件提取
  const scriptMatches = html.match(/<script[^>]*src=["']([^"']+)["']/gi) || [];
  const jsFiles: string[] = [];
  for (const match of scriptMatches) {
    const srcMatch = match.match(/src=["']([^"']+)["']/);
    if (srcMatch && srcMatch[1]) jsFiles.push(srcMatch[1]);
  }
  result.jsFiles = jsFiles;

  // 敏感信息检测
  const secrets: string[] = [];
  let m = html.match(/AKIA[0-9A-Z]{16}/g); if (m) secrets.push(...m);
  m = html.match(/gh[pousr]_[a-zA-Z0-9_]{36,}/g); if (m) secrets.push(...m);
  m = html.match(/glpat-[a-zA-Z0-9-=_]{20,}/g); if (m) secrets.push(...m);
  m = html.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}/g); if (m) secrets.push(...m);
  m = html.match(/AIza[0-9A-Za-z_-]{35}/g); if (m) secrets.push(...m);
  result.secrets = [...new Set(secrets)];

  // 加密函数检测
  const encryptions: string[] = [];
  if (html.match(/CryptoJS\.AES/i)) encryptions.push('CryptoJS.AES');
  if (html.match(/CryptoJS\.DES/i)) encryptions.push('CryptoJS.DES');
  if (html.match(/CryptoJS\./i)) encryptions.push('CryptoJS');
  if (html.match(/\batob\(/g)) encryptions.push('atob');
  if (html.match(/\bbtoa\(/g)) encryptions.push('btoa');
  if (html.match(/MD5\(/gi)) encryptions.push('MD5');
  if (html.match(/SHA256\(/gi)) encryptions.push('SHA256');
  if (html.match(/SHA512\(/gi)) encryptions.push('SHA512');
  if (html.match(/SHA1\(/gi)) encryptions.push('SHA1');
  if (html.match(/crypto\.subtle/i)) encryptions.push('SubtleCrypto');
  if (html.match(/JSEncrypt/i)) encryptions.push('JSEncrypt');
  result.encryptions = [...new Set(encryptions)];

  // 危险函数检测
  const dangerous: string[] = [];
  if (html.match(/\beval\(/g)) dangerous.push('eval()');
  if (html.match(/document\.write\(/g)) dangerous.push('document.write()');
  if (html.match(/\binnerHTML\s*=/g)) dangerous.push('innerHTML');
  if (html.match(/\bouterHTML\s*=/g)) dangerous.push('outerHTML');
  if (html.match(/\bFunction\(/g)) dangerous.push('Function()');
  result.dangerous = dangerous;

  // URL 提取
  const urls = html.match(/https?:\/\/[^\s'"<>]+/g) || [];
  result.urls = [...new Set(urls)].slice(0, 100);

  // IP 和端口
  const ips = html.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g) || [];
  result.ips = [...new Set(ips)];

  // 域名提取
  const domains = html.match(/https?:\/\/([a-zA-Z0-9][a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}/g) || [];
  result.domains = [...new Set(domains)].map((d: string) => d.replace(/https?:\/\//, ''));

  // 路由守卫检测（Vue）
  const routerGuards: any = { guards: [], protectedRoutes: [], loginRedirect: null, authLogic: [], techStack: 'unknown' };
  if (html.match(/vue.*\.min\.js/i) || html.match(/new Vue\s*\(/i) || html.match(/createApp\s*\(/i)) {
    routerGuards.techStack = 'vue';
    if (html.match(/router\.beforeEach\s*\(/i)) routerGuards.guards.push({ type: 'beforeEach', code: 'router.beforeEach', purpose: 'auth' });
    if (html.match(/beforeEnter\s*:/i)) routerGuards.guards.push({ type: 'beforeEnter', code: 'beforeEnter', purpose: 'auth' });
    const routeMatch = html.match(/path:\s*['"]([^'"]+)['"]/g);
    if (routeMatch) {
      const routes: string[] = [];
      for (const rm of routeMatch) {
        const p = rm.match(/['"]([^'"]+)['"]/);
        if (p && p[1]) routes.push(p[1]);
      }
      routerGuards.protectedRoutes = [...new Set(routes)].slice(0, 20);
    }
  }
  result.routerGuards = routerGuards;

  // 邮箱和手机号
  result.emails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  result.phones = html.match(/1[3-9]\d{9}/g) || [];

  return result;
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'EXTRACT_CONTENT') {
    const content = extractContent();
    sendResponse(content);
    return true;
  }

  // 获取页面所有 JS 文件 URL
  if (request.action === 'GET_JS_FILES') {
    const html = document.documentElement.outerHTML;
    const scriptMatches = html.match(/<script[^>]*src=["']([^"']+)["']/gi) || [];
    const jsFiles: string[] = [];
    for (const match of scriptMatches) {
      const srcMatch = match.match(/src=["']([^"']+)["']/);
      if (srcMatch && srcMatch[1]) {
        // 转换为绝对 URL
        try {
          const absoluteUrl = new URL(srcMatch[1], window.location.href).href;
          jsFiles.push(absoluteUrl);
        } catch {
          jsFiles.push(srcMatch[1]);
        }
      }
    }
    sendResponse({ jsFiles });
    return true;
  }

  // JS 页面分析 - 直接在 content script 中执行（秒级）
  if (request.action === 'ANALYZE_CURRENT_PAGE') {
    console.log('[Content] Starting page analysis...');
    const result = analyzePage();
    console.log('[Content] Analysis complete:', result);
    sendResponse(result);
    return true;
  }

  return false;
});
