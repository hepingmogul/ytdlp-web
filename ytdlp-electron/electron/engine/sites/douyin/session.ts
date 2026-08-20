/**
 * 用 Electron Chromium 打开抖音页，过 JS 挑战并采集 Cookie / 详情 JSON
 */

import { BrowserWindow, session } from 'electron';
import type { Session, WebContents } from 'electron';
import { getMainWindow } from '~/electron/main/mainWindow';
import {
  getDouyinCookiesPath,
  isDouyinCookiesFresh,
  writeDouyinCookiesFile,
} from '~/electron/engine/sites/douyin/cookies';
import { decodeMaybeJson, mapFromUnknown, type DouyinMapped } from '~/electron/engine/sites/douyin/map';
import { canonicalDouyinVideoUrl, chromeUserAgent, jingxuanDouyinUrl } from '~/electron/engine/sites/douyin/url';
import { logger } from '~/electron/utils/logger';

const PARTITION = 'persist:douyin';
const HIDDEN_TIMEOUT_MS = 28000;
const INTERACTIVE_TIMEOUT_MS = 120000;

export interface HarvestOptions {
  videoId: string;
  url?: string;
  interactive: boolean;
  proxy?: string | null;
}

export interface HarvestResult {
  mapped: DouyinMapped | null;
  cookiesPath: string | null;
}

let sessionInited = false;
let harvestChain: Promise<unknown> = Promise.resolve();
let currentWin: BrowserWindow | null = null;

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = harvestChain.then(fn, fn);
  harvestChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function getSession(): Session {
  const ses = session.fromPartition(PARTITION);
  if (!sessionInited) {
    ses.setUserAgent(chromeUserAgent());
    sessionInited = true;
  }
  return ses;
}

async function applyProxy(ses: Session, proxy?: string | null): Promise<void> {
  if (proxy?.trim()) {
    await ses.setProxy({ proxyRules: proxy.trim() });
    return;
  }
  await ses.setProxy({ mode: 'direct' });
}

