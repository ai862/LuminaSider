import React, { useState, useRef, useEffect } from 'react';
import { Send, FileText, Plus, X, Lock, Square } from 'lucide-react';
import { useStore, saveAttachmentBlob, AttachmentMeta } from '../store';
import { v4 as uuidv4 } from 'uuid';
import SecureStorage from '../utils/secureStorage';

interface StagedAttachment {
  id: string;
  file: File;
  previewUrl: string;
  base64: string; // for genAI and saving
}

export function InputArea() {
  const [input, setInput] = useState('');
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [showPlaceholderOverlay, setShowPlaceholderOverlay] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    apiProvider,
    providerConfigs,
    addMessage,
    useContext,
    setUseContext,
    isGenerating,
    abortController,
    generateResponse,
    getCurrentAgent,
  } = useStore();

  // Check secure storage for API key
  useEffect(() => {
    loadSecureApiKey();
  }, [apiProvider]);

  const loadSecureApiKey = async () => {
    const hasPassword = await SecureStorage.hasMasterPassword();
    if (hasPassword) {
      const unlocked = await SecureStorage.checkUnlocked();
      setIsLocked(!unlocked);
    } else {
      setIsLocked(false);
    }
  };

  // Get dynamic placeholder from current agent
  const agent = getCurrentAgent();
  const agentPlaceholder = agent.inputPlaceholder || "输入你的问题... (Enter 发送，Shift+Enter 换行)";

  // 判断是否为可点击的自定义占位符
  const isClickable = !agentPlaceholder.startsWith('输入你的问题') &&
                      !agentPlaceholder.includes('Enter 发送') &&
                      !agentPlaceholder.includes('Shift+Enter');

  const placeholder = {
    text: agentPlaceholder,
    isClickable: isClickable
  };

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

  // 占位符覆盖层显示逻辑
  useEffect(() => {
    if (input.trim() !== '') {
      setShowPlaceholderOverlay(false);
    } else if (document.activeElement !== textareaRef.current) {
      setShowPlaceholderOverlay(true);
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
    if ((!input.trim() && stagedAttachments.length === 0) || isGenerating) return;

    // Check if secure storage is locked
    if (isLocked) {
      alert('请先在设置中解锁安全存储');
      return;
    }

    const currentConfig = providerConfigs[apiProvider];
    if (!currentConfig.apiKey && apiProvider !== 'ollama') {
      alert('请先在设置中配置 API Key');
      return;
    }

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
      id: Date.now().toString(),
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

    // Generate AI response using store's function
    await generateResponse(userContent, attachmentsToSend);
  };

  const handleStop = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 占位符点击处理 - 直接发送
  const handlePlaceholderClick = async () => {
    const agent = getCurrentAgent();
    const agentPlaceholder = agent.inputPlaceholder;

    if (!agentPlaceholder ||
        agentPlaceholder.startsWith('输入你的问题') ||
        agentPlaceholder.includes('Enter 发送') ||
        agentPlaceholder.includes('Shift+Enter')) {
      return;
    }

    // 直接使用占位符文本发送消息
    const currentConfig = providerConfigs[apiProvider];
    if (!currentConfig.apiKey && apiProvider !== 'ollama') {
      alert('请先在设置中配置 API Key');
      return;
    }

    if (isLocked) {
      alert('请先在设置中解锁安全存储');
      return;
    }

    // 直接调用发送逻辑
    await addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: agentPlaceholder,
      timestamp: Date.now(),
    }, useContext);

    await generateResponse(agentPlaceholder);
  };

  const handleFocus = () => {
    setShowPlaceholderOverlay(false);
  };

  const handleBlur = () => {
    if (input.trim() === '') {
      setShowPlaceholderOverlay(true);
    }
  };

  const isSubmitDisabled = (!input.trim() && stagedAttachments.length === 0) || isGenerating;

  return (
    <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-primary shrink-0">
      {/* Locked state banner */}
      {isLocked && (
        <div className="mb-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-300">
          <Lock className="w-4 h-4" />
          <span>安全存储已锁定，请在设置中解锁后使用</span>
        </div>
      )}

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

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder=""
            className="flex-1 w-full max-h-[120px] min-h-[24px] bg-transparent border-none resize-none focus:ring-0 focus:outline-none outline-none text-sm py-1.5 px-1 text-gray-800 dark:text-gray-200"
            rows={1}
            disabled={isGenerating}
          />

          {/* 自定义占位符覆盖层 */}
          {showPlaceholderOverlay && input.trim() === '' && !isGenerating && (
            <div
              className="absolute inset-0 flex items-center px-1 pointer-events-none"
              onClick={placeholder.isClickable ? handlePlaceholderClick : undefined}
            >
              <span className={`text-sm text-gray-400 truncate ${
                placeholder.isClickable
                  ? 'pointer-events-auto cursor-pointer hover:text-blue-500 dark:hover:text-blue-400 underline decoration-dotted underline-offset-2'
                  : ''
              }`}>
                {placeholder.text}
              </span>
            </div>
          )}
        </div>
        {isGenerating ? (
          <button
            onClick={handleStop}
            className="p-2 rounded-lg shrink-0 transition-colors self-end bg-red-500 text-white hover:bg-red-600"
            title="停止生成"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : (
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
        )}
      </div>
    </div>
  );
}
