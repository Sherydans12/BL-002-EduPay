import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { CommunicationActionsController } from './communication-actions.controller';
import { CommunicationActionsService } from './communication-actions.service';

@Module({
  imports: [MailModule],
  controllers: [CommunicationActionsController],
  providers: [CommunicationActionsService],
})
export class CommunicationActionsModule {}
