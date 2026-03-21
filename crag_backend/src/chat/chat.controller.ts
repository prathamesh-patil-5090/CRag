import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { AskQuestionDto } from './dto/chat.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @UseGuards(JwtAuthGuard)
  @Post('ask')
  async askQuestion(@Req() req: any, @Body() askQuestionDto: AskQuestionDto) {
    const userId = req.user.id;
    return this.chatService.askQuestion(userId, askQuestionDto);
  }
}
