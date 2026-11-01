import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { Database } from './database';
@Injectable()
export class ContractMaintenance implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(@Inject(Database) private readonly db: Database) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 15000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async tick() {
    if (this.running) return;
    this.running = true;
    const enabled = !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_FROM &&
      process.env.APP_ORIGIN
    );
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(
          "SELECT set_config('convyn.email_enabled',$1,true)",
          String(enabled),
        );
        await tx.$queryRawUnsafe('SELECT marketplace.expire_quotes()');
      });
      if (!enabled) return;
      // A lease makes abandoned work retryable; mail has a stable message id.
      const rows = await this.db.$queryRawUnsafe<
        {
          id: string;
          notification_id: string;
          user_email: string;
          title: string;
          body: string;
          link: string;
        }[]
      >(
        `WITH picked AS (SELECT id FROM marketplace."EmailDelivery" WHERE (status='queued' AND next_attempt_at<=now()) OR (status='processing' AND claimed_at<now()-interval '5 minutes') ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 10), claimed AS (UPDATE marketplace."EmailDelivery" d SET status='processing',claimed_at=now(),attempts=attempts+1 FROM picked WHERE d.id=picked.id RETURNING d.id,d.notification_id) SELECT c.id,c.notification_id,n.user_email,n.title,n.body,n.link FROM claimed c JOIN marketplace."Notification" n ON n.id=c.notification_id`,
      );
      const port = Number(process.env.SMTP_PORT ?? 587),
        transport = createTransport({
          host: process.env.SMTP_HOST,
          port,
          secure: port === 465,
          requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
            : undefined,
          connectionTimeout: 10000,
          socketTimeout: 15000,
        });
      try {
        for (const row of rows) {
          try {
            await transport.sendMail({
              from: process.env.SMTP_FROM,
              to: row.user_email,
              subject: row.title,
              text:
                row.body +
                '\n\n' +
                new URL(row.link, process.env.APP_ORIGIN).toString(),
              messageId: `<convyn-${row.notification_id}@convyn.cloud>`,
            });
            await this.db.$executeRawUnsafe(
              'UPDATE marketplace."EmailDelivery" SET status=\'sent\',sent_at=now() WHERE id=$1::uuid',
              row.id,
            );
          } catch {
            await this.db.$executeRawUnsafe(
              "UPDATE marketplace.\"EmailDelivery\" SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,next_attempt_at=now()+interval '5 minutes' WHERE id=$1::uuid",
              row.id,
            );
          }
        }
      } finally {
        transport.close();
      }
    } catch {
      console.warn(
        'Marketplace maintenance could not run; verify database migrations and delivery configuration.',
      );
    } finally {
      this.running = false;
    }
  }
}
