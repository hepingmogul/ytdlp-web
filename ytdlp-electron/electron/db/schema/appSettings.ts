import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * 应用设置（单行，id 固定为 1）
 */
@Entity('app_settings')
export class AppSettingsEntity {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'text' })
  download_dir!: string;

  @Column({ type: 'text', nullable: true })
  cookies_path!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  proxy!: string | null;

  @Column({ type: 'int', default: 2 })
  max_concurrent!: number;

  @Column({ type: 'varchar', length: 128, default: 'bv*+ba/b' })
  default_format!: string;

  @Column({ type: 'datetime', nullable: true })
  updated_at!: Date | null;
}
