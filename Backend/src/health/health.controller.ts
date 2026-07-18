import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'krishecarbon-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
