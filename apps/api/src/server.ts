import http from 'http';
import { app } from './app';
import { config } from './config/env';
import { RealtimeService } from './services/realtime';

const server = http.createServer(app);

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
