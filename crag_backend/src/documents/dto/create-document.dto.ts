import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateDocumentDto {
  @IsUUID()
  @IsNotEmpty()
  orgId: string;
}
