<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <div>
      <p class="text-xs font-medium uppercase tracking-widest text-sky-600">设置</p>
      <h2 class="mt-1 text-2xl font-bold text-slate-800">下载与依赖</h2>
    </div>

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <p v-if="message" class="text-sm text-emerald-600">{{ message }}</p>

    <section class="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h3 class="font-semibold text-slate-800">下载目录</h3>
      <p class="text-sm text-slate-600 break-all font-mono">{{ settings?.downloadDir || '—' }}</p>
      <button
        class="px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
        @click="onChooseDir"
      >
        选择目录
      </button>
    </section>

    <section class="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h3 class="font-semibold text-slate-800">代理</h3>
      <input
        v-model="proxy"
        placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
        class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
      >
      <button
        class="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700"
        @click="onSaveProxy"
      >
        保存代理
      </button>
    </section>

    <section class="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <h3 class="font-semibold text-slate-800">Cookies</h3>
      <p class="text-sm text-slate-600">
        {{ settings?.hasCookies ? '已导入 cookies.txt' : '未导入。部分站点需要登录态才能解析。' }}
      </p>
      <div class="flex gap-2">
        <button
          class="px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
          @click="onImportCookies"
        >
          导入 cookies.txt
        </button>
        <button
          v-if="settings?.hasCookies"
          class="px-4 py-2 text-sm rounded-lg text-red-600 hover:bg-red-50"
          @click="onClearCookies"
        >
          清除
        </button>
      </div>
    </section>

    <section class="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h3 class="font-semibold text-slate-800">并发数</h3>
      <input
        v-model.number="concurrent"
        type="number"
        min="1"
        max="3"
        class="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm"
        @change="onSaveConcurrent"
      >
      <p class="text-xs text-slate-400">同时下载的任务数，范围 1–3。</p>
    </section>

    <section class="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-slate-800">二进制检测</h3>
        <button
          class="text-sm text-sky-600 hover:text-sky-800"
          @click="onCheck"
        >
          重新检测
        </button>
      </div>
      <div class="text-sm space-y-2">
        <p>
          <span class="text-slate-500">yt-dlp：</span>
          <span :class="binaries?.ytdlp.path ? 'text-emerald-700' : 'text-red-600'">
            {{ binaries?.ytdlp.version || '未找到' }}
          </span>
        </p>
        <p class="text-xs text-slate-400 break-all font-mono">{{ binaries?.ytdlp.path || '未找到捆绑的 yt-dlp，请运行 npm run bin:fetch' }}</p>
        <p>
          <span class="text-slate-500">ffmpeg：</span>
          <span :class="binaries?.ffmpeg.path ? 'text-emerald-700' : 'text-red-600'">
            {{ binaries?.ffmpeg.version || '未找到' }}
          </span>
        </p>
        <p class="text-xs text-slate-400 break-all font-mono">{{ binaries?.ffmpeg.path || '未找到捆绑的 ffmpeg，请运行 npm run bin:fetch' }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useSettingsAPI } from '../composables/useElectronAPI';
import type { AppSettings, BinaryCheckResult } from '../types';

const {
  getSettings,
  updateSettings,
  chooseDownloadDir,
  checkBinaries,
  importCookies,
  clearCookies,
} = useSettingsAPI();
const settings = ref<AppSettings | null>(null);
const binaries = ref<BinaryCheckResult | null>(null);
const concurrent = ref(2);
const proxy = ref('');
const error = ref('');
const message = ref('');

async function load() {
  error.value = '';
  settings.value = await getSettings();
  concurrent.value = settings.value.maxConcurrent;
  proxy.value = settings.value.proxy || '';
  binaries.value = await checkBinaries();
}

async function onChooseDir() {
  try {
    settings.value = await chooseDownloadDir();
    message.value = '下载目录已更新';
  } catch (e: any) {
    error.value = e.message;
  }
}

async function onSaveProxy() {
  try {
    settings.value = await updateSettings({ proxy: proxy.value.trim() || null });
    proxy.value = settings.value.proxy || '';
    message.value = '代理已保存';
  } catch (e: any) {
    error.value = e.message;
  }
}

async function onImportCookies() {
  try {
    settings.value = await importCookies();
    message.value = settings.value.hasCookies ? 'cookies 已导入' : '已取消';
  } catch (e: any) {
    error.value = e.message;
  }
}

async function onClearCookies() {
  try {
    settings.value = await clearCookies();
    message.value = 'cookies 已清除';
  } catch (e: any) {
    error.value = e.message;
  }
}

async function onSaveConcurrent() {
  try {
    settings.value = await updateSettings({ maxConcurrent: concurrent.value });
    concurrent.value = settings.value.maxConcurrent;
    message.value = '并发数已保存';
  } catch (e: any) {
    error.value = e.message;
  }
}

async function onCheck() {
  try {
    binaries.value = await checkBinaries();
    message.value = '已重新检测';
  } catch (e: any) {
    error.value = e.message;
  }
}

onMounted(() => {
  load().catch((e: any) => {
    error.value = e.message || '加载设置失败';
  });
});
</script>
