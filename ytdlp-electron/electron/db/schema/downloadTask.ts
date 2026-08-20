import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

/**
 * 下载任务
 */
@Entity('download_tasks')
@Index('idx_download_tasks_status', ['status'])
@Index('idx_download_tasks_parent', ['parent_id'])
@Index('idx_download_tasks_created', ['created_at'])
export class DownloadTaskEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  parent_id!: string | null;

  @Column({ type: 'text' })
  url!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  title!: string | null;

  @Column({ type: 'text', nullable: true })
  thumbnail!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  extractor!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'video' })
  mode!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  format_id!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  audio_format!: string | null;

  @Column({ type: 'int', default: 0 })
  write_subs!: number;

  @Column({ type: 'int', default: 0 })
  write_auto_subs!: number;

  @Column({ type: 'varchar', length: 256, nullable: true })
  sub_langs!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  proxy!: string | null;

  @Column({ type: 'varchar', length: 24, default: 'queued' })
  status!: string;

  @Column({ type: 'float', default: 0 })
  percent!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  speed!: string | null;

  @Column({ type: 'int', nullable: true })
  eta!: number | null;

  @Column({ type: 'bigint', default: 0 })
  downloaded_bytes!: number;

  @Column({ type: 'bigint', default: 0 })
  total_bytes!: number;

  @Column({ type: 'text', nullable: true })
  error_message!: string | null;

  @Column({ type: 'text', nullable: true })
  output_path!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  filename!: string | null;

  @Column({ type: 'bigint', nullable: true })
  filesize!: number | null;

  @Column({ type: 'text', nullable: true })
  extra_files!: string | null;

  @Column({ type: 'datetime', nullable: true })
  created_at!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  started_at!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  finished_at!: Date | null;
}
