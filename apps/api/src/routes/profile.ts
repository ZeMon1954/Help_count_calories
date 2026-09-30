import { onboardingSchema, profileUpdateSchema } from '../schemas/profile.js';
import { isProfileRepositoryError } from '../services/profile-repository.js';

import type { RouteContext } from './types.js';

export function registerProfileRoutes(context: RouteContext) {
  const { app, profileRepository } = context;

  app.get(
    '/api/me',
    { preHandler: app.verifySupabaseJwt },
    async (request) => ({
      id: request.authUser!.id,
      email: request.authUser!.email,
    }),
  );

  app.get(
    '/api/profile',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      try {
        return await profileRepository.getProfile(
          request.authUser!.id,
          request.authToken!,
        );
      } catch (error) {
        request.log.warn(
          { repositoryError: isProfileRepositoryError(error) },
          'Unable to load profile',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to load profile',
        });
      }
    },
  );

  app.put(
    '/api/onboarding',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = onboardingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid onboarding data',
        });
      }

      try {
        const saved = await profileRepository.completeOnboarding(
          request.authUser!.id,
          request.authToken!,
          parsed.data,
        );
        return reply.send(saved);
      } catch (error) {
        request.log.warn(
          { repositoryError: isProfileRepositoryError(error) },
          'Unable to complete onboarding',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to complete onboarding',
        });
      }
    },
  );

  app.put(
    '/api/profile',
    { preHandler: app.verifySupabaseJwt },
    async (request, reply) => {
      const parsed = profileUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid profile data',
        });
      }

      try {
        return await profileRepository.updateProfile(
          request.authUser!.id,
          request.authToken!,
          parsed.data,
        );
      } catch (error) {
        request.log.warn(
          { repositoryError: isProfileRepositoryError(error) },
          'Unable to update profile',
        );
        return reply.code(502).send({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Unable to update profile',
        });
      }
    },
  );
}
