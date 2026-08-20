/**
 * Note Controller - 笔记 CRUD
 */

import { noteService } from '~/electron/service/note';
import type { NoteInput, NoteUpdateInput } from '~/electron/types';

export class NoteController {
  getAll(data?: { page?: number; pageSize?: number }) {
    return noteService.getAll(data?.page, data?.pageSize);
  }

  getById(data: { id: number }) {
    return noteService.getById(data.id);
  }

  create(data: NoteInput) {
    return noteService.create(data);
  }

  update(data: NoteUpdateInput) {
    return noteService.update(data);
  }

  delete(data: { id: number }) {
    return noteService.delete(data.id);
  }

  queryByCategory(data: { category: string }) {
    return noteService.queryByCategory(data.category);
  }
}

(NoteController as any).toString = () => '[class NoteController]';
