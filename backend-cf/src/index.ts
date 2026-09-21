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
import { fail } from './lib/api-response';

const app = new Hono<{ Bindings: Env }>();

app.use('*', corsMiddleware);

app.route('/', healthRoutes);
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

app.notFound((c) => c.json(fail('Not found'), 404));

app.onError((err, c) => {
  console.error(err);
  return c.json(fail(err.message || 'Internal server error'), 500);
});

export default app;
