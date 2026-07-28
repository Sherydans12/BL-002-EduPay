import { Module, Global, forwardRef } from '@nestjs/common';
import { CommunicationsModule } from '../communications/communications.module';
import { MailService } from './mail.service';

@Global()
@Module({
  imports: [forwardRef(() => CommunicationsModule)],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
