import { IsUUID } from 'class-validator';

export class RetryCommunicationParamsDto {
  @IsUUID()
  id!: string;
}
