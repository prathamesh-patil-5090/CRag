import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  role: 'user' | 'assistant';

  @Column('text')
  content: string;

  @ManyToOne(() => ChatSession, (session) => session.messages, {
    onDelete: 'CASCADE',
  })
  session: ChatSession;

  @CreateDateColumn()
  createdAt: Date;
}
