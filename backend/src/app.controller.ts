import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  root() {
    return {
      ok: true,
      service: 'EduPay API',
      docs: '/api/docs',
    };
  }
}
