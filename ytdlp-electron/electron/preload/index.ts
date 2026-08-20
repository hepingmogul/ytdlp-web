/**
 * Preload 脚本
 * 使用 contextBridge 向渲染进程暴露安全的 API 接口
 */

import { contextBridge, ipcRenderer } from 'electron';
import { getAllowedIpcChannels } from '~/electron/shared/ipcChannels';

const validChannels = getAllowedIpcChannels();

function assertValidChannel(channel: string): void {
  if (!validChannels.includes(channel)) {
    throw new Error(`Unauthorized IPC channel: ${channel}`);
  }
}

/**
 * 暴露给渲染进程的安全 API
 */
const electronAPI = {
  /**
   * 调用主进程（invoke/handle 模式）
   */
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    assertValidChannel(channel);
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * 发送消息到主进程（send/on 模式，单向）
   */
  send: (channel: string, ...args: unknown[]): void => {
    assertValidChannel(channel);
    ipcRenderer.send(channel, ...args);
  },

  /**
   * 监听主进程消息
   * 返回取消监听的函数
   */
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    assertValidChannel(channel);

    const wrappedCallback = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, wrappedCallback);

    return () => {
      ipcRenderer.removeListener(channel, wrappedCallback);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
