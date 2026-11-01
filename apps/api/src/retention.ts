import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Database } from './database';
@Injectable()
export class LocationRetention implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly logger = new Logger(LocationRetention.name);
  constructor(@Inject(Database) private readonly db: Database) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.db.locationEvent
        .deleteMany({ where: { expiresAt: { lt: new Date() } } })
        .catch(() => this.logger.error('Expired location cleanup failed'));
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
