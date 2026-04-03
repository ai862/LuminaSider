import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore, getAttachmentBlob, defaultProviderConfigs } from '../store';
import ReactMarkdown from 'react-markdown';
import { Bot, User, Sparkles, Languages, BookOpen, Link, Copy, Check, FileImage, Brain, ChevronDown, ArrowDown, Ban } from 'lucide-react';
import hljs from 'highlight.js';
// DOMPurify is available for future HTML sanitization needs

const AttachmentView = ({ id, mimeType }: { id: string; mimeType: string }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    getAttachmentBlob(id).then(async base64 => {
      if (active && base64) {
        try {
          // Convert base64 to blob for memory-efficient rendering
          const res = await fetch(`data:${mimeType};base64,${base64}`);
          const blob = await res.blob();
          if (active) {
            objectUrl = URL.createObjectURL(blob);
            setDataUrl(objectUrl);
          }
        } catch (e) {
          console.error('Failed to create blob URL', e);
        }
      }
    });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [id, mimeType]);

  if (!dataUrl) {
    return (
      <div className="w-48 h-32 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse flex flex-col items-center justify-center text-gray-400">
        <FileImage className="w-6 h-6 mb-2" />
        <span className="text-xs">加载中...</span>
      </div>
    );
  }

  return (
    <div className="mb-2 max-w-full overflow-hidden rounded-lg border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
      <img src={dataUrl} alt="attachment" className="max-w-full max-h-[300px] object-contain" />
    </div>
  );
};

