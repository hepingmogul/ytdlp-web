/**
 * SQLite 数据库连接管理和表结构初始化
 * 使用 TypeORM DataSource 和 better-sqlite3
 */

import { DataSource } from 'typeorm';
import type Database from 'better-sqlite3';
import { getDbPath } from '~/electron/utils';
import { logger } from '~/electron/utils/logger';
import { Entities } from '~/electron/db/schema';

let dataSource: DataSource | null = null;
let dbInstance: Database.Database | null = null;
let initPromise: Promise<DataSource> | null = null;

/**
 * 初始化数据库连接并同步表结构
 */
export async function initDatabase(): Promise<DataSource> {
  if (dataSource && dataSource.isInitialized) {
    return dataSource;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const dbPath = getDbPath();
      logger.info(`[DB] Initializing TypeORM DataSource with path: ${dbPath}`);

      dataSource = new DataSource({
        type: 'better-sqlite3',
        database: dbPath,
        entities: Entities,
        synchronize: true,
        logging: false,
      });

      await dataSource.initialize();

      // 获取底层 better-sqlite3 实例并开启 WAL 模式
      dbInstance = (dataSource.driver as any).databaseConnection as Database.Database;
      if (dbInstance && typeof dbInstance.pragma === 'function') {
        dbInstance.pragma('journal_mode = WAL');
      }

      logger.info(`[DB] Database initialized successfully with ${Entities.length} entities at: ${dbPath}`);
      return dataSource;
    } catch (error) {
      logger.error('[DB] Database initialization failed:', error);
      initPromise = null;
      dataSource = null;
      dbInstance = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * 获取 TypeORM DataSource 实例
 */
export function getDataSource(): DataSource {
  if (!dataSource || !dataSource.isInitialized) {
    throw new Error('Database DataSource not initialized. Call initDatabase() first.');
  }
  return dataSource;
}

/**
 * 获取底层 better-sqlite3 数据库实例（单例）
 */
export function getDatabase(): Database.Database {
  if (!dbInstance) {
    if (dataSource && dataSource.isInitialized) {
      dbInstance = (dataSource.driver as any).databaseConnection as Database.Database;
    }
  }
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase(): Promise<void> {
  if (dataSource && dataSource.isInitialized) {
    await dataSource.destroy();
    dataSource = null;
    dbInstance = null;
    initPromise = null;
    logger.info('[DB] Database connection closed.');
  }
}

/**
 * 检查数据库连接状态
 */
export function isDbConnected(): boolean {
  return dataSource !== null && dataSource.isInitialized;
}

