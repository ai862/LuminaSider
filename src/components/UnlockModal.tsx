import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, Shield, Key, Loader2 } from 'lucide-react';
import SecureStorage from '../utils/secureStorage';

interface UnlockModalProps {
  onUnlock: () => void;
  onClose?: () => void;
}

export function UnlockModal({ onUnlock, onClose }: UnlockModalProps) {
  const [mode, setMode] = useState<'check' | 'setup' | 'unlock'>('check');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    const hasPassword = await SecureStorage.hasMasterPassword();
    const isUnlocked = await SecureStorage.checkUnlocked();

    if (isUnlocked) {
      onUnlock();
    } else if (hasPassword) {
      setMode('unlock');
    } else {
      setMode('setup');
    }
  };

  const handleSetup = async () => {
    setError('');

    if (password.length < 6) {
      setError('密码长度至少需要6个字符');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    const result = await SecureStorage.setupMasterPassword(password);
    setLoading(false);

    if (result.success) {
      onUnlock();
    } else {
      setError(result.error || '设置密码失败');
    }
  };

  const handleUnlock = async () => {
    setError('');

    if (!password) {
      setError('请输入密码');
      return;
    }

    setLoading(true);
    const result = await SecureStorage.unlock(password);
    setLoading(false);

    if (result.success) {
      onUnlock();
    } else {
      setError(result.error || '解锁失败');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (mode === 'setup') {
        handleSetup();
      } else if (mode === 'unlock') {
        handleUnlock();
      }
    }
  };

  if (mode === 'check') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              {mode === 'setup' ? (
                <Shield className="w-8 h-8" />
              ) : (
                <Lock className="w-8 h-8" />
              )}
            </div>
          </div>
          <h2 className="text-xl font-semibold text-center">
            {mode === 'setup' ? '设置安全密码' : '解锁 API 密钥'}
          </h2>
          <p className="text-blue-100 text-sm text-center mt-2">
            {mode === 'setup'
              ? '首次使用需要设置主密码来保护您的 API 密钥'
              : '请输入主密码以访问您的 API 密钥'}
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* 密码输入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {mode === 'setup' ? '设置主密码' : '主密码'}
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'setup' ? '请输入至少6位密码' : '请输入主密码'}
                className="w-full pl-10 pr-12 py-3 border border-gray-200 dark:border-gray-700 rounded-xl
                         bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         placeholder-gray-400 transition-all"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* 确认密码（仅设置模式） */}
          {mode === 'setup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                确认密码
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError('');
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="请再次输入密码"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl
                           bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           placeholder-gray-400 transition-all"
                />
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 提示信息 */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <div className="flex gap-3">
              <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700 dark:text-blue-300">
                {mode === 'setup' ? (
                  <>
                    <p className="font-medium mb-1">安全提示</p>
                    <ul className="space-y-1 text-blue-600 dark:text-blue-400">
                      <li>• 主密码用于加密存储您的 API 密钥</li>
                      <li>• 请牢记此密码，忘记后无法恢复</li>
                      <li>• 密码不会上传到任何服务器</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="font-medium mb-1">会话解锁</p>
                    <ul className="space-y-1 text-blue-600 dark:text-blue-400">
                      <li>• 解锁后密钥仅在当前会话有效</li>
                      <li>• 关闭浏览器后需要重新解锁</li>
                      <li>• 密钥使用 AES-256 加密存储</li>
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 border border-gray-200 dark:border-gray-700 rounded-xl
                       text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800
                       transition-colors font-medium"
            >
              取消
            </button>
          )}
          <button
            onClick={mode === 'setup' ? handleSetup : handleUnlock}
            disabled={loading}
            className="flex-1 py-3 px-4 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400
                     text-white rounded-xl font-medium transition-colors
                     flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Lock className="w-4 h-4" />
                {mode === 'setup' ? '设置密码' : '解锁'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default UnlockModal;
