import {
  BadRequestException,
  Body,
  Controller,
  Get,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { PaginateQuery } from 'nestjs-paginate';
import { Paginate } from 'nestjs-paginate';
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

  @UseGuards(JwtAuthGuard)
  @Get()
  getAllQuestionsFromSession(
    @Req() req: Request & { user: { id?: string; sub?: string } },
    @Query('orgId', new ParseUUIDPipe()) orgId: string,
    @Query('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Paginate() query: PaginateQuery,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    if (!userId) {
      throw new BadRequestException('Invalid User');
    }
    return this.chatService.previousConvoFromSession(
      userId,
      orgId,
      sessionId,
      query,
    );
  }
}
