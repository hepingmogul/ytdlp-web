/**
 * 拷贝根目录 shared 文件夹到 electron/ 和 frontend/src/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');

export function copyShared() {
  const sourceDir = path.resolve(rootDir, 'shared');
  const targets = [
    path.resolve(rootDir, 'electron/shared'),
    path.resolve(rootDir, 'frontend/src/shared'),
  ];

  if (!fs.existsSync(sourceDir)) {
    console.warn('[Copy-Shared] Warning: shared/ directory does not exist.');
    return;
  }

  for (const targetDir of targets) {
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
    console.log(`[Copy-Shared] Copied shared/ -> ${path.relative(rootDir, targetDir)}`);
  }
}

// 如果作为主脚本运行，执行 copyShared
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  copyShared();
}
