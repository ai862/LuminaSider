/**
 * 安全存储模块 - 使用会话缓存 + AES-GCM 加密
 *
 * 工作流程：
 * 1. 用户首次设置时输入主密码
 * 2. API Key 使用主密码派生的密钥加密后存储到 chrome.storage.local
 * 3. 每次会话需要用主密码解锁，解密后的 Key 缓存在内存中
 * 4. 浏览器关闭后内存缓存自动清除
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100000;

// Check if session storage is available (Chrome 102+, Firefox MV3)
const hasSessionStorage = typeof chrome !== 'undefined' && chrome.storage && 'session' in chrome.storage;

// Check if we're in Firefox
const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox');

// Check if we're in a Firefox sidebar context
// In Firefox sidebar, chrome.tabs exists but doesn't work properly
// We detect this by checking if we're in an extension page (not background) on Firefox
const isFirefoxSidebar = (() => {
  if (!isFirefox) return false;
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return false;

  // Check if we're in sidebar by URL (moz-extension://.../index.html in sidebar)
  const isExtensionPage = typeof window !== 'undefined' &&
    (window.location.href.startsWith('moz-extension://') ||
     window.location.href.startsWith('chrome-extension://'));

  // In sidebar, we can't use chrome.tabs.query effectively
  // Background script has full access, sidebar doesn't
  return isExtensionPage;
})();

console.log('[SecureStorage] Environment detection:', {
  isFirefox,
  isFirefoxSidebar,
  hasChromeRuntime: typeof chrome !== 'undefined' && !!chrome.runtime?.id,
  hasChromeTabs: typeof chrome !== 'undefined' && !!chrome.tabs,
  hasChromeStorage: typeof chrome !== 'undefined' && !!chrome.storage?.local,
  currentURL: typeof window !== 'undefined' ? window.location.href : 'N/A'
});

// Helper function to send message to background (Firefox uses browser API for Promise support)
async function sendToBackground<T>(message: any): Promise<T | undefined> {
  console.log('[SecureStorage] sendToBackground called with action:', message.action);
  if (isFirefoxSidebar) {
    // Firefox: use browser.runtime.sendMessage for native Promise support
    const browserApi = (globalThis as any).browser || chrome;
    console.log('[SecureStorage] Sending message via', (globalThis as any).browser ? 'browser API' : 'chrome API');

    try {
      const response = await browserApi.runtime.sendMessage(message);
      console.log('[SecureStorage] Received response:', response);
      return response;
    } catch (error) {
      console.error('[SecureStorage] Message send error:', error);
      throw error;
    }
  }
  // Chrome: use chrome.runtime.sendMessage with callback wrapped in Promise
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      console.log('[SecureStorage] Chrome received response:', response);
      resolve(response);
    });
  });
}

// Helper function to access storage (works in Firefox sidebar via background script)
async function storageGet(keys: string | string[]): Promise<Record<string, any>> {
  console.log('[SecureStorage] storageGet called, keys:', keys, 'isFirefoxSidebar:', isFirefoxSidebar);

  // Always use background proxy in Firefox sidebar context
  if (isFirefoxSidebar) {
    console.log('[SecureStorage] Using background script proxy for storageGet');
    try {
      const response = await sendToBackground<{ result: Record<string, any> }>({ action: 'STORAGE_GET', keys });
      console.log('[SecureStorage] Background response:', response);
      return response?.result || {};
    } catch (error) {
      console.error('[SecureStorage] Background proxy failed:', error);
      return {};
    }
  }

  // Direct access (Chrome or Firefox background)
  try {
    const result = await chrome.storage.local.get(keys);
    console.log('[SecureStorage] Direct storage.local.get result:', result);

    // Firefox sidebar bug: storage.local.get returns undefined instead of {}
    // If we get undefined, try using background proxy instead
    if (result === undefined || result === null) {
      console.log('[SecureStorage] Direct access returned undefined, trying background proxy');
      try {
        const response = await sendToBackground<{ result: Record<string, any> }>({ action: 'STORAGE_GET', keys });
        return response?.result || {};
      } catch {
        return {};
      }
    }

    return result || {};
  } catch (error) {
    console.error('[SecureStorage] Direct storage access failed:', error);
    // Fallback to background proxy
    try {
      const response = await sendToBackground<{ result: Record<string, any> }>({ action: 'STORAGE_GET', keys });
      return response?.result || {};
    } catch {
      return {};
    }
  }
}

async function storageSet(data: Record<string, any>): Promise<void> {
  console.log('[SecureStorage] storageSet called, data keys:', Object.keys(data), 'isFirefoxSidebar:', isFirefoxSidebar);

  // Always use background proxy in Firefox sidebar context
  if (isFirefoxSidebar) {
    console.log('[SecureStorage] Using background script proxy for storageSet');
    try {
      const response = await sendToBackground<{ success: boolean | string; error?: string }>({ action: 'STORAGE_SET', data });
      console.log('[SecureStorage] storageSet response:', response);
      // Check success - handle both boolean true and string "true"
      if (!response || (response.success !== true && response.success !== 'true')) {
        throw new Error(response?.error || 'Failed to set storage');
      }
      return;
    } catch (error) {
      console.error('[SecureStorage] Background proxy failed:', error);
      throw error;
    }
  }

  // Direct access (Chrome or Firefox background)
  try {
    await chrome.storage.local.set(data);
    console.log('[SecureStorage] Direct storage.local.set completed');
  } catch (error) {
    console.error('[SecureStorage] Direct storage.local.set failed:', error);
    // Fallback to background proxy
    console.log('[SecureStorage] Trying background proxy as fallback');
    const response = await sendToBackground<{ success: boolean | string; error?: string }>({ action: 'STORAGE_SET', data });
    console.log('[SecureStorage] storageSet fallback response:', response);
    if (!response || (response.success !== true && response.success !== 'true')) {
      throw new Error(response?.error || 'Failed to set storage');
    }
  }
}

async function storageRemove(keys: string | string[]): Promise<void> {
  console.log('[SecureStorage] storageRemove called, keys:', keys, 'isFirefoxSidebar:', isFirefoxSidebar);

  // Always use background proxy in Firefox sidebar context
  if (isFirefoxSidebar) {
    console.log('[SecureStorage] Using background script proxy for storageRemove');
    try {
      const response = await sendToBackground<{ success: boolean | string; error?: string }>({ action: 'STORAGE_REMOVE', keys });
      console.log('[SecureStorage] storageRemove response:', response);
      // Check success - handle both boolean true and string "true"
      if (!response || (response.success !== true && response.success !== 'true')) {
        throw new Error(response?.error || 'Failed to remove storage');
      }
      return;
    } catch (error) {
      console.error('[SecureStorage] Background proxy failed:', error);
      throw error;
    }
  }

  // Direct access (Chrome or Firefox background)
  try {
    await chrome.storage.local.remove(keys);
    console.log('[SecureStorage] Direct storage.local.remove completed');
  } catch (error) {
    console.error('[SecureStorage] Direct storage.local.remove failed:', error);
    // Fallback to background proxy
    console.log('[SecureStorage] Trying background proxy as fallback');
    const response = await sendToBackground<{ success: boolean | string; error?: string }>({ action: 'STORAGE_REMOVE', keys });
    console.log('[SecureStorage] storageRemove fallback response:', response);
    if (!response || (response.success !== true && response.success !== 'true')) {
      throw new Error(response?.error || 'Failed to remove storage');
    }
  }
}

export class SecureStorage {
  // 内存会话缓存
  private static sessionCache: Map<string, string> = new Map();
  private static isUnlocked: boolean = false;
  // 内存中的主密码（Firefox MV2 兼容）
  private static memoryPassword: string | null = null;
  // Firefox: 使用 local storage 持久化主密码（安全性较低但方便）
  private static firefoxPasswordKey = '_firefoxMasterPassword';

  // ==================== 核心加密/解密方法 ====================

  /**
   * 从主密码派生加密密钥
   */
  private static async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // 创建 salt 的副本以确保类型正确
    const saltBuffer = new Uint8Array(salt).buffer as ArrayBuffer;

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * 加密字符串
   */
  private static async encryptData(plaintext: string, password: string): Promise<string> {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await this.deriveKey(password, salt);

    const encrypted = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv: iv },
      key,
      encoder.encode(plaintext)
    );

    // 组合格式: base64(salt + iv + encrypted)
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  /**
   * 解密字符串
   */
  private static async decryptData(ciphertext: string, password: string): Promise<string> {
    try {
      const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

      const salt = combined.slice(0, SALT_LENGTH);
      const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH);

      const key = await this.deriveKey(password, salt);

      const decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv: iv },
        key,
        encrypted
      );

      return new TextDecoder().decode(decrypted);
    } catch {
      throw new Error('解密失败：密码错误或数据损坏');
    }
  }

  /**
   * 哈希密码（用于验证）
   */
  private static async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const salt = encoder.encode('luminasider-auth-salt');
    const data = encoder.encode(password);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      data,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  }

  // ==================== 公开 API ====================

  /**
   * 检查是否已设置主密码
   */
  static async hasMasterPassword(): Promise<boolean> {
    try {
      const result = await storageGet('masterPasswordHash');
      return !!result?.masterPasswordHash;
    } catch (error) {
      console.error('[SecureStorage] hasMasterPassword error:', error);
      return false;
    }
  }

  /**
   * 设置主密码（首次使用）
   */
  static async setupMasterPassword(password: string): Promise<{ success: boolean; error?: string }> {
    console.log('[SecureStorage] setupMasterPassword called');
    if (password.length < 6) {
      console.log('[SecureStorage] Password too short:', password.length);
      return { success: false, error: '密码长度至少需要6个字符' };
    }

    try {
      console.log('[SecureStorage] Hashing password...');
      const hash = await this.hashPassword(password);
      console.log('[SecureStorage] Password hashed, saving to storage...');

      console.log('[SecureStorage] Calling storageSet for masterPasswordHash');
      await storageSet({ masterPasswordHash: hash });
      console.log('[SecureStorage] masterPasswordHash saved successfully');

      // 立即解锁会话
      this.isUnlocked = true;

      // 加密存储一个测试值以验证密码
      console.log('[SecureStorage] Encrypting test value...');
      const testEncrypted = await this.encryptData('luminasider-test', password);
      console.log('[SecureStorage] Test value encrypted, saving to storage...');

      console.log('[SecureStorage] Calling storageSet for passwordTestKey');
      await storageSet({ passwordTestKey: testEncrypted });
      console.log('[SecureStorage] passwordTestKey saved successfully');

      // 存储密码
      console.log('[SecureStorage] Saving master password...');
      await this.saveMasterPassword(password);
      console.log('[SecureStorage] Master password saved');

      return { success: true };
    } catch (error) {
      console.error('[SecureStorage] setupMasterPassword error:', error);
      return { success: false, error: '设置密码失败' };
    }
  }

  /**
   * 解锁会话（验证主密码）
   */
  static async unlock(password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await storageGet(['masterPasswordHash', 'passwordTestKey']);
      const { masterPasswordHash, passwordTestKey } = result || {};

      if (!masterPasswordHash) {
        return { success: false, error: '未设置主密码，请先设置' };
      }

      // 验证密码哈希
      const inputHash = await this.hashPassword(password);
      if (inputHash !== masterPasswordHash) {
        return { success: false, error: '密码错误' };
      }

      // 额外验证：解密测试值
      if (passwordTestKey) {
        const decrypted = await this.decryptData(passwordTestKey, password);
        if (decrypted !== 'luminasider-test') {
          return { success: false, error: '密码验证失败' };
        }
      }

      // 解锁成功
      this.isUnlocked = true;

      // 存储密码
      await this.saveMasterPassword(password);

      return { success: true };
    } catch {
      return { success: false, error: '解锁失败' };
    }
  }

  /**
   * 锁定会话（清除内存缓存）
   */
  static async lock(): Promise<void> {
    this.sessionCache.clear();
    this.isUnlocked = false;

    // 清除存储的主密码
    await this.clearMasterPassword();
  }

  /**
   * 检查会话是否已解锁
   */
  static async checkUnlocked(): Promise<boolean> {
    if (this.isUnlocked) return true;

    // 尝试从存储恢复主密码
    const masterPassword = await this.getMasterPassword();

    if (masterPassword) {
      this.isUnlocked = true;
      return true;
    }

    return false;
  }

  /**
   * 获取存储的主密码
   */
  private static async getMasterPassword(): Promise<string | null> {
    // 优先从内存获取
    if (this.memoryPassword) {
      return this.memoryPassword;
    }

    // 尝试从 session storage 获取 (Chrome)
    if (hasSessionStorage) {
      const result = await (chrome.storage as any).session.get('masterPassword');
      return result?.masterPassword || null;
    }

    // Firefox: 从 local storage 获取
    if (isFirefoxSidebar) {
      const result = await storageGet(this.firefoxPasswordKey);
      return result?.[this.firefoxPasswordKey] || null;
    }

    return null;
  }

  /**
   * 存储主密码（内部方法）
   */
  private static async saveMasterPassword(password: string): Promise<void> {
    if (hasSessionStorage) {
      await (chrome.storage as any).session.set({ masterPassword: password });
    } else if (isFirefoxSidebar) {
      // Firefox: 使用 local storage 持久化（安全性较低但方便）
      await storageSet({ [this.firefoxPasswordKey]: password });
    }
    this.memoryPassword = password;
  }

  /**
   * 清除存储的主密码
   */
  private static async clearMasterPassword(): Promise<void> {
    this.memoryPassword = null;
    if (hasSessionStorage) {
      await (chrome.storage as any).session.remove('masterPassword');
    } else if (isFirefoxSidebar) {
      await storageRemove(this.firefoxPasswordKey);
    }
  }

  /**
   * 安全存储 API Key
   */
  static async storeApiKey(
    provider: string,
    apiKey: string,
    password?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isUnlocked && !password) {
      return { success: false, error: '会话未解锁' };
    }

    try {
      // 获取密码
      let masterPwd: string | undefined | null = password;
      if (!masterPwd) {
        masterPwd = await this.getMasterPassword();
      }

      if (!masterPwd) {
        return { success: false, error: '会话已过期，请重新解锁' };
      }

      // 加密 API Key
      const encrypted = await this.encryptData(apiKey, masterPwd);

      // 存储
      const result = await storageGet('encryptedApiKeys');
      const encryptedApiKeys = result?.encryptedApiKeys || {};
      encryptedApiKeys[provider] = encrypted;
      await storageSet({ encryptedApiKeys });

      // 更新内存缓存
      this.sessionCache.set(provider, apiKey);

      return { success: true };
    } catch (error) {
      console.error('[SecureStorage] storeApiKey error:', error);
      return { success: false, error: '存储失败' };
    }
  }

  /**
   * 获取 API Key
   */
  static async getApiKey(provider: string): Promise<string | null> {
    // 优先从内存缓存获取
    if (this.sessionCache.has(provider)) {
      return this.sessionCache.get(provider)!;
    }

    // 检查是否已解锁
    if (!this.isUnlocked) {
      const unlocked = await this.checkUnlocked();
      if (!unlocked) {
        return null;
      }
    }

    try {
      // 获取密码
      const masterPassword = await this.getMasterPassword();
      if (!masterPassword) {
        return null;
      }

      // 获取加密的 API Key
      const result = await storageGet('encryptedApiKeys');
      const encryptedApiKeys = result?.encryptedApiKeys || {};
      const encrypted = encryptedApiKeys[provider];

      if (!encrypted) {
        return null;
      }

      // 解密
      const apiKey = await this.decryptData(encrypted, masterPassword);

      // 缓存到内存
      this.sessionCache.set(provider, apiKey);

      return apiKey;
    } catch (error) {
      console.error('[SecureStorage] getApiKey error:', error);
      return null;
    }
  }

  /**
   * 删除 API Key
   */
  static async deleteApiKey(provider: string): Promise<void> {
    // 清除内存缓存
    this.sessionCache.delete(provider);

    // 清除存储
    const result = await storageGet('encryptedApiKeys');
    const encryptedApiKeys = result?.encryptedApiKeys || {};
    delete encryptedApiKeys[provider];
    await storageSet({ encryptedApiKeys });
  }

  /**
   * 修改主密码
   */
  static async changeMasterPassword(
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    if (newPassword.length < 6) {
      return { success: false, error: '新密码长度至少需要6个字符' };
    }

    try {
      // 验证旧密码
      const result = await storageGet(['masterPasswordHash', 'encryptedApiKeys']);
      const { masterPasswordHash, encryptedApiKeys = {} } = result || {};

      const oldHash = await this.hashPassword(oldPassword);
      if (oldHash !== masterPasswordHash) {
        return { success: false, error: '原密码错误' };
      }

      // 重新加密所有 API Keys
      const newEncryptedKeys: Record<string, string> = {};
      for (const [provider, encrypted] of Object.entries(encryptedApiKeys)) {
        const apiKey = await this.decryptData(encrypted as string, oldPassword);
        newEncryptedKeys[provider] = await this.encryptData(apiKey, newPassword);
      }

      // 更新密码哈希和测试值
      const newHash = await this.hashPassword(newPassword);
      const newTestKey = await this.encryptData('luminasider-test', newPassword);

      // 批量保存
      await storageSet({
        masterPasswordHash: newHash,
        encryptedApiKeys: newEncryptedKeys,
        passwordTestKey: newTestKey
      });

      // 更新会话
      if (hasSessionStorage) {
        await (chrome.storage as any).session.set({ masterPassword: newPassword });
      } else {
        this.memoryPassword = newPassword;
      }

      return { success: true };
    } catch {
      return { success: false, error: '修改密码失败' };
    }
  }

  /**
   * 获取所有已存储密钥的提供商标识（不含实际密钥）
   */
  static async getStoredProviders(): Promise<string[]> {
    const result = await storageGet('encryptedApiKeys');
    return Object.keys(result?.encryptedApiKeys || {});
  }

  /**
   * 清除所有数据（危险操作）
   */
  static async clearAll(): Promise<void> {
    this.sessionCache.clear();
    this.isUnlocked = false;
    this.memoryPassword = null;

    await storageRemove(['masterPasswordHash', 'encryptedApiKeys', 'passwordTestKey']);

    if (hasSessionStorage) {
      await (chrome.storage as any).session.remove('masterPassword');
    }
  }
}

export default SecureStorage;
