/**
 * IPC 通道常量
 * 主进程和渲染进程共享，避免魔法字符串
 * format: controller/filename/method
 */

export const IPC_API_ROUTE = {
  app: {
    getVersion: 'controller/app/getVersion',
    getPlatform: 'controller/app/getPlatform',
  },
  note: {
    getAll: 'controller/note/getAll',
    getById: 'controller/note/getById',
    create: 'controller/note/create',
    update: 'controller/note/update',
    delete: 'controller/note/delete',
    queryByCategory: 'controller/note/queryByCategory',
  },
  category: {
    getAll: 'controller/category/getAll',
    create: 'controller/category/create',
    delete: 'controller/category/delete',
  },
  loginState: {
    login: 'controller/loginState/login',
    logout: 'controller/loginState/logout',
    getByUid: 'controller/loginState/getByUid',
    getActive: 'controller/loginState/getActive',
    delete: 'controller/loginState/delete',
    getAll: 'controller/loginState/getAll',
  },
  parse: {
    url: 'controller/parse/url',
  },
  task: {
    create: 'controller/task/create',
    list: 'controller/task/list',
    get: 'controller/task/get',
    cancel: 'controller/task/cancel',
    retry: 'controller/task/retry',
    delete: 'controller/task/delete',
    openFolder: 'controller/task/openFolder',
    revealFile: 'controller/task/revealFile',
    children: 'controller/task/children',
  },
  settings: {
    get: 'controller/settings/get',
    update: 'controller/settings/update',
    chooseDownloadDir: 'controller/settings/chooseDownloadDir',
    checkBinaries: 'controller/settings/checkBinaries',
    importCookies: 'controller/settings/importCookies',
    clearCookies: 'controller/settings/clearCookies',
  },
} as const;

/** 窗口控制、进度推送等非 Controller 通道 */
export const IPC_CHANNELS = {
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    CLOSE: 'window:close',
  },
  DOWNLOAD: {
    PROGRESS: 'download:progress',
  },
} as const;

/** 收集所有 Controller IPC 路由 */
export function collectIpcRoutes(): string[] {
  return Object.values(IPC_API_ROUTE).flatMap((group) => Object.values(group));
}

/** preload 白名单：Controller 路由 + 其他允许的通道 */
export function getAllowedIpcChannels(): string[] {
  const windowChannels = Object.values(IPC_CHANNELS.WINDOW);
  const downloadChannels = Object.values(IPC_CHANNELS.DOWNLOAD);
  return [...collectIpcRoutes(), ...windowChannels, ...downloadChannels];
}

export type IpcApiRoute = typeof IPC_API_ROUTE;
export type IPCChannel = ReturnType<typeof getAllowedIpcChannels>[number];
