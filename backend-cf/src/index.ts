import { Hono } from 'hono';
import type { Env } from './env';
import { corsMiddleware } from './middleware/cors';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { chatRoutes } from './routes/chat';
import { subscriptionRoutes } from './routes/subscription';
import { fail } from './lib/api-response';

const app = new Hono<{ Bindings: Env }>();

app.use('*', corsMiddleware);

app.route('/', healthRoutes);
app.route('/', authRoutes);
app.route('/', chatRoutes);
app.route('/', subscriptionRoutes);

app.notFound((c) => c.json(fail('Not found'), 404));

app.onError((err, c) => {
  console.error(err);
  return c.json(fail(err.message || 'Internal server error'), 500);
});

export default app;
