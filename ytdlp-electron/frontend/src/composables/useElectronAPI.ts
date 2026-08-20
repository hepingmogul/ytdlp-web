/**
 * useElectronAPI 组合式函数
 * 封装 window.electronAPI 的调用，提供类型安全的前端接口
 */

import { ref } from 'vue';
import { IPC_API_ROUTE } from '../utils/ipcChannels';
import { PAGINATION } from '../shared/constant';
import type { IPCResponse, Note, Category, AppInfo, NoteInput, NoteUpdateInput, CategoryInput } from '../types';

/**
 * 通用 IPC 调用封装
 */
async function ipcInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (!window.electronAPI) {
    throw new Error('electronAPI is not available. Make sure preload script is loaded.');
  }
  // 清理/解包 Vue 响应式 Proxy 对象，防止 Electron IPC 结构化克隆抛出 DataCloneError (An object could not be cloned)
  const cleanArgs = args.map((arg) =>
    arg !== null && typeof arg === 'object' ? JSON.parse(JSON.stringify(arg)) : arg
  );
  const response = (await window.electronAPI.invoke(channel, ...cleanArgs)) as IPCResponse<T>;

  if (!response.success) {
    throw new Error(response.error || 'Unknown error');
  }
  return response.data as T;
}

// ==================== 数据库操作 API ====================

export function useNoteAPI() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getAllNotes(
    page = PAGINATION.DEFAULT_PAGE,
    pageSize = PAGINATION.DEFAULT_PAGE_SIZE,
  ) {
    loading.value = true;
    error.value = null;
    try {
      return await ipcInvoke<{ data: Note[]; total: number }>(IPC_API_ROUTE.note.getAll, { page, pageSize });
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function getNoteById(id: number) {
    loading.value = true;
    error.value = null;
    try {
      return await ipcInvoke<Note>(IPC_API_ROUTE.note.getById, { id });
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createNote(input: NoteInput) {
    loading.value = true;
    error.value = null;
    try {
      return await ipcInvoke<Note>(IPC_API_ROUTE.note.create, input);
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateNote(input: NoteUpdateInput) {
    loading.value = true;
    error.value = null;
    try {
      return await ipcInvoke<Note>(IPC_API_ROUTE.note.update, input);
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteNote(id: number) {
    loading.value = true;
    error.value = null;
    try {
      return await ipcInvoke<{ deleted: boolean }>(IPC_API_ROUTE.note.delete, { id });
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function queryNotesByCategory(category: string) {
    loading.value = true;
    error.value = null;
    try {
      return await ipcInvoke<{ data: Note[]; total: number }>(IPC_API_ROUTE.note.queryByCategory, { category });
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    getAllNotes,
    getNoteById,
    createNote,
    updateNote,
    deleteNote,
    queryNotesByCategory,
  };
}

export function useCategoryAPI() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getAllCategories() {
    loading.value = true;
    error.value = null;
    try {
      return await ipcInvoke<{ data: Category[]; total: number }>(IPC_API_ROUTE.category.getAll);
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createCategory(input: CategoryInput) {
    loading.value = true;
    error.value = null;
    try {
      return await ipcInvoke<Category>(IPC_API_ROUTE.category.create, input);
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    getAllCategories,
    createCategory,
  };
}

// ==================== 应用信息 API ====================

export function useAppAPI() {
  async function getAppInfo(): Promise<AppInfo> {
    return await ipcInvoke<AppInfo>(IPC_API_ROUTE.app.getVersion);
  }

  async function getPlatform(): Promise<string> {
    const result = await ipcInvoke<{ platform: string }>(IPC_API_ROUTE.app.getPlatform);
    return result.platform;
  }

  return {
    getAppInfo,
    getPlatform,
  };
}
