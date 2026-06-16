import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  /** Estado de salud del servicio (para sondas/monitoreo). */
  health(): { status: string } {
    return { status: 'ok' };
  }
}
