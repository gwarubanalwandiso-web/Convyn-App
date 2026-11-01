import {
  Controller,
  Get,
  Inject,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Database } from './database';
import { AuthController, SessionGuard } from './auth';
import { MarketplaceController } from './marketplace';
import { OperationsController } from './operations';
import { OrganisationsController } from './organisations';
import { LocationRetention } from './retention';
import { DatabaseErrorFilter } from './errors';
import { IntelligenceController } from './intelligence';
@Controller('v1')
class HealthController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get('health') health() {
    return { status: 'ok', service: 'convyn-api' };
  }
  @Get('ready') async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
  controllers: [
    HealthController,
    AuthController,
    MarketplaceController,
    OperationsController,
    OrganisationsController,
    IntelligenceController,
  ],
  providers: [
    Database,
    SessionGuard,
    LocationRetention,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();
  app.useGlobalFilters(new DatabaseErrorFilter());
  app.enableCors({
    origin: (
      process.env.WEB_ORIGINS ??
      'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004'
    ).split(','),
    credentials: true,
  });
  app.use(
    (
      _req: unknown,
      res: { setHeader: (key: string, value: string) => void },
      next: () => void,
    ) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    },
  );
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('CONVYN marketplace API')
        .addBearerAuth()
        .setVersion('0.2')
        .build(),
    ),
  );
  return app;
}
