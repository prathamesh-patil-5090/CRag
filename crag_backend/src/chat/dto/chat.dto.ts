import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class AskQuestionDto {
  @IsNotEmpty()
  @IsUUID()
  orgId: string;

  @IsNotEmpty()
  @IsString()
  question: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
