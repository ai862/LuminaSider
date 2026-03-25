import { create } from 'zustand';
import { persist, StateStorage, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import * as idb from 'idb-keyval';

// --- Chrome Storage Engine for Zustand ---
const chromeStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const result = await chrome.storage.local.get(name);
    return result[name] || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [name]: value });
  },
  removeItem: async (name: string): Promise<void> => {
    await chrome.storage.local.remove(name);
  },
};

// --- Types ---

export interface ContextMeta {
  title: string;
  url: string;
  snapshotId: string; // Used to fetch the large content blob from IndexedDB
}

export interface AttachmentMeta {
  id: string; // Used to fetch Base64 blob from IndexedDB
  name: string;
  mimeType: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoningContent?: string;
  timestamp: number;
  attachedContext?: ContextMeta; // Only present if context was injected
  attachments?: AttachmentMeta[];
}

export interface Session {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
}

export interface PageContext {
  title: string;
  content: string;
  url: string;
}

// --- Heavy Data Storage (IndexedDB) ---

export const getContextSnapshot = async (snapshotId: string): Promise<string | undefined> => {
  return await idb.get<string>(`context_snapshot_${snapshotId}`);
};

export const saveContextSnapshot = async (snapshotId: string, content: string): Promise<void> => {
  await idb.set(`context_snapshot_${snapshotId}`, content);
};

export const deleteContextSnapshot = async (snapshotId: string): Promise<void> => {
  await idb.del(`context_snapshot_${snapshotId}`);
};

export const saveAttachmentBlob = async (attachmentId: string, base64Data: string): Promise<void> => {
  await idb.set(`attachment_${attachmentId}`, base64Data);
};

export const getAttachmentBlob = async (attachmentId: string): Promise<string | undefined> => {
  return await idb.get<string>(`attachment_${attachmentId}`);
};

export const deleteAttachmentBlob = async (attachmentId: string): Promise<void> => {
  await idb.del(`attachment_${attachmentId}`);
};

// --- App State (Zustand) ---

