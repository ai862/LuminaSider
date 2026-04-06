import { useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, XCircle, Zap, Copy, Check } from 'lucide-react';
import { useStore } from '../store';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-gray-400" />}
    </button>
  );
}

export function AnalysisCard() {
  const { currentAgentId, jsAnalysisResult, isAnalyzingJs, jsAnalysisError, triggerJsAnalysis, addMessage, generateResponse } = useStore();
  const [showDetails, setShowDetails] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);

  // Only show for pentest agent
  if (currentAgentId !== 'pentest') return null;

  // 计算发现数量
  const findingsCount =
    (jsAnalysisResult?.secrets?.length || 0) +
    (jsAnalysisResult?.encryptions?.length || 0) +
    (jsAnalysisResult?.dangerous?.length || 0) +
    (jsAnalysisResult?.routerGuards?.guards?.length || 0);

  // 计算风险等级
  const riskLevel =
    (jsAnalysisResult?.secrets?.length || 0) > 0 ? 'high' :
    (jsAnalysisResult?.dangerous?.length || 0) > 0 ? 'medium' : 'low';

  const riskColors = { high: 'text-red-500', medium: 'text-yellow-500', low: 'text-green-500' };
  const riskBg = {
    high: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    medium: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    low: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  };

  // AI 分析功能
  const handleAiAnalysis = async () => {
    if (!jsAnalysisResult || isAiAnalyzing) return;

    setIsAiAnalyzing(true);

    // 构建精简的分析数据
    const data = jsAnalysisResult;
    const allIps = [...(data.ips || []), ...(data.ipPorts || [])];
    const allPaths = data.paths || [];

    // 危险函数风险分级
    const dangerLevels: Record<string, string> = {
      'eval()': '高 - 代码执行',
      'document.write()': '高 - XSS',
      'innerHTML': '中 - 存储型XSS风险',
      'outerHTML': '中 - XSS风险',
      'Function()': '高 - 代码执行'
    };
    const riskLevels = (data.dangerous || []).map((d: string) => `${d}(${dangerLevels[d] || '中'})`).join('、');

    // 统计高风险项
    const risks: string[] = [];
    if ((data.secrets || []).length > 0) risks.push('敏感信息泄露');
    if (riskLevels) risks.push(`危险函数(${data.dangerous?.length}处)`);
    if (data.jwts?.length) risks.push('JWT Token暴露');
    if ((data.secrets || []).some((s: string) => /token|password|secret|key/i.test(s))) risks.push('认证凭据泄露');
    if (data.routerGuards?.techStack === 'vue') risks.push('Vue单页应用');

    const prompt = `作为渗透测试专家，分析以下网页安全状况：

【基本信息】
- 技术栈：${data.routerGuards?.techStack || '未知'}
- 框架/路由守卫：${(data.routerGuards?.guards || []).map((g: any) => g.type).join(', ') || '无'}
- 发现风险：${risks.join('、') || '无'}

【认证相关】
${(data.secrets || []).some((s: string) => /token|password|secret|key/i.test(s)) ? `认证凭据：${(data.secrets || []).filter((s: string) => /token|password|secret|key/i.test(s)).slice(0, 3).join('；')}` : '认证凭据：未发现明显泄露'}
${data.jwts?.length ? `JWT：发现 ${data.jwts.length} 个` : ''}

【风险函数】${riskLevels || '无'}

【加密算法】${(data.encryptions || []).slice(0, 6).join('、') || '无'}

【接口】${allPaths.slice(0, 12).join('、') || '无'}

【服务器】${allIps.slice(0, 3).join('、') || (data.domains || []).slice(0, 4).join('、') || '无'}

请输出：
1. **风险评估**（高/中/低）+ 理由
2. **可利用点**（如认证绕过、XSS、接口未授权等）
3. **测试优先级**（先测什么、后测什么）

只输出文字分析。`;

    try {
      await addMessage({
        id: Date.now().toString(),
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      });
      await generateResponse(prompt);
    } catch (e) {
      console.error('AI analysis failed:', e);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  return (
    <div className="mx-4 mt-2 mb-2 space-y-2">
      {/* 分析中状态 */}
      {isAnalyzingJs && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          <div className="flex-1">
            <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
              正在收集页面数据...
            </div>
            <div className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">
              提取 JS、敏感信息、接口等
            </div>
          </div>
        </div>
      )}

      {/* 分析错误 */}
      {jsAnalysisError && !isAnalyzingJs && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <XCircle className="w-5 h-5 text-red-500" />
          <div className="flex-1">
            <div className="text-sm font-medium text-red-700 dark:text-red-300">
              分析失败
            </div>
            <div className="text-xs text-red-500 dark:text-red-400 mt-0.5">
              {jsAnalysisError}
            </div>
          </div>
          <button
            onClick={() => triggerJsAnalysis()}
            className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 rounded-lg hover:bg-red-200"
          >
            重试
          </button>
        </div>
      )}

      {/* 分析完成 - 显示收集到的数据 */}
      {jsAnalysisResult && !isAnalyzingJs && !jsAnalysisError && (
        <div className={`rounded-xl border ${riskBg[riskLevel]}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                riskLevel === 'high' ? 'bg-red-100 dark:bg-red-900/40' :
                riskLevel === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/40' :
                'bg-green-100 dark:bg-green-900/40'
              }`}>
                {riskLevel === 'high' ? (
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                ) : riskLevel === 'medium' ? (
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                )}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  JS 数据收集
                </div>
                <div className={`text-xs font-medium ${riskColors[riskLevel]}`}>
                  风险: {riskLevel.toUpperCase()} · 发现 {findingsCount} 项
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAiAnalysis}
                disabled={isAiAnalyzing}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg ${
                  isAiAnalyzing
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                    : 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 hover:bg-purple-200'
                }`}
              >
                {isAiAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                AI分析
              </button>
              <button
                onClick={() => triggerJsAnalysis()}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
              >
                刷新
              </button>
            </div>
          </div>

          {/* 快速统计 */}
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {jsAnalysisResult.jsFiles?.length > 0 && (
              <span className="px-2 py-1 text-xs bg-white/60 dark:bg-gray-800/60 rounded">📄 JS: {jsAnalysisResult.jsFiles.length}</span>
            )}
            {jsAnalysisResult.secrets?.length > 0 && (
              <span className="px-2 py-1 text-xs bg-white/60 dark:bg-gray-800/60 rounded">🔐 敏感: {jsAnalysisResult.secrets.length}</span>
            )}
            {jsAnalysisResult.encryptions?.length > 0 && (
              <span className="px-2 py-1 text-xs bg-white/60 dark:bg-gray-800/60 rounded">🔒 加密: {jsAnalysisResult.encryptions.length}</span>
            )}
            {jsAnalysisResult.dangerous?.length > 0 && (
              <span className="px-2 py-1 text-xs bg-white/60 dark:bg-gray-800/60 rounded">⚠️ 危险: {jsAnalysisResult.dangerous.length}</span>
            )}
            {(jsAnalysisResult.ips?.length || jsAnalysisResult.ipPorts?.length) > 0 && (
              <span className="px-2 py-1 text-xs bg-white/60 dark:bg-gray-800/60 rounded">🌐 IP: {(jsAnalysisResult.ips?.length || 0) + (jsAnalysisResult.ipPorts?.length || 0)}</span>
            )}
            {jsAnalysisResult.domains?.length > 0 && (
              <span className="px-2 py-1 text-xs bg-white/60 dark:bg-gray-800/60 rounded">🌍 域名: {jsAnalysisResult.domains.length}</span>
            )}
            {jsAnalysisResult.jwts?.length > 0 && (
              <span className="px-2 py-1 text-xs bg-white/60 dark:bg-gray-800/60 rounded">🎫 JWT: {jsAnalysisResult.jwts.length}</span>
            )}
            {jsAnalysisResult.paths?.length > 0 && (
              <span className="px-2 py-1 text-xs bg-white/60 dark:bg-gray-800/60 rounded">📁 路径: {jsAnalysisResult.paths.length}</span>
            )}
            {jsAnalysisResult.routerGuards?.techStack === 'vue' && (
              <span className="px-2 py-1 text-xs bg-white/60 dark:bg-gray-800/60 rounded">🛡️ Vue</span>
            )}
          </div>

          {/* 展开详情 */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full px-4 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-white/30 dark:hover:bg-gray-800/30"
          >
            {showDetails ? '▼ 收起详情' : '▶ 查看详情'}
          </button>

          {/* 详情内容 */}
          {showDetails && (
            <div className="px-4 pb-3 space-y-3 text-xs">
              {/* 敏感信息 */}
              {jsAnalysisResult.secrets?.length > 0 && (
                <div className="border-t border-gray-200/50 dark:border-gray-700/50 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-red-600">🔐 敏感信息 ({jsAnalysisResult.secrets.length})</span>
                    <CopyButton text={jsAnalysisResult.secrets.join('\n')} />
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-1">
                    {jsAnalysisResult.secrets.slice(0, 10).map((s: string, i: number) => (
                      <div key={i} className="font-mono text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50 px-2 py-1 rounded truncate">
                        {s.slice(0, 60)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* IP:端口 */}
              {(jsAnalysisResult.ipPorts?.length > 0 || jsAnalysisResult.ips?.length > 0) && (
                <div className="border-t border-gray-200/50 dark:border-gray-700/50 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-blue-600">🌐 IP/端口 ({((jsAnalysisResult.ips?.length || 0) + (jsAnalysisResult.ipPorts?.length || 0))})</span>
                    <CopyButton text={[...(jsAnalysisResult.ips || []), ...(jsAnalysisResult.ipPorts || [])].join('\n')} />
                  </div>
                  <div className="max-h-20 overflow-y-auto space-y-1">
                    {jsAnalysisResult.ipPorts?.slice(0, 10).map((ip: string, i: number) => (
                      <div key={'p'+i} className="font-mono text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50 px-2 py-1 rounded">
                        {ip}
                      </div>
                    ))}
                    {jsAnalysisResult.ips?.slice(0, 10).map((ip: string, i: number) => (
                      <div key={'i'+i} className="font-mono text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50 px-2 py-1 rounded">
                        {ip}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 域名 */}
              {jsAnalysisResult.domains?.length > 0 && (
                <div className="border-t border-gray-200/50 dark:border-gray-700/50 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-green-600">🌍 域名 ({jsAnalysisResult.domains.length})</span>
                    <CopyButton text={jsAnalysisResult.domains.join('\n')} />
                  </div>
                  <div className="max-h-20 overflow-y-auto flex flex-wrap gap-1">
                    {jsAnalysisResult.domains.slice(0, 20).map((d: string, i: number) => (
                      <span key={i} className="font-mono text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50 px-2 py-0.5 rounded text-xs">
                        {d.slice(0, 40)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* JWT */}
              {jsAnalysisResult.jwts?.length > 0 && (
                <div className="border-t border-gray-200/50 dark:border-gray-700/50 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-purple-600">🎫 JWT ({jsAnalysisResult.jwts.length})</span>
                    <CopyButton text={jsAnalysisResult.jwts.join('\n')} />
                  </div>
                  <div className="max-h-20 overflow-y-auto space-y-1">
                    {jsAnalysisResult.jwts.slice(0, 5).map((jwt: string, i: number) => (
                      <div key={i} className="font-mono text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50 px-2 py-1 rounded text-xs truncate">
                        {jwt.slice(0, 80)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 路径 */}
              {jsAnalysisResult.paths?.length > 0 && (
                <div className="border-t border-gray-200/50 dark:border-gray-700/50 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-600">📁 路径 ({jsAnalysisResult.paths.length})</span>
                    <CopyButton text={jsAnalysisResult.paths.join('\n')} />
                  </div>
                  <div className="max-h-20 overflow-y-auto flex flex-wrap gap-1">
                    {jsAnalysisResult.paths.slice(0, 15).map((p: string, i: number) => (
                      <span key={i} className="font-mono text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50 px-2 py-0.5 rounded text-xs">
                        {p.slice(0, 30)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 加密函数 */}
              {jsAnalysisResult.encryptions?.length > 0 && (
                <div className="border-t border-gray-200/50 dark:border-gray-700/50 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-orange-600">🔒 加密函数 ({jsAnalysisResult.encryptions.length})</span>
                    <CopyButton text={jsAnalysisResult.encryptions.join(', ')} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {jsAnalysisResult.encryptions.map((e: string, i: number) => (
                      <span key={i} className="font-mono text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50 px-2 py-0.5 rounded text-xs">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 危险函数 */}
              {jsAnalysisResult.dangerous?.length > 0 && (
                <div className="border-t border-gray-200/50 dark:border-gray-700/50 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-red-600">⚠️ 危险函数 ({jsAnalysisResult.dangerous.length})</span>
                    <CopyButton text={jsAnalysisResult.dangerous.join(', ')} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {jsAnalysisResult.dangerous.map((d: string, i: number) => (
                      <span key={i} className="font-mono text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50 px-2 py-0.5 rounded text-xs">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Vue 路由守卫 */}
              {jsAnalysisResult.routerGuards?.guards?.length > 0 && (
                <div className="border-t border-gray-200/50 dark:border-gray-700/50 pt-2">
                  <div className="font-medium text-purple-600 mb-1">🛡️ Vue 路由守卫</div>
                  <div className="text-gray-600 dark:text-gray-400">
                    {jsAnalysisResult.routerGuards.guards.map((g: any, i: number) => (
                      <div key={i}>• {g.type}: {g.code}</div>
                    ))}
                    {jsAnalysisResult.routerGuards.protectedRoutes?.length > 0 && (
                      <div className="mt-1">受保护路由: {jsAnalysisResult.routerGuards.protectedRoutes.slice(0, 5).join(', ')}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AnalysisCard;
