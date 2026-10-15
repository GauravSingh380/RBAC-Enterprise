import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import routes from './routes.js';
import { requestId } from './common/middleware/request-id.middleware.js';
import { httpLogger } from './common/middleware/http-logger.middleware.js';
import { notFoundHandler } from './common/middleware/not-found.middleware.js';
import { errorHandler } from './common/middleware/error.middleware.js';

const app = express();

app.set('trust proxy', 1); // correct req.ip behind a reverse proxy / Vite proxy
app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true, exposedHeaders: ['X-Request-Id'] }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(requestId);
app.use(httpLogger);

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: `Server is running: ${env.port}` });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