function isJsonishNetwork(url: string, mime: string): boolean {
  if (/^image\//i.test(mime) || /^video\//i.test(mime) || /octet-stream/i.test(mime) || /mpegurl/i.test(mime)) {
    return false;
  }
  if (/\/aweme\/v\d+\//i.test(url) || /iteminfo/i.test(url) || /aweme_detail/i.test(url)) return true;
  return /json/i.test(mime) && /douyin\.com/i.test(url);
}

async function scrapePagePayload(wc: WebContents): Promise<unknown[]> {
  try {
    const payloads = (await wc.executeJavaScript(
      `(() => {
        const out = [];
        const nodes = document.querySelectorAll('#RENDER_DATA, #RENDER_DATA_1, #__NEXT_DATA__, script[id*="RENDER"]');
        for (const el of nodes) {
          if (el && el.textContent) out.push(el.textContent);
        }
        const scripts = document.querySelectorAll('script');
        for (const el of scripts) {
          const t = el.textContent || '';
          if (t.length > 80 && (t.includes('aweme_id') || t.includes('videoDetail') || t.includes('aweme_detail'))) {
            out.push(t.slice(0, 800000));
          }
        }
        return out.slice(0, 12);
      })()`,
      true,
    )) as unknown;
    return Array.isArray(payloads) ? payloads : [];
  } catch (err) {
    logger.warn(`[Douyin] 页面脚本读取失败: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

async function exportCookies(ses: Session): Promise<string | null> {
  try {
    const cookies = await ses.cookies.get({});
    const useful = cookies.filter(
      (item) => /douyin|bytedance|iesdouyin/i.test(item.domain || '') || item.domain?.includes('snssdk'),
    );
    const names = [...new Set(useful.map((item) => item.name))].slice(0, 20);
    logger.info(`[Douyin] Cookie 总数=${cookies.length} 相关=${useful.length} names=${names.join(',') || '(空)'}`);
    const pool = useful.length > 0 ? useful : cookies;
    if (pool.length === 0) return null;
    const filePath = writeDouyinCookiesFile(pool);
    logger.info(`[Douyin] Cookie 已写入 ${filePath}`);
    return filePath;
  } catch (err) {
    logger.warn(`[Douyin] 导出 Cookie 失败: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function destroyWin(): void {
  if (currentWin && !currentWin.isDestroyed()) {
    currentWin.destroy();
  }
  currentWin = null;
}

export function disposeDouyinHarvest(): void {
  destroyWin();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} 超时 ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type DebuggerHandler = (event: unknown, method: string, params: Record<string, unknown>) => void;

async function enableNetworkIntercept(
  wc: WebContents,
  mode: string,
  onDebugger: DebuggerHandler,
): Promise<boolean> {
  const started = Date.now();
  try {
    logger.info(`[Douyin][${mode}] CDP debugger.attach 开始 attached=${wc.debugger.isAttached()}`);
    if (!wc.debugger.isAttached()) {
      wc.debugger.attach('1.3');
    }
    logger.info(`[Douyin][${mode}] debugger.attach 完成 耗时=${Date.now() - started}ms`);
    wc.debugger.on('message', onDebugger);
    logger.info(`[Douyin][${mode}] Network.enable 开始`);
    await withTimeout(wc.debugger.sendCommand('Network.enable'), 5000, 'Network.enable');
    logger.info(`[Douyin][${mode}] CDP Network.enable 成功 耗时=${Date.now() - started}ms`);
    return true;
  } catch (err) {
    logger.warn(
      `[Douyin][${mode}] 调试器未附着/启用失败: ${err instanceof Error ? err.message : String(err)} 耗时=${Date.now() - started}ms，将仅靠页面脚本采集`,
    );
    try {
      wc.debugger.off('message', onDebugger);
      if (wc.debugger.isAttached()) wc.debugger.detach();
    } catch {
      // 忽略
    }
    return false;
  }
}

async function harvestOnce(options: HarvestOptions): Promise<HarvestResult> {
  const started = Date.now();
  const mode = options.interactive ? '可见窗' : '隐藏窗';
  const ses = getSession();
  await applyProxy(ses, options.proxy);
  const targetUrl = options.url || jingxuanDouyinUrl(options.videoId);
  logger.info(`[Douyin][${mode}] 开始采集 id=${options.videoId} url=${targetUrl} proxy=${options.proxy || '(无)'}`);

  const parent = options.interactive ? getMainWindow() ?? undefined : undefined;
  const win = new BrowserWindow({
    show: options.interactive,
    width: 1100,
    height: 780,
    x: options.interactive ? undefined : -24000,
    y: options.interactive ? undefined : -24000,
    autoHideMenuBar: true,
    skipTaskbar: !options.interactive,
    parent,
    title: options.interactive ? '落带 - 请在此完成抖音验证' : '落带 - 抖音解析',
    webPreferences: {
      partition: PARTITION,
      // 沙箱下 debugger.attach 可能卡住主进程；无 preload / 无 node，风险可控
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  currentWin = win;
  logger.info(`[Douyin][${mode}] BrowserWindow 已创建 id=${win.id} interactive=${options.interactive}`);
  win.webContents.setAudioMuted(true);
  win.webContents.on('did-fail-load', (_event, code, desc, failedUrl, isMainFrame) => {
    if (!isMainFrame) return;
    logger.warn(`[Douyin][${mode}] did-fail-load code=${code} desc=${desc} url=${failedUrl}`);
  });
  win.webContents.on('did-navigate', (_event, url) => {
    logger.info(`[Douyin][${mode}] did-navigate ${url}`);
  });
  win.webContents.on('did-start-loading', () => {
    logger.info(`[Douyin][${mode}] did-start-loading href=${win.isDestroyed() ? '(destroyed)' : win.webContents.getURL()}`);
  });
  win.webContents.on('did-finish-load', () => {
    logger.info(`[Douyin][${mode}] did-finish-load href=${win.isDestroyed() ? '(destroyed)' : win.webContents.getURL()}`);
  });

  if (!options.interactive) {
    win.setMenuBarVisibility(false);
    logger.info(`[Douyin][${mode}] showInactive 开始`);
    try {
      // 完全隐藏时挑战脚本可能不跑；透明度 0 + 移出屏幕，避免 Windows 离屏窗卡死
      win.setOpacity(0);
      win.showInactive();
      logger.info(`[Douyin][${mode}] showInactive 完成`);
    } catch (err) {
      logger.warn(`[Douyin][${mode}] showInactive 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    await delay(0);
  }

  const wc = win.webContents;
  let mapped: DouyinMapped | null = null;
  let cdpEnabled = false;
  const pendingBodies = new Map<string, string>();

  const tryAcceptText = (text: string) => {
    if (mapped) return;
    const json = decodeMaybeJson(text);
    if (!json) return;
    const next = mapFromUnknown(json, options.videoId);
    if (next && next.parse.id === options.videoId) {
      mapped = next;
      logger.info(`[Douyin][${mode}] 已从页面数据解析 id=${options.videoId} title=${next.parse.title} plays=${next.plays.length}`);
    }
  };

  const onDebugger: DebuggerHandler = (_event, method, params) => {
    void (async () => {
      if (method === 'Network.responseReceived') {
        const response = params.response as Record<string, unknown> | undefined;
        const url = String(response?.url || '');
        const mime = String(response?.mimeType || '');
        if (isJsonishNetwork(url, mime) && typeof params.requestId === 'string') {
          pendingBodies.set(params.requestId, url);
          logger.debug(`[Douyin][${mode}] 网络JSON ${mime} ${url.slice(0, 180)}`);
        }
      }
      if (method === 'Network.loadingFinished' && typeof params.requestId === 'string') {
        const url = pendingBodies.get(params.requestId);
        if (!url) return;
        pendingBodies.delete(params.requestId);
        try {
          const body = (await wc.debugger.sendCommand('Network.getResponseBody', {
            requestId: params.requestId,
          })) as { body?: string; base64Encoded?: boolean };
          const text = body.base64Encoded
            ? Buffer.from(body.body || '', 'base64').toString('utf8')
            : body.body || '';
          logger.debug(`[Douyin][${mode}] 响应体 ${url.slice(0, 160)} len=${text.length}`);
          tryAcceptText(text);
        } catch (err) {
          logger.debug(`[Douyin][${mode}] 读响应体失败 ${url.slice(0, 160)}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    })();
  };

  // 先加载 about:blank，等渲染进程就绪再附着 CDP，避免 attach 卡死主进程
  try {
    logger.info(`[Douyin][${mode}] 预热 about:blank`);
    await withTimeout(win.loadURL('about:blank'), 8000, 'about:blank');
    logger.info(`[Douyin][${mode}] about:blank 完成 href=${wc.getURL()} 耗时=${Date.now() - started}ms`);
  } catch (err) {
    logger.warn(`[Douyin][${mode}] about:blank 失败: ${err instanceof Error ? err.message : String(err)}，继续尝试附着 CDP`);
  }

  cdpEnabled = await enableNetworkIntercept(wc, mode, onDebugger);
  logger.info(`[Douyin][${mode}] CDP 启用=${cdpEnabled}`);

  const closed = new Promise<void>((resolve) => {
    win.on('closed', () => resolve());
  });

  const timeoutMs = options.interactive ? INTERACTIVE_TIMEOUT_MS : HIDDEN_TIMEOUT_MS;

  try {
    logger.info(`[Douyin][${mode}] loadURL ${targetUrl}`);
    await withTimeout(win.loadURL(targetUrl, { userAgent: chromeUserAgent() }), 20000, 'loadURL');
    logger.info(`[Douyin][${mode}] loadURL 完成 href=${wc.getURL()} title=${wc.getTitle()} 耗时=${Date.now() - started}ms`);
  } catch (err) {
    logger.warn(`[Douyin][${mode}] 加载失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  const deadline = Date.now() + timeoutMs;
  let poll = 0;
  let switchedToCanonical = false;
  while (Date.now() < deadline && !mapped) {
    if (win.isDestroyed()) {
      logger.warn(`[Douyin][${mode}] 窗口已被关闭`);
      break;
    }
    poll += 1;
    const snippets = await scrapePagePayload(wc);
    if (poll === 1 || poll % 5 === 0) {
      logger.info(
        `[Douyin][${mode}] 轮询#${poll} href=${wc.getURL()} title=${wc.getTitle()} snippets=${snippets.length} remain=${Math.max(0, deadline - Date.now())}ms`,
      );
    }
    for (const snippet of snippets) {
      if (typeof snippet === 'string') tryAcceptText(snippet);
    }
    if (mapped) break;
    if (options.interactive && win.isDestroyed()) break;
    const onJingxuan = /jingxuan/i.test(wc.getURL());
    if (!switchedToCanonical && onJingxuan && Date.now() - started > 6000) {
      switchedToCanonical = true;
      const canonical = canonicalDouyinVideoUrl(options.videoId);
      logger.info(`[Douyin][${mode}] 精选页未命中目标 id，改开 ${canonical}`);
      try {
        await withTimeout(win.loadURL(canonical, { userAgent: chromeUserAgent() }), 20000, 'loadURL canonical');
        logger.info(`[Douyin][${mode}] canonical 加载完成 href=${wc.getURL()} title=${wc.getTitle()}`);
      } catch (err) {
        logger.warn(`[Douyin][${mode}] canonical 加载失败: ${err instanceof Error ? err.message : String(err)}`);
      }
      continue;
    }
    await delay(800);
  }

  if (!mapped) {
    const snippets = await scrapePagePayload(wc);
    for (const snippet of snippets) {
      if (typeof snippet === 'string') tryAcceptText(snippet);
    }
  }

  logger.info(`[Douyin][${mode}] 采集循环结束 mapped=${Boolean(mapped)} 耗时=${Date.now() - started}ms`);
  const cookiesPath = await exportCookies(ses);

  try {
    if (cdpEnabled || wc.debugger.isAttached()) {
      wc.debugger.off('message', onDebugger);
      if (wc.debugger.isAttached()) wc.debugger.detach();
      logger.info(`[Douyin][${mode}] CDP 已分离`);
    }
  } catch (err) {
    logger.debug(`[Douyin][${mode}] CDP 分离失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!win.isDestroyed()) {
    if (options.interactive && !mapped) {
      // 给用户看完最后一帧后关闭
      win.close();
      await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 1500))]);
    } else {
      destroyWin();
    }
  } else {
    currentWin = null;
  }

  logger.info(`[Douyin][${mode}] 结束 mapped=${Boolean(mapped)} cookies=${cookiesPath || '(无)'} 总耗时=${Date.now() - started}ms`);
  return { mapped, cookiesPath };
}

export function harvestDouyin(options: HarvestOptions): Promise<HarvestResult> {
  logger.info(`[Douyin] 进入采集队列 interactive=${options.interactive} id=${options.videoId}`);
  return withLock(() => harvestOnce(options));
}

export async function ensureDouyinCookies(options: {
  videoId: string;
  proxy?: string | null;
  interactiveIfNeeded?: boolean;
}): Promise<{ mapped: DouyinMapped | null; cookiesPath: string | null }> {
  if (isDouyinCookiesFresh()) {
    logger.info(`[Douyin] 复用新鲜 Cookie ${getDouyinCookiesPath()}`);
    return { mapped: null, cookiesPath: getDouyinCookiesPath() };
  }
  let result = await harvestDouyin({
    videoId: options.videoId,
    interactive: false,
    proxy: options.proxy,
  });
  if (result.mapped || (result.cookiesPath && isDouyinCookiesFresh(result.cookiesPath))) {
    return result;
  }
  if (options.interactiveIfNeeded !== false) {
    result = await harvestDouyin({
      videoId: options.videoId,
      interactive: true,
      proxy: options.proxy,
    });
  }
  return result;
}
