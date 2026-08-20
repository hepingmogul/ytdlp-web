/**
 * Note Service - 笔记 CRUD
 */

import { getDatabase } from '~/electron/db/sqlite';
import { successResponse, errorResponse, getTimestamp } from '~/electron/utils';
import { DB, PAGINATION } from '~/electron/shared/constant';
import type { Note, NoteInput, NoteUpdateInput, ServiceResponse, QueryResult } from '~/electron/types';

export class NoteService {
  getAll(
    page: number = PAGINATION.DEFAULT_PAGE,
    pageSize: number = PAGINATION.DEFAULT_PAGE_SIZE,
  ): ServiceResponse<QueryResult<Note>> {
    try {
      const db = getDatabase();
      const offset = (page - 1) * pageSize;

      const countStmt = db.prepare(`SELECT COUNT(*) as total FROM ${DB.TABLE.NOTES}`);
      const { total } = countStmt.get() as { total: number };

      const stmt = db.prepare(
        `SELECT id, title, content, category, created_at as createdAt, updated_at as updatedAt FROM ${DB.TABLE.NOTES} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      );
      const data = stmt.all(pageSize, offset) as Note[];

      return successResponse({ data, total });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  getById(id: number): ServiceResponse<Note> {
    try {
      const db = getDatabase();
      const stmt = db.prepare(
        `SELECT id, title, content, category, created_at as createdAt, updated_at as updatedAt FROM ${DB.TABLE.NOTES} WHERE id = ?`,
      );
      const note = stmt.get(id) as Note | undefined;

      if (!note) {
        return errorResponse('Note not found');
      }
      return successResponse(note);
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  create(input: NoteInput): ServiceResponse<Note> {
    try {
      const db = getDatabase();
      const stmt = db.prepare(
        `INSERT INTO ${DB.TABLE.NOTES} (title, content, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      );
      const ts = getTimestamp();
      const result = stmt.run(input.title, input.content, input.category || null, ts, ts);

      return this.getById(Number(result.lastInsertRowid));
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  update(input: NoteUpdateInput): ServiceResponse<Note> {
    try {
      const db = getDatabase();
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.title !== undefined) {
        fields.push('title = ?');
        values.push(input.title);
      }
      if (input.content !== undefined) {
        fields.push('content = ?');
        values.push(input.content);
      }
      if (input.category !== undefined) {
        fields.push('category = ?');
        values.push(input.category);
      }

      if (fields.length === 0) {
        return errorResponse('No fields to update');
      }

      fields.push('updated_at = ?');
      values.push(getTimestamp());
      values.push(input.id);

      const stmt = db.prepare(`UPDATE ${DB.TABLE.NOTES} SET ${fields.join(', ')} WHERE id = ?`);
      stmt.run(...values);

      return this.getById(input.id);
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  delete(id: number): ServiceResponse<{ deleted: boolean }> {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`DELETE FROM ${DB.TABLE.NOTES} WHERE id = ?`);
      const result = stmt.run(id);

      return successResponse({ deleted: result.changes > 0 });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  queryByCategory(category: string): ServiceResponse<QueryResult<Note>> {
    try {
      const db = getDatabase();
      const stmt = db.prepare(
        `SELECT id, title, content, category, created_at as createdAt, updated_at as updatedAt FROM ${DB.TABLE.NOTES} WHERE category = ? ORDER BY updated_at DESC`,
      );
      const data = stmt.all(category) as Note[];

      return successResponse({ data, total: data.length });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
}

export const noteService = new NoteService();
