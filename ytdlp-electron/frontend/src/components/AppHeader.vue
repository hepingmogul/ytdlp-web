<template>
  <header class="h-14 bg-slate-800 text-white flex items-center px-6 shadow-md shrink-0">
    <div class="flex items-center gap-3">
      <svg class="w-6 h-6 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <h1 class="text-lg font-semibold tracking-tight">{{ title }}</h1>
    </div>
    <div class="flex-1" />
    <div v-if="appInfo" class="text-xs text-slate-400">
      v{{ appInfo.version }}
    </div>
  </header>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAppAPI } from '../composables/useElectronAPI';
import type { AppInfo } from '../types';

const props = defineProps<{
  title: string;
}>();

const { getAppInfo } = useAppAPI();
const appInfo = ref<AppInfo | null>(null);

onMounted(async () => {
  try {
    appInfo.value = await getAppInfo();
  } catch (e) {
    console.error('Failed to get app info:', e);
  }
});
</script>
