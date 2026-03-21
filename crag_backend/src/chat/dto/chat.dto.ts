import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class AskQuestionDto {
  @IsNotEmpty()
  @IsUUID()
  orgId: string;

  @IsNotEmpty()
  @IsString()
  question: string;
}
