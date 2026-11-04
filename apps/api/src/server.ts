import http from 'http';
import { app } from './app';
import { config } from './config/env';
import { RealtimeService } from './services/realtime';

import { initDonorRegistrationSchema } from './lib/initDonorRegistrationSchema';
import { initDonorLocationSchema } from './lib/initDonorLocationSchema';

const server = http.createServer(app);

// Initialize database schema extensions if needed
initDonorRegistrationSchema().catch((err) => {
  console.error('[RaktaSetu API] Failed to initialize donor registration schema:', err);
});

initDonorLocationSchema().catch((err) => {
  console.error('[RaktaSetu API] Failed to initialize donor location schema:', err);
});

// Attach Realtime WebSocket service
RealtimeService.init(server);

server.listen(config.port, () => {
  console.log(`[RaktaSetu API] Server running on http://localhost:${config.port}`);
  console.log(`[RaktaSetu API] WebSocket server listening on ws://localhost:${config.port}/ws`);
  console.log(`[RaktaSetu API] Environment: ${config.nodeEnv}`);
});

const handleShutdown = async (signal: string) => {
  console.log(`[RaktaSetu API] ${signal} received. Shutting down gracefully.`);
  await RealtimeService.shutdown();
  server.close(() => {
    console.log('[RaktaSetu API] HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('[RaktaSetu API] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err: Error) => {
  console.error('[RaktaSetu API] Uncaught Exception:', err);
});

