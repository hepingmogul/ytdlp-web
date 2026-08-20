import { createRouter, createWebHashHistory } from 'vue-router';
import WorkbenchPage from './pages/WorkbenchPage.vue';
import TasksPage from './pages/TasksPage.vue';
import SettingsPage from './pages/SettingsPage.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'workbench', component: WorkbenchPage },
    { path: '/tasks', name: 'tasks', component: TasksPage },
    { path: '/settings', name: 'settings', component: SettingsPage },
  ],
});
