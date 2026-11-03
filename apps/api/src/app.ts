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
import { errorHandler } from './middleware/errorHandler';

export const app = express();

app.use(
  cors({
    origin: config.webOrigin,
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
app.use('/api/v1', hospitalRouter);

// Root health alias
app.use('/', healthRouter);

app.use(errorHandler);
