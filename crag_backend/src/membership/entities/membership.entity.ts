import { Organization } from 'src/organization/entities/organization.entity';
import { User } from 'src/users/entities/user.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

export enum OrgRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  HR = 'HR',
  MEMBER = 'MEMBER',
}

@Entity('memberships')
export class Memberships {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.memberships, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Organization, (org) => org.memberships, {
    onDelete: 'CASCADE',
  })
  organization: Organization;

  @Column({
    type: 'enum',
    enum: OrgRole,
    default: OrgRole.MEMBER,
  })
  role: OrgRole;
}
