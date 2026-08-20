/**
 * Category Service - 分类 CRUD
 */

import { getDatabase } from '~/electron/db/sqlite';
import { successResponse, errorResponse, getTimestamp } from '~/electron/utils';
import { DB } from '~/electron/shared/constant';
import type { Category, CategoryInput, ServiceResponse, QueryResult } from '~/electron/types';

export class CategoryService {
  getAll(): ServiceResponse<QueryResult<Category>> {
    try {
      const db = getDatabase();
      const stmt = db.prepare(
        `SELECT id, name, color, created_at as createdAt, updated_at as updatedAt FROM ${DB.TABLE.CATEGORIES} ORDER BY name`,
      );
      const data = stmt.all() as Category[];

      return successResponse({ data, total: data.length });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  create(input: CategoryInput): ServiceResponse<Category> {
    try {
      const db = getDatabase();
      const stmt = db.prepare(
        `INSERT INTO ${DB.TABLE.CATEGORIES} (name, color, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      );
      const ts = getTimestamp();
      const result = stmt.run(input.name, input.color || null, ts, ts);

      const id = Number(result.lastInsertRowid);
      const getStmt = db.prepare(
        `SELECT id, name, color, created_at as createdAt, updated_at as updatedAt FROM ${DB.TABLE.CATEGORIES} WHERE id = ?`,
      );
      const category = getStmt.get(id) as Category;

      return successResponse(category);
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  delete(id: number): ServiceResponse<{ deleted: boolean }> {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`DELETE FROM ${DB.TABLE.CATEGORIES} WHERE id = ?`);
      const result = stmt.run(id);

      return successResponse({ deleted: result.changes > 0 });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
}

export const categoryService = new CategoryService();
