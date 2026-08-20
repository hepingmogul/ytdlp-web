/**
 * yt-dlp 错误转换
 */

export class YtdlpCancelled extends Error {
  constructor(message = '任务已取消') {
    super(message);
    this.name = 'YtdlpCancelled';
  }
}

export function explainYtdlpError(exc: unknown): string {
  if (exc instanceof YtdlpCancelled) {
    return exc.message;
  }
  const text = exc instanceof Error ? exc.message : String(exc || '');
  const lowered = text.toLowerCase();
  if (lowered.includes('ffmpeg')) {
    return '未找到 ffmpeg，无法合并音视频或抽取音频。请安装 ffmpeg 并加入 PATH。';
  }
  if (lowered.includes('sign in') || lowered.includes('login') || lowered.includes('cookie')) {
    return '该内容需要登录。请稍后在设置中导入 cookies.txt 后重试。';
  }
  if (lowered.includes('private')) {
    return '视频为私有或无权访问。';
  }
  if (lowered.includes('unavailable') || lowered.includes('not available')) {
    return '视频不可用或已被删除。';
  }
  if (!text) {
    return '下载失败，未知错误';
  }
  if (text.length > 400) {
    return `${text.slice(0, 400)}…`;
  }
  return text;
}

export function assertHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('无效链接');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('仅支持 http/https 链接');
  }
}

export function assertProxyUrl(proxy: string | null | undefined): string | null {
  const value = proxy?.trim();
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('代理地址无效，示例：http://127.0.0.1:7890');
  }
  if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(parsed.protocol)) {
    throw new Error('代理仅支持 http / https / socks5');
  }
  return value;
}
