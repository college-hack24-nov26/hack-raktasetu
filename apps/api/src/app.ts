import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import { healthRouter } from './routes/health';
import { bloodCentresRouter } from './routes/bloodCentres';
import { availabilityRouter } from './routes/availability';
import { requestsRouter } from './routes/requests';
import { authRouter } from './routes/auth';
import { donorsRouter } from './routes/donors';
import { profileRouter } from './routes/profile';
import { webhooksRouter } from './routes/webhooks';
import { organisationsRouter } from './routes/organisations';
import { traceabilityRouter } from './routes/traceability';
import { handoverRouter } from './routes/handover';
import { processingRouter } from './routes/processing';
import { inventoryRouter } from './routes/inventory';
import { realtimeRouter } from './routes/realtime';
import { patientSearchRouter } from './routes/patientSearch';
import { hospitalRouter } from './routes/hospital';
import { donorRegistrationRouter } from './routes/donorRegistration';
import { donorLocationRouter } from './routes/donorLocation';
import { adminMatchingRouter } from './routes/adminMatching';
import { errorHandler } from './middleware/errorHandler';

export const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        origin === config.webOrigin ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        config.nodeEnv !== 'production'
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// API v1 routes
app.use('/api/v1', healthRouter);
app.use('/api/v1', bloodCentresRouter);
app.use('/api/v1', availabilityRouter);
app.use('/api/v1', requestsRouter);
app.use('/api/v1', authRouter);
app.use('/api/v1', donorsRouter);
app.use('/api/v1', profileRouter);
app.use('/api/v1', webhooksRouter);
app.use('/api/v1', organisationsRouter);
app.use('/api/v1', traceabilityRouter);
app.use('/api/v1', handoverRouter);
app.use('/api/v1', processingRouter);
app.use('/api/v1', inventoryRouter);
app.use('/api/v1', realtimeRouter);
app.use('/api/v1', patientSearchRouter);
app.use('/api/v1', donorRegistrationRouter);
app.use('/api/v1', donorLocationRouter);
app.use('/api/v1', hospitalRouter);
app.use('/api/v1', adminMatchingRouter);

// Root health alias
app.use('/', healthRouter);

// Catch unhandled routes and respond with strict JSON 404 (prevents default HTML 404)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `API endpoint not found: ${req.method} ${req.originalUrl || req.url}`,
    },
  });
});

app.use(errorHandler);
