import { Worker } from 'bullmq';
const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const worker = new Worker(
  'notifications',
  async () => {
    throw new Error('Notification delivery adapter not configured');
  },
  {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
    },
    concurrency: 4,
  },
);
worker.on('failed', (job) =>
  console.error(
    JSON.stringify({ event: 'notification_failed', jobId: job?.id }),
  ),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    void worker.close();
  });
