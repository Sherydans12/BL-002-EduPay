import { forwardRef, Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';

@Module({
  imports: [forwardRef(() => MailModule)],
  controllers: [CommunicationsController],
  providers: [CommunicationsService],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
