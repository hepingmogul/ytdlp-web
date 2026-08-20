<template>
  <div class="flex flex-col h-full min-h-0 bg-slate-50">
    <AppHeader :title="title" />
    <nav class="bg-white border-b border-slate-200 px-6 flex gap-1 shrink-0">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="px-3 py-2.5 text-sm border-b-2 -mb-px"
        :class="isActive(item.to)
          ? 'border-sky-600 text-sky-700 font-medium'
          : 'border-transparent text-slate-500 hover:text-slate-800'"
      >
        {{ item.label }}
      </RouterLink>
    </nav>
    <main class="flex-1 overflow-auto p-6">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import AppHeader from './AppHeader.vue';

defineProps<{
  title: string;
}>();

const route = useRoute();
const navItems = [
  { to: '/', label: '工作台' },
  { to: '/tasks', label: '任务' },
  { to: '/settings', label: '设置' },
];

function isActive(to: string): boolean {
  return route.path === to;
}
</script>
