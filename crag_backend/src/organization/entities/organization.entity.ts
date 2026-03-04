import { Memberships } from 'src/users/entities/membership.entity';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity('org')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  orgId: string;

  @Column({ nullable: true })
  orgName: string;

  @Column({ unique: true })
  orgMail: string;

  @OneToMany(() => Memberships, (memberships) => memberships.organization)
  memberships: Memberships[];
}
