<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-xs font-medium uppercase tracking-widest text-sky-600">任务</p>
        <h2 class="mt-1 text-2xl font-bold text-slate-800">下载队列</h2>
      </div>
      <button class="text-sm text-sky-600 hover:text-sky-800" @click="reload">刷新</button>
    </div>

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <div v-if="items.length === 0" class="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
      还没有任务。去工作台粘贴一条链接吧。
    </div>

    <ul class="space-y-3">
      <li
        v-for="task in items"
        :key="task.id"
        class="bg-white rounded-xl border border-slate-200 p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-medium text-slate-800 truncate">{{ task.title || task.url }}</p>
            <p class="mt-1 text-xs text-slate-400 truncate">
              <span v-if="task.mode === 'playlist'">播放列表 · {{ task.doneCount }}/{{ task.childCount }} · </span>
              {{ task.url }}
            </p>
          </div>
          <span class="shrink-0 text-xs px-2 py-1 rounded-full" :class="statusClass(task.status)">
            {{ statusLabel(task.status) }}
          </span>
        </div>

        <div v-if="isActiveStatus(task.status) || task.mode === 'playlist'" class="mt-3">
          <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              class="h-full bg-sky-500 transition-all"
              :style="{ width: `${Math.min(100, task.percent || 0)}%` }"
            />
          </div>
          <p class="mt-1 text-xs text-slate-500">
            {{ task.percent?.toFixed(1) || 0 }}%
            <span v-if="task.speed"> · {{ task.speed }}</span>
            <span v-if="task.eta"> · 剩余 {{ formatDuration(task.eta) }}</span>
          </p>
        </div>

        <p v-if="task.errorMessage" class="mt-2 text-xs text-red-600">{{ task.errorMessage }}</p>
        <p v-if="task.filename" class="mt-2 text-xs text-slate-500 truncate">{{ task.filename }}</p>

        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-if="task.mode === 'playlist'"
            class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 hover:bg-slate-50"
            @click="toggleChildren(task.id)"
          >
            {{ childrenMap[task.id] ? '收起' : '展开子任务' }}
          </button>
          <button
            v-if="isActiveStatus(task.status)"
            class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 hover:bg-slate-50"
            @click="onCancel(task.id)"
          >
            取消
          </button>
          <button
            v-if="task.status === 'failed' || task.status === 'cancelled'"
            class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 hover:bg-slate-50"
            @click="onRetry(task.id)"
          >
            重试
          </button>
          <button
            v-if="task.status === 'done' || task.mode === 'playlist'"
            class="px-3 py-1.5 text-xs rounded-lg bg-sky-600 text-white hover:bg-sky-700"
            @click="onOpen(task.id)"
          >
            打开文件夹
          </button>
          <button
            class="px-3 py-1.5 text-xs rounded-lg text-red-600 hover:bg-red-50"
            @click="onDelete(task.id)"
          >
            删除
          </button>
        </div>

        <ul v-if="childrenMap[task.id]" class="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <li
            v-for="child in childrenMap[task.id]"
            :key="child.id"
            class="rounded-lg bg-slate-50 px-3 py-2"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="min-w-0 truncate text-sm text-slate-700">{{ child.title || child.url }}</p>
              <span class="shrink-0 text-xs" :class="statusClass(child.status)">{{ statusLabel(child.status) }}</span>
            </div>
            <p v-if="isActiveStatus(child.status)" class="mt-1 text-xs text-slate-500">
              {{ child.percent?.toFixed(1) || 0 }}%
              <span v-if="child.speed"> · {{ child.speed }}</span>
            </p>
            <p v-if="child.errorMessage" class="mt-1 text-xs text-red-600">{{ child.errorMessage }}</p>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useDownloadProgress, useTaskAPI } from '../composables/useElectronAPI';
import { formatDuration, isActiveStatus, statusLabel } from '../utils/format';
import type { DownloadProgress, DownloadTask } from '../types';

const { listTasks, cancelTask, retryTask, deleteTask, openFolder, listChildren } = useTaskAPI();
const items = ref<DownloadTask[]>([]);
const childrenMap = ref<Record<string, DownloadTask[]>>({});
const error = ref('');

function applyProgress(list: DownloadTask[], payload: DownloadProgress): DownloadTask[] {
  return list.map((row) =>
    row.id === payload.id
      ? {
          ...row,
          status: payload.status,
          percent: payload.percent,
          speed: payload.speed,
          eta: payload.eta,
          downloadedBytes: payload.downloadedBytes,
          totalBytes: payload.totalBytes,
          errorMessage: payload.errorMessage,
          filename: payload.filename ?? row.filename,
          title: payload.title ?? row.title,
          childCount: payload.childCount ?? row.childCount,
          doneCount: payload.doneCount ?? row.doneCount,
        }
      : row,
  );
}

async function reload() {
  try {
    const result = await listTasks();
    items.value = result.items;
    error.value = '';
    const openIds = Object.keys(childrenMap.value);
    for (const id of openIds) {
      const data = await listChildren(id);
      childrenMap.value = { ...childrenMap.value, [id]: data.items };
    }
  } catch (e: any) {
    error.value = e.message || '加载失败';
  }
}

useDownloadProgress((payload) => {
  items.value = applyProgress(items.value, payload);
  if (payload.parentId && childrenMap.value[payload.parentId]) {
    childrenMap.value = {
      ...childrenMap.value,
      [payload.parentId]: applyProgress(childrenMap.value[payload.parentId], payload),
    };
  }
  if (childrenMap.value[payload.id]) {
    childrenMap.value = {
      ...childrenMap.value,
      [payload.id]: applyProgress(childrenMap.value[payload.id], payload),
    };
  }
});

function statusClass(status: string): string {
  if (status === 'done') return 'bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'bg-red-50 text-red-700';
  if (status === 'cancelled') return 'bg-slate-100 text-slate-500';
  return 'bg-sky-50 text-sky-700';
}

async function toggleChildren(id: string) {
  if (childrenMap.value[id]) {
    const next = { ...childrenMap.value };
    delete next[id];
    childrenMap.value = next;
    return;
  }
  try {
    const data = await listChildren(id);
    childrenMap.value = { ...childrenMap.value, [id]: data.items };
  } catch (e: any) {
    error.value = e.message;
  }
}

async function onCancel(id: string) {
  try {
    const updated = await cancelTask(id);
    items.value = items.value.map((row) => (row.id === id ? updated : row));
    if (childrenMap.value[id]) {
      const data = await listChildren(id);
      childrenMap.value = { ...childrenMap.value, [id]: data.items };
    }
  } catch (e: any) {
    error.value = e.message;
  }
}

async function onRetry(id: string) {
  try {
    const updated = await retryTask(id);
    items.value = items.value.map((row) => (row.id === id ? updated : row));
    if (childrenMap.value[id]) {
      const data = await listChildren(id);
      childrenMap.value = { ...childrenMap.value, [id]: data.items };
    }
  } catch (e: any) {
    error.value = e.message;
  }
}

async function onOpen(id: string) {
  try {
    await openFolder(id);
  } catch (e: any) {
    error.value = e.message;
  }
}

async function onDelete(id: string) {
  try {
    await deleteTask(id);
    items.value = items.value.filter((row) => row.id !== id);
    const next = { ...childrenMap.value };
    delete next[id];
    childrenMap.value = next;
  } catch (e: any) {
    error.value = e.message;
  }
}

onMounted(() => {
  void reload();
});
</script>
