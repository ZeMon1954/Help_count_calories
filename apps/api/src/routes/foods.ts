import { foodItemParamsSchema, foodSearchSchema } from '../schemas/food.js';
import { FoodRepositoryError } from '../services/food-repository.js';

import type { RouteContext } from './types.js';

export function registerFoodRoutes(context: RouteContext) {
  const { app, foodRepository } = context;

  app.get(
    '/api/foods',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = foodSearchSchema.safeParse(request.query);
      if (!parsed.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid food search parameters',
        });
      try {
        return await foodRepository.searchFoods({
          userId: request.authUser!.id,
          accessToken: request.authToken!,
          ...parsed.data,
        });
      } catch (error) {
        request.log.warn(
          { repositoryError: error instanceof FoodRepositoryError },
          'Unable to search foods',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to search foods',
        });
      }
    },
  );
  app.get(
    '/api/foods/favorites',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      try {
        return {
          items: await foodRepository.getFavoriteFoods({
            accessToken: request.authToken!,
          }),
        };
      } catch {
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to load favorite foods',
        });
      }
    },
  );
  app.get(
    '/api/foods/recent',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      try {
        return {
          items: await foodRepository.getRecentFoods({
            accessToken: request.authToken!,
          }),
        };
      } catch {
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to load recent foods',
        });
      }
    },
  );
  app.put(
    '/api/foods/:id/favorite',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const p = foodItemParamsSchema.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid food ID',
        });
      try {
        await foodRepository.setFavorite({
          userId: request.authUser!.id,
          accessToken: request.authToken!,
          foodId: p.data.id,
          favorite: true,
        });
        return { favorite: true };
      } catch {
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to save favorite',
        });
      }
    },
  );
  app.delete(
    '/api/foods/:id/favorite',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const p = foodItemParamsSchema.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid food ID',
        });
      try {
        await foodRepository.setFavorite({
          userId: request.authUser!.id,
          accessToken: request.authToken!,
          foodId: p.data.id,
          favorite: false,
        });
        return { favorite: false };
      } catch {
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to remove favorite',
        });
      }
    },
  );
}
