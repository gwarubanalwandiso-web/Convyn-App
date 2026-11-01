import 'reflect-metadata';
import { createApp } from './app';
// Prisma BigInt values are serialized as decimal strings to preserve precision.
Object.defineProperty(BigInt.prototype, 'toJSON', {
  value: function (this: bigint) {
    return this.toString();
  },
});
async function bootstrap() {
  const app = await createApp();
  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}
bootstrap().catch(() => {
  console.error('API startup failed');
  process.exitCode = 1;
});