export type ApiProvider = 'gemini' | 'openai' | 'deepseek' | 'groq' | 'ollama' | 'anthropic';

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface AppState {
  // Settings
  apiProvider: ApiProvider;
  providerConfigs: Record<ApiProvider, ProviderConfig>;
  setSettings: (provider: ApiProvider, config: Partial<ProviderConfig>) => void;
  setActiveProvider: (provider: ApiProvider) => void;

  // UI State
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (isOpen: boolean) => void;

  // Active Session State
  currentSessionId: string | null;
  useContext: boolean;
  setUseContext: (use: boolean) => void;
  pageContext: PageContext | null; // Real-time context from the active tab
  setPageContext: (context: PageContext | null) => void;

  // Sessions Management
  sessions: Session[];
  
  // Actions
  createNewSession: (initialTitle?: string) => string;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  addMessage: (message: Omit<Message, 'attachedContext' | 'attachments'>, injectCurrentContext?: boolean, attachments?: AttachmentMeta[]) => Promise<void>;
  updateMessageContent: (messageId: string, content: string, reasoningContent?: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;

  // Selectors/Computed
  getCurrentSession: () => Session | undefined;
}

export const defaultProviderConfigs: Record<ApiProvider, ProviderConfig> = {
  gemini: {
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-1.5-flash',
  },
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  deepseek: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  groq: {
    apiKey: '',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama3-8b-8192',
  },
  ollama: {
    apiKey: '',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3',
  },
  anthropic: {
    apiKey: '',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-20241022',
  }
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Settings
      apiProvider: 'gemini',
      providerConfigs: defaultProviderConfigs,
      setActiveProvider: (provider) => set({ apiProvider: provider }),
      setSettings: (provider, config) => set((state) => ({
        providerConfigs: {
          ...state.providerConfigs,
          [provider]: {
            ...state.providerConfigs[provider],
            ...config
          }
        }
      })),

      // UI State
      isSettingsOpen: false,
      setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
      isDrawerOpen: false,
      setIsDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),

      // Context
      useContext: true,
      setUseContext: (useContext) => set({ useContext }),
      pageContext: null,
      setPageContext: (pageContext) => set({ pageContext }),

      // Sessions
      currentSessionId: null,
      sessions: [],

      getCurrentSession: () => {
        const { sessions, currentSessionId } = get();
        return sessions.find(s => s.id === currentSessionId);
      },

      createNewSession: (initialTitle = 'New Chat') => {
        const newSessionId = uuidv4();
        const newSession: Session = {
          id: newSessionId,
          title: initialTitle,
          updatedAt: Date.now(),
          messages: [],
        };
        
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          currentSessionId: newSessionId,
          isDrawerOpen: false, // Auto close drawer when creating new
        }));
        
        return newSessionId;
      },

      switchSession: (sessionId: string) => {
        set({ currentSessionId: sessionId, isDrawerOpen: false });
      },

      deleteSession: async (sessionId: string) => {
        const state = get();
        const sessionToDelete = state.sessions.find(s => s.id === sessionId);
        
        // Cleanup IndexedDB snapshots and attachments for this session
        if (sessionToDelete) {
          for (const msg of sessionToDelete.messages) {
            if (msg.attachedContext?.snapshotId) {
              await deleteContextSnapshot(msg.attachedContext.snapshotId);
            }
            if (msg.attachments) {
              for (const att of msg.attachments) {
                await deleteAttachmentBlob(att.id);
              }
            }
          }
        }

        set((state) => {
          const newSessions = state.sessions.filter(s => s.id !== sessionId);
          let newCurrentId = state.currentSessionId;
          
          if (state.currentSessionId === sessionId) {
            newCurrentId = newSessions.length > 0 ? newSessions[0].id : null;
          }
          
          return {
            sessions: newSessions,
            currentSessionId: newCurrentId,
          };
        });
      },

      updateSessionTitle: (sessionId: string, title: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, title } : s
          ),
        }));
      },

      addMessage: async (baseMessage, injectCurrentContext = false, attachments?: AttachmentMeta[]) => {
        const state = get();
        let activeSessionId = state.currentSessionId;
        
        // Auto-create session if none exists
        if (!activeSessionId) {
           activeSessionId = get().createNewSession();
        }

        let fullMessage: Message = { ...baseMessage };

        // Handle Context Snapshotting
        if (injectCurrentContext && state.useContext && state.pageContext) {
          const snapshotId = uuidv4();
          // 1. Save heavy content to IndexedDB immediately
          await saveContextSnapshot(snapshotId, state.pageContext.content);
          
          // 2. Attach metadata to message
          fullMessage.attachedContext = {
            title: state.pageContext.title,
            url: state.pageContext.url,
            snapshotId,
          };
        }

        if (attachments && attachments.length > 0) {
          fullMessage.attachments = attachments;
        }

        set((currentState) => {
          const sessionIndex = currentState.sessions.findIndex(s => s.id === activeSessionId);
          if (sessionIndex === -1) return currentState;

          const updatedSessions = [...currentState.sessions];
          const session = { ...updatedSessions[sessionIndex] };
          
          session.messages = [...session.messages, fullMessage];
          session.updatedAt = Date.now();
          
          // Auto-update generic title on first user message
          if (session.title === 'New Chat' && fullMessage.role === 'user') {
            session.title = fullMessage.content.slice(0, 20) + (fullMessage.content.length > 20 ? '...' : '');
          }

          updatedSessions[sessionIndex] = session;
          
          // Sort to bring most recently updated session to top
          updatedSessions.sort((a, b) => b.updatedAt - a.updatedAt);

          return { sessions: updatedSessions };
        });
      },

      updateMessageContent: (messageId: string, content: string, reasoningContent?: string) => {
         set((state) => {
           const activeSessionId = state.currentSessionId;
           if (!activeSessionId) return state;

           const sessionIndex = state.sessions.findIndex(s => s.id === activeSessionId);
           if (sessionIndex === -1) return state;

           const updatedSessions = [...state.sessions];
           const session = { ...updatedSessions[sessionIndex] };
           
           session.messages = session.messages.map(msg => {
              if (msg.id === messageId) {
                const updatedMsg = { ...msg, content };
                if (reasoningContent !== undefined) {
                  updatedMsg.reasoningContent = reasoningContent;
                }
                return updatedMsg;
              }
              return msg;
           });
           
           updatedSessions[sessionIndex] = session;
           return { sessions: updatedSessions };
         });
      }
    }),
    {
      name: 'luminasider-storage',
      storage: createJSONStorage(() => chromeStorage),
      partialize: (state) => {
        // Migration logic for old state format
        const anyState = state as any;
        let providerConfigs = state.providerConfigs;
        
        if (anyState.apiKey !== undefined && anyState.baseUrl !== undefined && anyState.model !== undefined) {
          // Migrate old flat config to the active provider
          providerConfigs = {
            ...defaultProviderConfigs,
            [state.apiProvider]: {
              apiKey: anyState.apiKey,
              baseUrl: anyState.baseUrl,
              model: anyState.model,
            }
          };
        }

        return {
          apiProvider: state.apiProvider,
          providerConfigs,
          useContext: state.useContext,
          sessions: state.sessions,
          currentSessionId: state.currentSessionId,
        };
      },
    }
  )
);
