#!/usr/bin/env node
/**
 * 按模式把 manifests/envs 模板写入运行时 .env
 * 用法: node manifests/envs/initEnv.mjs [development|test|production]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..');
const electronEnvDir = path.join(__dirname, 'electron');
const frontendEnvDir = path.join(__dirname, 'frontend');

const targetMode = (process.argv[2] ?? process.env.NODE_ENV ?? 'development').trim().toLowerCase();
const electronSourcePath = path.join(electronEnvDir, `.env.${targetMode}`);
const frontendSourcePath = path.join(frontendEnvDir, `.env.${targetMode}`);

const getCandidateModes = (folderPath) =>
  fs
    .readdirSync(folderPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith('.env.'))
    .map((entry) => entry.name.replace('.env.', ''))
    .sort();

if (!fs.existsSync(electronSourcePath) || !fs.existsSync(frontendSourcePath)) {
  const electronModes = getCandidateModes(electronEnvDir).join(', ') || '(空)';
  const frontendModes = getCandidateModes(frontendEnvDir).join(', ') || '(空)';
  throw new Error(
    `[env:init] 未找到模式 "${targetMode}" 对应配置。\n` +
      `- electron 可选: ${electronModes}\n` +
      `- frontend 可选: ${frontendModes}`
  );
}

const normalizeText = (text) => {
  const lfText = text.replace(/\r\n/g, '\n');
  return lfText.endsWith('\n') ? lfText : `${lfText}\n`;
};

const outputContents = [
  {
    filePath: path.join(workspaceRoot, 'electron', '.env'),
    text: normalizeText(fs.readFileSync(electronSourcePath, 'utf8')),
  },
  {
    filePath: path.join(workspaceRoot, 'frontend', '.env'),
    text: normalizeText(fs.readFileSync(frontendSourcePath, 'utf8')),
  },
];

for (const output of outputContents) {
  fs.writeFileSync(output.filePath, output.text, 'utf8');
  console.log(`[env:init] 已写入 ${path.relative(workspaceRoot, output.filePath)}`);
}

console.log(`[env:init] 当前环境: ${targetMode}`);
