<template>
  <AppLayout title="Electron Vite Desktop App">
    <div class="max-w-4xl mx-auto space-y-6">
      <!-- 欢迎卡片 -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 class="text-xl font-bold text-slate-800 mb-2">
          欢迎使用 Electron + Vite + Vue 3
        </h2>
        <p class="text-slate-600 leading-relaxed">
          这是一个现代化的桌面应用开发模板，集成了 TypeScript、TailwindCSS、better-sqlite3 等工具。
          使用 contextBridge 实现安全的 IPC 通信，主进程采用 Controller → Service → DB 分层架构。
        </p>
        <div class="mt-4 flex gap-3">
          <button
            class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors"
            @click="showDemo = true"
          >
            打开演示
          </button>
          <button
            class="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            @click="testIPC"
          >
            测试 IPC 通信
          </button>
        </div>
      </div>

      <!-- IPC 测试结果 -->
      <div v-if="ipcResult" class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 class="text-sm font-semibold text-slate-700 mb-3">IPC 测试结果</h3>
        <pre class="bg-slate-900 text-slate-50 p-4 rounded-lg text-xs overflow-auto">{{ JSON.stringify(ipcResult, null, 2) }}</pre>
      </div>

      <!-- 演示面板 -->
      <div v-if="showDemo" class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-slate-800">笔记演示</h3>
          <button
            class="text-slate-400 hover:text-slate-600 transition-colors"
            @click="showDemo = false"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- 添加笔记表单 -->
        <div class="space-y-3 mb-6">
          <input
            v-model="newNote.title"
            type="text"
            placeholder="输入笔记标题..."
            class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
          >
          <textarea
            v-model="newNote.content"
            rows="3"
            placeholder="输入笔记内容..."
            class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm resize-none"
          />
          <div class="flex gap-2">
            <button
              class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              :disabled="!newNote.title || noteLoading"
              @click="addNote"
            >
              {{ noteLoading ? '保存中...' : '添加笔记' }}
            </button>
          </div>
          <p v-if="noteError" class="text-sm text-red-600">{{ noteError }}</p>
        </div>

        <!-- 笔记列表 -->
        <div v-if="notes.length > 0" class="space-y-2">
          <div
            v-for="note in notes"
            :key="note.id"
            class="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-sky-300 transition-colors group"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1 min-w-0">
                <h4 class="text-sm font-medium text-slate-800 truncate">{{ note.title }}</h4>
                <p class="text-xs text-slate-500 mt-1 line-clamp-2">{{ note.content }}</p>
                <p class="text-xs text-slate-400 mt-1">{{ formatDate(note.createdAt) }}</p>
              </div>
              <button
                class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all ml-2 p-1"
                @click="removeNote(note.id)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div v-else class="text-center py-8 text-slate-400 text-sm">
          暂无笔记，添加一条吧
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppLayout from './components/AppLayout.vue';
import { useNoteAPI, useAppAPI } from './composables/useElectronAPI';
import type { Note, NoteInput } from './types';

const { getAllNotes, createNote, deleteNote, loading: noteLoading, error: noteError } = useNoteAPI();
const { getAppInfo } = useAppAPI();

const showDemo = ref(false);
const ipcResult = ref<Record<string, unknown> | null>(null);
const notes = ref<Note[]>([]);
const newNote = ref<NoteInput>({ title: '', content: '' });

async function testIPC() {
  try {
    const info = await getAppInfo();
    ipcResult.value = { appInfo: info };
  } catch (e: any) {
    ipcResult.value = { error: e.message };
  }
}

async function loadNotes() {
  try {
    const result = await getAllNotes(1, 50);
    notes.value = result.data;
  } catch (e) {
    console.error('Failed to load notes:', e);
  }
}

async function addNote() {
  if (!newNote.value.title) return;
  try {
    await createNote(newNote.value);
    newNote.value = { title: '', content: '' };
    await loadNotes();
  } catch (e) {
    console.error('Failed to add note:', e);
  }
}

async function removeNote(id: number) {
  try {
    await deleteNote(id);
    await loadNotes();
  } catch (e) {
    console.error('Failed to delete note:', e);
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN');
}

onMounted(() => {
  loadNotes();
});
</script>
