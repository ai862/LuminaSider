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

// Helper function to access storage (works in Firefox sidebar via background script)
async function storageGet(keys: string | string[]): Promise<Record<string, any>> {
  if (isFirefox && !chrome.storage?.local) {
    // Firefox sidebar: use background script
    const response = await chrome.runtime.sendMessage({ action: 'STORAGE_GET', keys });
    return response?.result || {};
  }
  // Direct access
  const result = await chrome.storage.local.get(keys);
  return result || {};
}

async function storageSet(data: Record<string, any>): Promise<void> {
  if (isFirefox && !chrome.storage?.local) {
    // Firefox sidebar: use background script
    await chrome.runtime.sendMessage({ action: 'STORAGE_SET', data });
    return;
  }
  await chrome.storage.local.set(data);
}

async function storageRemove(keys: string | string[]): Promise<void> {
  if (isFirefox && !chrome.storage?.local) {
    // Firefox sidebar: use background script
    await chrome.runtime.sendMessage({ action: 'STORAGE_REMOVE', keys });
    return;
  }
  await chrome.storage.local.remove(keys);
}

export class SecureStorage {
  // 内存会话缓存
  private static sessionCache: Map<string, string> = new Map();
  private static isUnlocked: boolean = false;
  // 内存中的主密码（Firefox MV2 兼容）
  private static memoryPassword: string | null = null;

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
    if (password.length < 6) {
      return { success: false, error: '密码长度至少需要6个字符' };
    }

    try {
      const hash = await this.hashPassword(password);
      await storageSet({ masterPasswordHash: hash });

      // 立即解锁会话
      this.isUnlocked = true;

      // 加密存储一个测试值以验证密码
      const testEncrypted = await this.encryptData('luminasider-test', password);
      await storageSet({ passwordTestKey: testEncrypted });

      // 存储密码到 session storage 或内存
      if (hasSessionStorage) {
        await (chrome.storage as any).session.set({ masterPassword: password });
      } else {
        this.memoryPassword = password;
      }

      return { success: true };
    } catch {
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

      // 存储密码到 session storage 或内存
      if (hasSessionStorage) {
        await (chrome.storage as any).session.set({ masterPassword: password });
      } else {
        this.memoryPassword = password;
      }

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
    this.memoryPassword = null;

    if (hasSessionStorage) {
      await (chrome.storage as any).session.remove('masterPassword');
    }
  }

  /**
   * 检查会话是否已解锁
   */
  static async checkUnlocked(): Promise<boolean> {
    if (this.isUnlocked) return true;

    // 尝试从 session storage 或内存恢复
    let masterPassword: string | undefined;
    if (hasSessionStorage) {
      const result = await (chrome.storage as any).session.get('masterPassword');
      masterPassword = result?.masterPassword;
    } else {
      masterPassword = this.memoryPassword || undefined;
    }

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

    // 尝试从 session storage 获取
    if (hasSessionStorage) {
      const result = await (chrome.storage as any).session.get('masterPassword');
      return result?.masterPassword || null;
    }

    return null;
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
