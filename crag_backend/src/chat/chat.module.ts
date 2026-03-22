import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipModule } from 'src/membership/membership.module';
import { Document } from '../documents/entities/document.entity';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatMessage } from './dto/chat-message.entity';
import { ChatSession } from './dto/chat-session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, ChatSession, ChatMessage]),
    MembershipModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
