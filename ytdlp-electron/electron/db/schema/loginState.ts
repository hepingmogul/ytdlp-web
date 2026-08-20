import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

/**
 * LoginState 模块实体
 */
@Entity('login_states')
@Index('idx_login_states_uid', ['uid'])
@Index('idx_login_states_active', ['active'])
export class LoginState {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar' })
  uid!: string;

  @Column({ type: 'varchar' })
  sign!: string;

  @Column({ type: 'varchar', nullable: true })
  token!: string;

  @Column({ type: 'varchar', nullable: true })
  refresh_token!: string;

  @Column({ type: 'int', default: 0 })
  active!: number;

  @Column({ type: 'int', default: 0 })
  is_deleted!: number;

  @Column({ type: 'datetime', nullable: true })
  created_at!: Date;

  @Column({ type: 'datetime', nullable: true })
  updated_at!: Date;

  @Column({ type: 'datetime', nullable: true })
  deleted_at!: Date;
}
