/**
 * LoginState Service - 用户登录状态管理
 */

import { getDatabase } from '~/electron/db/sqlite';
import { successResponse, errorResponse, getTimestamp } from '~/electron/utils';
import type { LoginState, LoginStateInput, ServiceResponse } from '~/electron/types';

const TABLE = 'login_states';

/** 从数据库行映射到 LoginState 实体 */
function mapRow(row: Record<string, unknown>): LoginState {
  return {
    id: row.id as number,
    name: row.name as string,
    uid: row.uid as string,
    sign: row.sign as string,
    token: (row.token as string) ?? undefined,
    refreshToken: (row.refresh_token as string) ?? undefined,
    active: row.active as number,
    isDeleted: row.is_deleted as number,
    deletedAt: (row.deleted_at as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const SELECT_FIELDS =
  'id, name, uid, sign, token, refresh_token, active, is_deleted, created_at, updated_at, deleted_at';

export class LoginStateService {
  /**
   * 登录：将所有已激活记录设为未激活，再根据 uid 查询或插入新记录并激活
   */
  login(input: LoginStateInput): ServiceResponse<LoginState> {
    try {
      const db = getDatabase();
      const ts = getTimestamp();

      // 将所有激活记录设为未激活
      db.prepare(
        `UPDATE ${TABLE} SET active = 0, updated_at = ? WHERE active = 1`,
      ).run(ts);

      // 查询是否已存在该 uid 的记录（未删除）
      const existing = db
        .prepare(`SELECT ${SELECT_FIELDS} FROM ${TABLE} WHERE uid = ? AND is_deleted = 0`)
        .get(input.uid) as Record<string, unknown> | undefined;

      if (existing) {
        // 更新已有记录并激活
        db.prepare(
          `UPDATE ${TABLE} SET name = ?, sign = ?, token = ?, refresh_token = ?, active = 1, updated_at = ? WHERE id = ?`,
        ).run(
          input.name,
          input.sign,
          input.token ?? null,
          input.refreshToken ?? null,
          ts,
          existing.id,
        );
        const updated = db
          .prepare(`SELECT ${SELECT_FIELDS} FROM ${TABLE} WHERE id = ?`)
          .get(existing.id) as Record<string, unknown>;
        return successResponse(mapRow(updated));
      }

      // 插入新记录
      const result = db.prepare(
        `INSERT INTO ${TABLE} (name, uid, sign, token, refresh_token, active, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      ).run(input.name, input.uid, input.sign, input.token ?? null, input.refreshToken ?? null, ts, ts);

      const inserted = db
        .prepare(`SELECT ${SELECT_FIELDS} FROM ${TABLE} WHERE id = ?`)
        .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
      return successResponse(mapRow(inserted));
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  /**
   * 退出登录：将匹配 uid 且激活的记录设为未激活
   */
  logout(uid: string): ServiceResponse<{ success: boolean }> {
    try {
      const db = getDatabase();
      const ts = getTimestamp();
      const result = db
        .prepare(`UPDATE ${TABLE} SET active = 0, updated_at = ? WHERE uid = ? AND active = 1`)
        .run(ts, uid);
      return successResponse({ success: result.changes > 0 });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  /**
   * 根据 uid 查询登录信息（未删除）
   */
  getByUid(uid: string): ServiceResponse<LoginState> {
    try {
      const db = getDatabase();
      const row = db
        .prepare(`SELECT ${SELECT_FIELDS} FROM ${TABLE} WHERE uid = ? AND is_deleted = 0`)
        .get(uid) as Record<string, unknown> | undefined;

      if (!row) {
        return errorResponse('Login state not found');
      }
      return successResponse(mapRow(row));
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  /**
   * 查询当前激活的账号
   */
  getActive(): ServiceResponse<LoginState> {
    try {
      const db = getDatabase();
      const row = db
        .prepare(`SELECT ${SELECT_FIELDS} FROM ${TABLE} WHERE active = 1 AND is_deleted = 0`)
        .get() as Record<string, unknown> | undefined;

      if (!row) {
        return errorResponse('No active login');
      }
      return successResponse(mapRow(row));
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  /**
   * 软删除：设置 is_deleted = 1 和 deleted_at
   */
  delete(id: number): ServiceResponse<{ deleted: boolean }> {
    try {
      const db = getDatabase();
      const ts = getTimestamp();
      const result = db
        .prepare(
          `UPDATE ${TABLE} SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?`,
        )
        .run(ts, ts, id);
      return successResponse({ deleted: result.changes > 0 });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  /**
   * 查询所有未删除的登录信息
   */
  getAll(): ServiceResponse<LoginState[]> {
    try {
      const db = getDatabase();
      const rows = db
        .prepare(
          `SELECT ${SELECT_FIELDS} FROM ${TABLE} WHERE is_deleted = 0 ORDER BY updated_at DESC`,
        )
        .all() as Record<string, unknown>[];
      return successResponse(rows.map(mapRow));
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
}

export const loginStateService = new LoginStateService();
