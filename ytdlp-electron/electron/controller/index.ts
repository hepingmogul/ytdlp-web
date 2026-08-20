/**
 * Controller 统一导出和 IPC 注册
 * 路由格式：controller/文件名/方法名
 */

import { ipcMain } from 'electron';
import { collectIpcRoutes } from '~/electron/shared/ipcChannels';
import { logger } from '~/electron/utils/logger';

type ControllerMethod = (data?: unknown) => unknown;
type ControllerCtor = new () => object;

const controllerCache = new Map<string, object>();

/** 路由名 → 类名，如 app → AppController */
function getControllerClassName(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}Controller`;
}

/** 按路由名动态 require 并缓存 Controller 实例 */
function getController(name: string): object | null {
  const cached = controllerCache.get(name);
  if (cached) return cached;

  try {
    const mod = require(`./${name}`) as Record<string, ControllerCtor>;
    const ControllerClass = mod[getControllerClassName(name)];
    if (typeof ControllerClass !== 'function') return null;

    const instance = new ControllerClass();
    controllerCache.set(name, instance);
    return instance;
  } catch {
    return null;
  }
}

function getControllerMethod(controller: object, method: string): ControllerMethod | undefined {
  const handler = (controller as Record<string, unknown>)[method];
  return typeof handler === 'function' ? (handler as ControllerMethod) : undefined;
}

function parseControllerRoute(channel: string): { name: string; method: string } | null {
  const match = /^controller\/([^/]+)\/([^/]+)$/.exec(channel);
  if (!match) return null;
  return { name: match[1], method: match[2] };
}

/**
 * 注册所有 Controller IPC 处理器
 */
export function registerIpcHandlers(): void {
  const routes = collectIpcRoutes();

  for (const channel of routes) {
    const route = parseControllerRoute(channel);
    if (!route) continue;

    ipcMain.handle(channel, async (_event, args) => {
      const controller = getController(route.name);
      if (!controller) {
        return { success: false, error: `Unknown controller: ${route.name}` };
      }

      const handler = getControllerMethod(controller, route.method);
      if (!handler) {
        return { success: false, error: `Unknown method: ${route.method}` };
      }

      return handler.call(controller, args);
    });
  }

  logger.info(`[Controller] IPC handlers registered (${routes.length})`);
}
