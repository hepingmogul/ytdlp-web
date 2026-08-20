<template>
  <div class="flex flex-col h-full min-h-0 bg-slate-50">
    <AppHeader :title="title" />
    <main class="flex-1 overflow-auto p-6">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from './AppHeader.vue';

defineProps<{
  title: string;
}>();
</script>
