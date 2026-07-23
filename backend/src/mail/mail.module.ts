import { Module, Global } from '@nestjs/common';
import { CommunicationsModule } from '../communications/communications.module';
import { MailService } from './mail.service';

@Global()
@Module({
  imports: [CommunicationsModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
