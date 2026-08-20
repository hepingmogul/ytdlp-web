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
} as const;

/** 窗口控制等非 Controller 通道 */
export const IPC_CHANNELS = {
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    CLOSE: 'window:close',
  },
} as const;

/** 收集所有 Controller IPC 路由 */
export function collectIpcRoutes(): string[] {
  return Object.values(IPC_API_ROUTE).flatMap((group) => Object.values(group));
}

/** preload 白名单：Controller 路由 + 其他允许的通道 */
export function getAllowedIpcChannels(): string[] {
  const windowChannels = Object.values(IPC_CHANNELS.WINDOW);
  return [...collectIpcRoutes(), ...windowChannels];
}

export type IpcApiRoute = typeof IPC_API_ROUTE;
export type IPCChannel = ReturnType<typeof getAllowedIpcChannels>[number];
