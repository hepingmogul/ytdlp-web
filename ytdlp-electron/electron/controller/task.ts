/**
 * Task Controller - 下载任务
 */

import type { CreateTaskInput } from '~/electron/shared/types';
import { taskService } from '~/electron/service/task';
import { errorResponse } from '~/electron/utils';

export class TaskController {
  list(data?: { includeChildren?: boolean }) {
    return taskService.list(Boolean(data?.includeChildren));
  }

  get(data: { id: string }) {
    return taskService.get(data.id);
  }

  create(data: CreateTaskInput) {
    if (!data?.url?.trim()) {
      return errorResponse('请输入视频链接');
    }
    if (data.entries && data.entries.length === 0) {
      return errorResponse('请至少勾选一条节目');
    }
    return taskService.create({
      ...data,
      url: data.url.trim(),
    });
  }

  children(data: { id: string }) {
    return taskService.children(data.id);
  }

  cancel(data: { id: string }) {
    return taskService.cancel(data.id);
  }

  retry(data: { id: string }) {
    return taskService.retry(data.id);
  }

  delete(data: { id: string }) {
    return taskService.delete(data.id);
  }

  openFolder(data: { id: string }) {
    return taskService.openFolder(data.id);
  }

  revealFile(data: { id: string }) {
    return taskService.revealFile(data.id);
  }
}

(TaskController as any).toString = () => '[class TaskController]';
