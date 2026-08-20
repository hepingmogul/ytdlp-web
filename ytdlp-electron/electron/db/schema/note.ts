import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

/**
 * Note 模块实体
 */
@Entity('notes')
@Index('idx_notes_category', ['category'])
@Index('idx_notes_created', ['created_at'])
export class Note {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'text', default: '' })
  content!: string;

  @Column({ type: 'varchar', nullable: true })
  category!: string;

  @Column({ type: 'datetime', nullable: true })
  created_at!: Date;

  @Column({ type: 'datetime', nullable: true })
  updated_at!: Date;
}
