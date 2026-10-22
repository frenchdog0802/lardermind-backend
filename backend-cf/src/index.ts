import { Hono } from 'hono';
import type { Env } from './env';
import { corsMiddleware } from './middleware/cors';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { chatRoutes } from './routes/chat';
import { subscriptionRoutes } from './routes/subscription';
import { uploadRoutes } from './routes/upload';
import { mediaRoutes } from './routes/media';
import { pantryRoutes } from './routes/pantry';
import { pantryVisionRoutes } from './routes/pantry-vision';
import { preferencesRoutes } from './routes/preferences';
import { shoppingListRoutes } from './routes/shopping-list';
import { folderRoutes } from './routes/folder';
import { ingredientRoutes } from './routes/ingredient';
import { recipeRoutes } from './routes/recipe';
import { mealPlanRoutes } from './routes/meal-plan';
import { unitConversionRoutes } from './routes/unit-conversions';
import { fail } from './lib/api-response';
import { ErrorCodes } from './lib/error-codes';
import { purgeExpiredGuests } from './db/guests';
import { requestLogMiddleware } from './middleware/request-log';
import { openApiRoutes } from './routes/openapi';

const app = new Hono<{ Bindings: Env; Variables: { requestId: string } }>();

app.use('*', corsMiddleware);
app.use('*', requestLogMiddleware);

app.route('/', healthRoutes);
app.route('/', openApiRoutes);
app.route('/', authRoutes);
app.route('/', chatRoutes);
app.route('/', subscriptionRoutes);
app.route('/', uploadRoutes);
app.route('/', mediaRoutes);
app.route('/', pantryRoutes);
app.route('/', pantryVisionRoutes);
app.route('/', preferencesRoutes);
app.route('/', shoppingListRoutes);
app.route('/', folderRoutes);
app.route('/', ingredientRoutes);
app.route('/', recipeRoutes);
app.route('/', mealPlanRoutes);
app.route('/', unitConversionRoutes);

app.notFound((c) => c.json(fail('Not found', ErrorCodes.NOT_FOUND), 404));

app.onError((err, c) => {
  const requestId = c.get('requestId');
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'unhandled',
      requestId,
      error: err.message || 'Internal server error',
    }),
  );
  return c.json(
    {
      ...fail(err.message || 'Internal server error', ErrorCodes.INTERNAL),
      ...(requestId ? { requestId } : {}),
    },
    500,
  );
});

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await purgeExpiredGuests(env.DB);
  },
};
