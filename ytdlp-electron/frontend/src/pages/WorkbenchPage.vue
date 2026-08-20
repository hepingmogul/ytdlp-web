<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div>
      <p class="text-xs font-medium uppercase tracking-widest text-sky-600">工作台</p>
      <h2 class="mt-1 text-2xl font-bold text-slate-800">粘贴链接，解析后下载</h2>
      <p class="mt-2 text-sm text-slate-500">
        解析只取元数据。站点若需登录，先到「设置」导入 cookies.txt。
      </p>
    </div>

    <form class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3" @submit.prevent="onParse">
      <div class="flex flex-col gap-3 md:flex-row">
        <input
          v-model="url"
          type="url"
          placeholder="粘贴视频或播放列表链接"
          class="min-w-0 flex-1 px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
        <button
          type="submit"
          class="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          :disabled="parsing || !url.trim()"
        >
          {{ parsing ? '解析中…' : '解析' }}
        </button>
      </div>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    </form>

    <section v-if="info" class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-5">
      <div class="flex flex-col gap-4 md:flex-row">
        <img
          v-if="info.thumbnail"
          :src="info.thumbnail"
          alt=""
          class="h-28 w-48 rounded-lg object-cover bg-slate-100"
        >
        <div class="min-w-0">
          <p class="text-xs uppercase text-slate-400">
            {{ info.extractor }} · {{ info.type === 'playlist' ? '播放列表' : '视频' }}
          </p>
          <h3 class="mt-1 text-xl font-semibold text-slate-800">{{ info.title || '未命名' }}</h3>
          <p class="mt-2 text-sm text-slate-500">
            {{ info.uploader }}
            <span v-if="info.duration"> · {{ formatDuration(info.duration) }}</span>
            <span v-if="info.type === 'playlist'"> · {{ info.entries.length }} 条</span>
          </p>
        </div>
      </div>

      <div class="grid gap-3 md:grid-cols-2 text-sm">
        <label class="flex items-center gap-2">
          <input v-model="audioOnly" type="checkbox">
          仅音频
        </label>
        <label v-if="audioOnly" class="flex items-center gap-2">
          封装
          <select v-model="audioFormat" class="rounded-lg border border-slate-300 px-2 py-1">
            <option value="mp3">mp3</option>
            <option value="m4a">m4a</option>
            <option value="opus">opus</option>
          </select>
        </label>
        <label class="flex items-center gap-2">
          <input v-model="writeSubs" type="checkbox">
          下载字幕
        </label>
        <label class="flex items-center gap-2">
          <input v-model="writeAutoSubs" type="checkbox">
          包含自动字幕
        </label>
        <label v-if="writeSubs || writeAutoSubs" class="md:col-span-2 space-y-1">
          <span class="text-slate-500">字幕语言（逗号分隔）</span>
          <input
            v-model="subLangs"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          >
        </label>
      </div>

      <div v-if="!audioOnly">
        <p class="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">格式预设</p>
        <div class="flex flex-wrap gap-2 mb-3">
          <button
            v-for="preset in info.presets"
            :key="preset.id"
            type="button"
            class="rounded-full px-3 py-1 text-sm border transition-colors"
            :class="formatId === preset.id
              ? 'bg-sky-600 text-white border-sky-600'
              : 'bg-white text-slate-700 border-slate-300 hover:border-sky-400'"
            @click="formatId = preset.id"
          >
            {{ preset.label }}
          </button>
        </div>
        <div v-if="info.formats.length > 0" class="max-h-72 overflow-auto rounded-lg border border-slate-200">
          <table class="w-full text-left text-xs">
            <thead class="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th class="px-3 py-2">选用</th>
                <th class="px-3 py-2">ID</th>
                <th class="px-3 py-2">分辨率</th>
                <th class="px-3 py-2">编码</th>
                <th class="px-3 py-2">大小</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in info.formats"
                :key="item.formatId"
                class="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                @click="formatId = item.formatId"
              >
                <td class="px-3 py-2">
                  <input type="radio" :checked="formatId === item.formatId" @change="formatId = item.formatId">
                </td>
                <td class="px-3 py-2 font-mono">{{ item.formatId }}</td>
                <td class="px-3 py-2">
                  {{ item.resolution || item.note || '—' }}
                  <span v-if="item.ext"> · {{ item.ext }}</span>
                </td>
                <td class="px-3 py-2 text-slate-500">{{ item.vcodec || '—' }} / {{ item.acodec || '—' }}</td>
                <td class="px-3 py-2">{{ formatBytes(item.filesize) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="info.type === 'playlist'">
        <div class="mb-2 flex items-center justify-between text-sm">
          <p class="text-slate-500">节目单 · 已选 {{ selectedCount }}/{{ info.entries.length }}</p>
          <div class="space-x-3">
            <button type="button" class="text-sky-600" @click="selectAll">全选</button>
            <button type="button" class="text-slate-400" @click="selected = {}">清空</button>
          </div>
        </div>
        <ul class="max-h-80 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
          <li v-for="(entry, index) in info.entries" :key="entry.url">
            <label class="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-slate-50">
              <input
                type="checkbox"
                :checked="Boolean(selected[entry.url])"
                @change="toggleEntry(entry.url, ($event.target as HTMLInputElement).checked)"
              >
              <span class="w-8 font-mono text-xs text-slate-400">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="min-w-0 flex-1 truncate">{{ entry.title || entry.url }}</span>
              <span class="font-mono text-xs text-slate-400">{{ formatDuration(entry.duration) }}</span>
            </label>
          </li>
        </ul>
      </div>

      <div class="flex justify-end">
        <button
          type="button"
          class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          :disabled="submitting"
          @click="onSubmit"
        >
          {{ submitting ? '加入队列…' : info.type === 'playlist' ? '批量下载' : '开始下载' }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useParseAPI, useTaskAPI } from '../composables/useElectronAPI';
import { DEFAULT_FORMAT } from '../shared/constant';
import { formatBytes, formatDuration } from '../utils/format';
import type { ParseResult } from '../types';

const router = useRouter();
const { parseUrl } = useParseAPI();
const { createTask } = useTaskAPI();

const url = ref('');
const parsing = ref(false);
const submitting = ref(false);
const error = ref('');
const info = ref<ParseResult | null>(null);
const formatId = ref(DEFAULT_FORMAT);
const audioOnly = ref(false);
const audioFormat = ref<'mp3' | 'm4a' | 'opus'>('mp3');
const writeSubs = ref(false);
const writeAutoSubs = ref(false);
const subLangs = ref('zh-Hans,en');
const selected = ref<Record<string, boolean>>({});

const selectedCount = computed(() => Object.values(selected.value).filter(Boolean).length);

function selectAll() {
  if (!info.value || info.value.type !== 'playlist') return;
  const next: Record<string, boolean> = {};
  for (const entry of info.value.entries) next[entry.url] = true;
  selected.value = next;
}

function toggleEntry(entryUrl: string, checked: boolean) {
  selected.value = { ...selected.value, [entryUrl]: checked };
}

async function onParse() {
  error.value = '';
  info.value = null;
  parsing.value = true;
  try {
    const result = await parseUrl(url.value.trim());
    info.value = result;
    formatId.value = result.presets[0]?.id || DEFAULT_FORMAT;
    if (result.type === 'playlist') selectAll();
    else selected.value = {};
  } catch (e: any) {
    error.value = e.message || '解析失败';
  } finally {
    parsing.value = false;
  }
}

async function onSubmit() {
  if (!info.value) return;
  error.value = '';
  if (info.value.type === 'playlist' && selectedCount.value === 0) {
    error.value = '请至少勾选一条节目';
    return;
  }
  submitting.value = true;
  try {
    const langs = subLangs.value
      .split(/[,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    await createTask({
      url: info.value.webpageUrl || url.value.trim(),
      title: info.value.title,
      thumbnail: info.value.thumbnail,
      extractor: info.value.extractor,
      formatId: audioOnly.value ? 'bestaudio/best' : formatId.value,
      audioOnly: audioOnly.value,
      audioFormat: audioFormat.value,
      writeSubs: writeSubs.value,
      writeAutoSubs: writeAutoSubs.value,
      subLangs: langs,
      entries:
        info.value.type === 'playlist'
          ? info.value.entries
              .filter((entry) => selected.value[entry.url])
              .map((entry) => ({
                url: entry.url,
                title: entry.title,
                thumbnail: entry.thumbnail,
              }))
          : undefined,
    });
    await router.push('/tasks');
  } catch (e: any) {
    error.value = e.message || '创建任务失败';
  } finally {
    submitting.value = false;
  }
}
</script>
