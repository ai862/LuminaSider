import React, { useState, useRef, useEffect } from 'react';
import { Send, FileText, Plus, X } from 'lucide-react';
import { useStore, saveAttachmentBlob, AttachmentMeta } from '../store';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';

interface StagedAttachment {
  id: string;
  file: File;
  previewUrl: string;
  base64: string; // for genAI and saving
}

export function InputArea() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { 
    apiProvider,
    providerConfigs,
    getCurrentSession, 
    addMessage, 
    updateMessageContent, 
    useContext, 
    setUseContext,
    pageContext 
  } = useStore();

  const currentConfig = providerConfigs[apiProvider];
  const { apiKey, baseUrl, model } = currentConfig;

  const currentSession = getCurrentSession();
  const messages = currentSession?.messages ||[];

  useEffect(() => {
    if (textareaRef.current) {
      if (input.trim() === '') {
        textareaRef.current.style.height = '24px';
      } else {
        textareaRef.current.style.height = '24px';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
      }
    }
  }, [input]);

  // Utility to convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        let encoded = reader.result as string;
        // Strip out the data url wrapper
        const base64Content = encoded.split(',')[1];
        resolve(base64Content);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const newAttachments: StagedAttachment[] = [];
      
      for (const file of newFiles) {
        if (!file.type.startsWith('image/')) continue; // V1 only supports images
        
        try {
          const base64 = await fileToBase64(file);
          const previewUrl = URL.createObjectURL(file);
          newAttachments.push({
            id: uuidv4(),
            file,
            previewUrl,
            base64
          });
        } catch (err) {
          console.error('File reading failed', err);
        }
      }
      
      setStagedAttachments(prev => [...prev, ...newAttachments]);
      // reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const newAttachments: StagedAttachment[] = [];

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          try {
            const base64 = await fileToBase64(file);
            const previewUrl = URL.createObjectURL(file);
            newAttachments.push({
              id: uuidv4(),
              file,
              previewUrl,
              base64
            });
          } catch (err) {
            console.error('Pasted image processing failed', err);
          }
        }
      }
    }
    if (newAttachments.length > 0) {
      setStagedAttachments(prev => [...prev, ...newAttachments]);
    }
  };

  const removeStagedAttachment = (id: string) => {
    setStagedAttachments(prev => {
      const filtered = prev.filter(att => att.id !== id);
      // Clean up object URLs
      const target = prev.find(att => att.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return filtered;
    });
  };

  const handleSubmit = async () => {
    if ((!input.trim() && stagedAttachments.length === 0) || isLoading) return;
    if (!apiKey && apiProvider !== 'ollama') {
      alert('请先在设置中配置 API Key');
      return;
    }

    const userMessageId = Date.now().toString();
    const userContent = input.trim();
    
    // Process attachments to save to IndexedDB and get Meta
    const attachmentMetas: AttachmentMeta[] = [];
    
    for (const att of stagedAttachments) {
      // Create permanent meta footprint
      const meta: AttachmentMeta = {
        id: att.id,
        name: att.file.name || 'Pasted Image',
        mimeType: att.file.type,
      };
      
      // Arc Arch: Save heavy Blob Base64 to IndexedDB
      await saveAttachmentBlob(att.id, att.base64);
      attachmentMetas.push(meta);
    }
    
    // Inject current context if enabled and pass attachments to message
    await addMessage({
      id: userMessageId,
      role: 'user',
      content: userContent,
      timestamp: Date.now(),
    }, true, attachmentMetas.length > 0 ? attachmentMetas : undefined);
    
    // Create local backup of staged data for sending to LLM right now
    const attachmentsToSend = [...stagedAttachments];
    
    // Clear Input & Cleanup Object URLs to prevent Memory Leaks
    stagedAttachments.forEach(att => URL.revokeObjectURL(att.previewUrl));
    
    setInput('');
    setStagedAttachments([]);
    setIsLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    await addMessage({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    });

    try {
      if (apiProvider === 'gemini') {
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
          // @ts-ignore ignore type mis-match from old versions
          requestOptions
        );

        // Multimodal payload assembly
        const promptParts: Part[] = [];
        let textualPrompt = '';
        
        if (useContext && pageContext) {
          textualPrompt += `你是一个网页阅读助手。请根据以下网页内容回答用户的问题。\n\n<context>\n标题: ${pageContext.title}\n内容: ${pageContext.content}\n</context>\n\n`;
        }
        
        // 添加纯文本的历史对话以节约 Token (历史记录中不包括图片)
        const historyMsg = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
        if (historyMsg) {
          textualPrompt += `历史对话:\n${historyMsg}\n\n`;
        }
        
        textualPrompt += `User: ${userContent}\nAssistant:`;
        promptParts.push({ text: textualPrompt });

        // Add attached images
        for (const att of attachmentsToSend) {
          promptParts.push({
            inlineData: {
              data: att.base64,
              mimeType: att.file.type
            }
          });
        }

        const result = await generativeModel.generateContentStream(promptParts);
        
        let fullStreamText = '';
        let isThinkingPhase = true;
        let splitIndex = -1;
        const isThinkingModel = model.toLowerCase().includes('thinking');
        
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
          systemPrompt = `你是一个网页阅读助手。请根据以下网页内容回答用户的问题。\n\n<context>\n标题: ${pageContext.title}\n内容: ${pageContext.content}\n</context>`;
        }

        const anthropicMessages: any[] =[];
        for (const msg of messages) {
          anthropicMessages.push({
            role: msg.role,
            content: msg.content
          });
        }

        // Current Message with Multimodal support
        if (attachmentsToSend.length > 0) {
          const contentArray: any[] =[];
          for (const att of attachmentsToSend) {
            contentArray.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: att.file.type,
                data: att.base64
              }
            });
          }
          contentArray.push({ type: 'text', text: userContent });
          anthropicMessages.push({
            role: 'user',
            content: contentArray
          });
        } else {
          anthropicMessages.push({
            role: 'user',
            content: userContent
          });
        }

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
        
        // System Prompt with Context
        if (useContext && pageContext) {
          openAiMessages.push({
            role: 'system',
            content: `你是一个网页阅读助手。请根据以下网页内容回答用户的问题。\n\n<context>\n标题: ${pageContext.title}\n内容: ${pageContext.content}\n</context>`
          });
        }

        // History
        for (const msg of messages) {
          openAiMessages.push({
            role: msg.role,
            content: msg.content
          });
        }

        // Current Message with Multimodal support
        if (attachmentsToSend.length > 0) {
          const contentArray: any[] = [{ type: 'text', text: userContent }];
          for (const att of attachmentsToSend) {
            contentArray.push({
              type: 'image_url',
              image_url: {
                url: `data:${att.file.type};base64,${att.base64}`
              }
            });
          }
          openAiMessages.push({
            role: 'user',
            content: contentArray
          });
        } else {
          openAiMessages.push({
            role: 'user',
            content: userContent
          });
        }

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
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isSubmitDisabled = (!input.trim() && stagedAttachments.length === 0) || isLoading;

  return (
    <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-primary shrink-0">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setUseContext(!useContext)}
          className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
            useContext 
              ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 ring-1 ring-blue-500/20' 
              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 ring-1 ring-transparent hover:ring-gray-200 dark:hover:ring-gray-700'
          }`}
        >
          <FileText className={`w-3.5 h-3.5 ${useContext ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'}`} />
          {useContext ? '已附带当前网页' : '附带当前网页'}
        </button>
      </div>

      {stagedAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 bg-gray-50/50 dark:bg-gray-900/50 p-2 rounded-xl border border-gray-100 dark:border-gray-800/60 max-h-[160px] overflow-y-auto">
          {stagedAttachments.map((att) => (
            <div key={att.id} className="relative group/staging w-14 h-14 shrink-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800">
              <img src={att.previewUrl} alt="preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover/staging:bg-black/10 transition-colors" />
              <button
                onClick={() => removeStagedAttachment(att.id)}
                className="absolute -top-1 -right-1 p-0.5 bg-gray-800/80 hover:bg-gray-900 text-white rounded-full opacity-0 group-hover/staging:opacity-100 transition-opacity transform scale-75"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative flex items-center gap-2 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-2 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent transition-all">
        <input 
          type="file" 
          accept="image/*" 
          multiple 
          className="hidden" 
          ref={fileInputRef}
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-lg shrink-0 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors self-end"
          title="上传图片"
        >
          <Plus className="w-5 h-5" />
        </button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="输入你的问题... (Enter 发送，Shift+Enter 换行)"
          className="flex-1 max-h-[120px] min-h-[24px] bg-transparent border-none resize-none focus:ring-0 focus:outline-none outline-none text-[15px] py-1.5 px-1 text-gray-800 dark:text-gray-200 placeholder-gray-400"
          rows={1}
          disabled={isLoading}
        />
        <button
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className={`p-2 rounded-lg shrink-0 transition-colors self-end ${
            !isSubmitDisabled
              ? 'bg-accent text-white hover:bg-blue-600'
              : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
          }`}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
