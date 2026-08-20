/**
 * 将 Electron session Cookie 写成 yt-dlp 可用的 Netscape cookies.txt
 */

import fs from 'fs';
import type { Cookie } from 'electron';
import { ensureDir, getCookiesDir } from '~/electron/utils';
import path from 'path';

const COOKIE_TTL_MS = 20 * 60 * 1000;
const USEFUL_NAMES = new Set([
  'ttwid',
  'msToken',
  'odin_tt',
  'sid_tt',
  'sessionid',
  'sessionid_ss',
  'sid_guard',
  '__ac_nonce',
  '__ac_signature',
  'passport_csrf_token',
]);

export function getDouyinCookiesPath(): string {
  return path.join(getCookiesDir(), 'douyin.txt');
}

export function isDouyinCookiesFresh(filePath = getDouyinCookiesPath()): boolean {
  if (!fs.existsSync(filePath)) return false;
  try {
    repairNetscapeCookiesFile(filePath);
    const stat = fs.statSync(filePath);
    if (Date.now() - stat.mtimeMs > COOKIE_TTL_MS) return false;
    const text = fs.readFileSync(filePath, 'utf8');
    return [...USEFUL_NAMES].some((name) => text.includes(`\t${name}\t`));
  } catch {
    return false;
  }
}

function netscapeDomain(cookie: Cookie): { domain: string; includeSub: boolean } {
  const domain = (cookie.domain || '').trim();
  if (!domain) return { domain: '', includeSub: false };
  // Python http.cookiejar 断言：第二列 TRUE 当且仅当域名以 . 开头
  if (domain.startsWith('.')) {
    return { domain, includeSub: true };
  }
  return { domain, includeSub: false };
}

function isSafeCookieToken(value: string): boolean {
  return value.length > 0 && !/[\t\r\n]/.test(value);
}

export function cookiesToNetscape(cookies: Cookie[]): string {
  const lines = ['# Netscape HTTP Cookie File', '# 由落带从 Electron 会话导出，供 yt-dlp 使用', ''];
  for (const cookie of cookies) {
    if (!cookie.name || cookie.value == null) continue;
    if (!isSafeCookieToken(cookie.name) || !isSafeCookieToken(String(cookie.value))) continue;
    const { domain, includeSub } = netscapeDomain(cookie);
    if (!domain) continue;
    const pathName = cookie.path || '/';
    const secure = cookie.secure ? 'TRUE' : 'FALSE';
    const expiry = cookie.expirationDate ? String(Math.floor(cookie.expirationDate)) : '0';
    const flag = includeSub ? 'TRUE' : 'FALSE';
    const row = `${domain}\t${flag}\t${pathName}\t${secure}\t${expiry}\t${cookie.name}\t${cookie.value}`;
    lines.push(cookie.httpOnly ? `#HttpOnly_${row}` : row);
  }
  return `${lines.join('\n')}\n`;
}

/** 修正已写出的文件：host-only 域名不得标 TRUE */
export function repairNetscapeCookiesFile(filePath = getDouyinCookiesPath()): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  const next = text
    .split(/\r?\n/)
    .map((line) => {
      const httpOnly = line.startsWith('#HttpOnly_');
      if (!line || (line.startsWith('#') && !httpOnly)) return line;
      const prefix = httpOnly ? '#HttpOnly_' : '';
      const raw = httpOnly ? line.slice('#HttpOnly_'.length) : line;
      const parts = raw.split('\t');
      if (parts.length < 7) return line;
      const domain = parts[0];
      const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
      if (parts[1] === flag) return line;
      parts[1] = flag;
      return `${prefix}${parts.join('\t')}`;
    })
    .join('\n');
  if (next !== text) {
    fs.writeFileSync(filePath, next.endsWith('\n') ? next : `${next}\n`, 'utf8');
  }
}

export function writeDouyinCookiesFile(cookies: Cookie[]): string {
  const filePath = getDouyinCookiesPath();
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, cookiesToNetscape(cookies), 'utf8');
  return filePath;
}

export function pickCookiesPath(userCookies?: string | null): string | null {
  if (userCookies && fs.existsSync(userCookies)) {
    repairNetscapeCookiesFile(userCookies);
    return userCookies;
  }
  const harvested = getDouyinCookiesPath();
  if (fs.existsSync(harvested)) {
    repairNetscapeCookiesFile(harvested);
    return harvested;
  }
  return null;
}