const CodeBlock = ({ className, children, node, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  const [copied, setCopied] = useState(false);
  const codeString = String(children).replace(/\n$/, '');
  const isBlock = match || codeString.includes('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isBlock) {
    const lang = match ? match[1] : '';
    let highlightedCode = codeString;
    try {
      if (lang && hljs.getLanguage(lang)) {
        highlightedCode = hljs.highlight(codeString, { language: lang }).value;
      } else {
        highlightedCode = hljs.highlightAuto(codeString).value;
      }
    } catch (error) {
      console.warn('highlight error', error);
    }

    return (
      <div className="rounded-lg overflow-hidden my-4 border shadow-sm border-gray-200 dark:border-gray-800 bg-[#0d1117] flex flex-col group/code not-prose font-sans w-full max-w-full">
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-[#1E1E1E] border-b border-gray-200 dark:border-gray-800/60 shrink-0">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-wider truncate">{lang || 'text'}</span>
          <button
            onClick={handleCopy}
            className="flex items-center justify-center p-1 rounded-md hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shrink-0 ml-2"
            title="Copy code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 opacity-0 group-hover/code:opacity-100 transition-opacity" />}
          </button>
        </div>
        <div className="p-3 overflow-x-auto bg-[#0d1117] w-full max-w-full">
          <pre className="!bg-transparent !p-0 !m-0 w-full inline-block">
            <code 
              className="font-mono text-[13px] leading-relaxed text-gray-300 hljs !bg-transparent !p-0 block min-w-full"
              dangerouslySetInnerHTML={{ __html: highlightedCode }} 
            />
          </pre>
        </div>
      </div>
    );
  }

  return (
    <code className="bg-blue-50 dark:bg-blue-900/30 text-accent px-1.5 py-0.5 rounded text-[13px] font-mono break-words" {...props}>
      {children}
    </code>
  );
};

export function ChatArea() {
  const { getCurrentSession, pageContext, addMessage, updateMessageContent, apiProvider, providerConfigs, useContext, getCurrentAgent, isGenerating } = useStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const currentConfig = providerConfigs[apiProvider] || defaultProviderConfigs[apiProvider] || defaultProviderConfigs['gemini'];
  const { apiKey, baseUrl, model } = currentConfig;
  const agentPrompt = getCurrentAgent().systemPrompt;

  const currentSession = getCurrentSession();
  const messages = currentSession?.messages || [];

  // 检测是否在底部
  const checkIfAtBottom = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return true;

    const threshold = 100; // 距离底部 100px 以内视为在底部
    const isBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
    return isBottom;
  }, []);

  // 滚动到底部
  const scrollToBottom = useCallback((smooth = true) => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }, []);

  // 监听滚动事件，更新是否在底部的状态
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const atBottom = checkIfAtBottom();
      setIsAtBottom(atBottom);
      setShowScrollButton(!atBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [checkIfAtBottom]);

  // 智能自动滚动：只有当用户在底部或正在生成时才自动滚动
  useEffect(() => {
    if (isGenerating || isAtBottom) {
      scrollToBottom();
    }
  }, [messages, isGenerating, isAtBottom, scrollToBottom]);

  const handleShortcut = async (promptText: string) => {
    if (!apiKey && apiProvider !== 'ollama') {
      alert('请先在设置中配置 API Key');
      return;
    }

    const userMessageId = Date.now().toString();
    await addMessage({
      id: userMessageId,
      role: 'user',
      content: promptText,
      timestamp: Date.now(),
    }, true);

    const assistantMessageId = (Date.now() + 1).toString();
    await addMessage({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    });

    try {
      if (apiProvider === 'gemini') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        
        let requestOptions = {};
        if (baseUrl && baseUrl !== 'https://generativelanguage.googleapis.com/v1beta') {
          let cleanBaseUrl = baseUrl.replace(/\/$/, '');
          if (cleanBaseUrl.endsWith('/v1beta')) {
            cleanBaseUrl = cleanBaseUrl.slice(0, -7);
          }
          requestOptions = { baseUrl: cleanBaseUrl };
        }

        const generativeModel = genAI.getGenerativeModel(
          { model: model },
          // @ts-ignore
          requestOptions
        );

        let prompt = '';
        
        const isThinkingModel = model.toLowerCase().includes('thinking');

        if (useContext && pageContext) {
          prompt += `${agentPrompt}\n\n<context>\n标题: ${pageContext.title}\n内容: ${pageContext.content}\n</context>\n\n`;
        } else if (agentPrompt) {
          prompt += `${agentPrompt}\n\n`;
        }
        
        // 添加纯文本的历史对话以节约 Token
        const historyMsg = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
        if (historyMsg) {
          prompt += `历史对话:\n${historyMsg}\n\n`;
        }
        
        prompt += `User: ${promptText}\nAssistant:`;

        const result = await generativeModel.generateContentStream(prompt);
        
        let fullStreamText = '';
        let isThinkingPhase = true;
        let splitIndex = -1;
        
        for await (const chunk of result.stream) {
          try {
            const chunkText = chunk.text();
            if (chunkText) {
              fullStreamText += chunkText;
              
              if (isThinkingModel) {
                if (isThinkingPhase) {
                  // 寻找第一个中文字符
                  const chineseCharMatch = fullStreamText.match(/[\u4e00-\u9fa5]/);
                  
                  if (chineseCharMatch && chineseCharMatch.index !== undefined) {
                    isThinkingPhase = false;
                    
                    // 找到中文字符前最近的一个换行符，作为思考过程和正文的物理分界线
                    // 如果没有换行符，就直接以中文字符的位置作为分界线
                    const lastNewlineIndex = fullStreamText.lastIndexOf('\n', chineseCharMatch.index);
                    splitIndex = lastNewlineIndex !== -1 ? lastNewlineIndex : chineseCharMatch.index;
                  }
                }

                if (!isThinkingPhase && splitIndex !== -1) {
                  // 思考阶段已结束，进行切割
                  const reasoningPart = fullStreamText.substring(0, splitIndex).trim();
                  const finalAnswerPart = fullStreamText.substring(splitIndex).trimStart();
                  updateMessageContent(assistantMessageId, finalAnswerPart, reasoningPart);
                } else {
                  // 还在思考阶段，全部作为思考内容
                  updateMessageContent(assistantMessageId, '', fullStreamText);
                }
              } else {
                // 非思考模型，直接更新正文
                updateMessageContent(assistantMessageId, fullStreamText);
              }
            }
          } catch (e) {
            console.warn('Failed to extract text from chunk', e);
          }
        }
      } else if (apiProvider === 'anthropic') {
        // Anthropic (Claude) Provider
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        const url = `${cleanBaseUrl}/messages`;
        
        let systemPrompt = '';
        if (useContext && pageContext) {
          systemPrompt = `${agentPrompt}\n\n<context>\n标题: ${pageContext.title}\n内容: ${pageContext.content}\n</context>`;
        } else {
          systemPrompt = agentPrompt;
        }

        const anthropicMessages: any[] =[];
        for (const msg of messages) {
          anthropicMessages.push({
            role: msg.role,
            content: msg.content
          });
        }
        anthropicMessages.push({
          role: 'user',
          content: promptText
        });

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: model,
            system: systemPrompt || undefined,
            messages: anthropicMessages,
            max_tokens: 4096,
            stream: true
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullResponse = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === 'content_block_delta' && data.delta && data.delta.text) {
                    fullResponse += data.delta.text;
                    updateMessageContent(assistantMessageId, fullResponse);
                  }
                } catch (e) {
                  // Ignore parse errors for incomplete chunks
                }
              }
            }
          }
        }
      } else {
        // OpenAI Compatible Provider (OpenAI, DeepSeek, Groq, Ollama)
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        const url = `${cleanBaseUrl}/chat/completions`;
        
        const openAiMessages: any[] =[];
        
        if (useContext && pageContext) {
          openAiMessages.push({
            role: 'system',
            content: `${agentPrompt}\n\n<context>\n标题: ${pageContext.title}\n内容: ${pageContext.content}\n</context>`
          });
        } else if (agentPrompt) {
          openAiMessages.push({
            role: 'system',
            content: agentPrompt
          });
        }

        for (const msg of messages) {
          openAiMessages.push({
            role: msg.role,
            content: msg.content
          });
        }

        openAiMessages.push({
          role: 'user',
          content: promptText
        });

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: model,
            messages: openAiMessages,
            stream: true
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullResponse = '';
        let fullReasoning = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.choices && data.choices[0].delta) {
                    const delta = data.choices[0].delta;
                    let contentUpdated = false;
                    
                    if (delta.reasoning_content) {
                      fullReasoning += delta.reasoning_content;
                      contentUpdated = true;
                    }
                    
                    if (delta.content) {
                      fullResponse += delta.content;
                      contentUpdated = true;
                    }
                    
                    if (contentUpdated) {
                      updateMessageContent(assistantMessageId, fullResponse, fullReasoning);
                    }
                  }
                } catch (e) {
                  // Ignore parse errors for incomplete chunks
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error generating content:', error);
      updateMessageContent(assistantMessageId, `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
    }
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
          <Bot className="w-8 h-8 text-accent" />
        </div>
        <h3 className="text-lg font-medium mb-2">你好，我是 LuminaSider</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-[280px]">
          {pageContext 
            ? "我已经阅读了当前网页。你可以问我任何问题。" 
            : "我是一个 AI 助手，可以帮你阅读网页、总结内容、解答问题。"}
        </p>

        <div className="flex flex-col gap-2 w-full max-w-[280px]">
          <button 
            onClick={() => handleShortcut('请总结当前网页的核心观点')}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-sm text-left transition-colors border border-gray-100 dark:border-gray-800"
          >
            <Sparkles className="w-4 h-4 text-accent shrink-0" />
            <span className="truncate">总结核心观点</span>
          </button>
          <button 
            onClick={() => handleShortcut('请将当前网页的主要内容翻译为中文')}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-sm text-left transition-colors border border-gray-100 dark:border-gray-800"
          >
            <Languages className="w-4 h-4 text-accent shrink-0" />
            <span className="truncate">翻译为中文</span>
          </button>
          <button 
            onClick={() => handleShortcut('请解释当前网页中出现的专业术语')}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-sm text-left transition-colors border border-gray-100 dark:border-gray-800"
          >
            <BookOpen className="w-4 h-4 text-accent shrink-0" />
            <span className="truncate">解释专业术语</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 relative" ref={chatContainerRef}>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            msg.role === 'user' 
              ? 'bg-gray-100 dark:bg-gray-800' 
              : 'bg-blue-50 dark:bg-blue-900/20'
          }`}>
            {msg.role === 'user' ? (
              <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            ) : (
              <Bot className="w-4 h-4 text-accent" />
            )}
          </div>
          
          <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 flex flex-col gap-1.5 ${
            msg.role === 'user'
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tr-sm'
              : 'bg-transparent text-gray-800 dark:text-gray-200'
          }`}>
            {msg.role === 'user' ? (
              <>
                {msg.attachedContext && (
                  <a
                    href={msg.attachedContext.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700 rounded-full px-2 py-0.5 text-[11px] text-slate-500 hover:text-blue-500 transition-colors self-end truncate max-w-full"
                    title={msg.attachedContext.title}
                  >
                    <Link className="w-3 h-3 shrink-0" />
                    <span className="truncate">📄 引用网页: {msg.attachedContext.title}</span>
                  </a>
                )}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-col gap-2 mt-1">
                    {msg.attachments.map(att => (
                      <AttachmentView key={att.id} id={att.id} mimeType={att.mimeType} />
                    ))}
                  </div>
                )}
                <div className="whitespace-pre-wrap text-sm leading-relaxed select-text">{msg.content}</div>
              </>
            ) : (
              <div className="w-full overflow-hidden">
                {/* Reasoning Content (CoT) */}
                {(() => {
                  let reasoningText = msg.reasoningContent || '';
                  let mainContent = msg.content;

                  // Fallback: Extract <think> tags if reasoningContent is empty but content has it
                  if (!reasoningText && mainContent.includes('<think>')) {
                    const thinkMatch = mainContent.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
                    if (thinkMatch) {
                      reasoningText = thinkMatch[1].trim();
                      mainContent = mainContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/, '').trim();
                    }
                  }

                  if (!reasoningText) return null;

                  const isThinking = msg.reasoningContent 
                    ? !msg.content 
                    : (msg.content.includes('<think>') && !msg.content.includes('</think>'));

                  return (
                    <details 
                      className="group mb-4 rounded-lg border border-gray-200/60 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-800/30 open:bg-gray-50 dark:open:bg-gray-800/50 transition-colors"
                      open={isThinking}
                    >
                      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 select-none hover:text-gray-700 dark:hover:text-gray-200">
                        <Brain className={`w-3.5 h-3.5 ${isThinking ? 'animate-pulse text-blue-500' : ''}`} />
                        <span>{isThinking ? '深度思考中...' : '已深度思考'}</span>
                        <ChevronDown className="w-3.5 h-3.5 ml-auto transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="px-4 pb-3 pt-1 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400 border-t border-gray-200/60 dark:border-gray-700/60 whitespace-pre-wrap font-mono">
                        {reasoningText}
                      </div>
                    </details>
                  );
                })()}

                {/* Stopped Marker */}
                {msg.stopped && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 mb-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 w-fit">
                    <Ban className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-medium">已停止生成</span>
                  </div>
                )}

                {/* Main Content */}
                <div className="prose prose-sm dark:prose-invert max-w-none w-full select-text
                  prose-p:leading-relaxed prose-p:my-1.5
                  prose-headings:my-2 prose-headings:font-semibold
                  prose-ul:my-1.5 prose-li:my-0.5
                  prose-code:before:content-none prose-code:after:content-none
                  prose-a:text-accent prose-a:no-underline hover:prose-a:underline">
                  <ReactMarkdown
                    components={{
                      pre: ({ children }) => <>{children}</>,
                      code: CodeBlock
                    }}
                  >
                    {(() => {
                      let mainContent = msg.content;
                      if (!msg.reasoningContent && mainContent.includes('<think>')) {
                        mainContent = mainContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/, '').trim();
                      }
                      return mainContent;
                    })()}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />

      {/* 滚动到底部按钮 */}
      {showScrollButton && (
        <button
          onClick={() => scrollToBottom(true)}
          className="fixed bottom-24 right-6 p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg transition-all duration-200 hover:scale-110 active:scale-95 z-10"
          title="滚动到底部"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
