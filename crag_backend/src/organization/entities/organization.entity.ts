import { Memberships } from 'src/membership/entities/membership.entity';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity('org')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  orgId: string;

  @Column({ nullable: true })
  orgName: string;

  @Column({ unique: true })
  orgMail: string;

  @Column({ nullable: true })
  password: string;

  @Column({ type: 'varchar', nullable: true, select: false })
  hashedRefreshToken: string | null;

  @OneToMany(() => Memberships, (memberships) => memberships.organization)
  memberships: Memberships[];
}
