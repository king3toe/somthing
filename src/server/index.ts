import Fastify from 'fastify';
import dotenv from 'dotenv';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { initDb } from '../db';
import routerRoutes from './router';
import apiRoutes from './api';
import open from 'open';

dotenv.config();

const fastify = Fastify({
  logger: true
});

// Serve static files for the dashboard
fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../../src/public'),
  prefix: '/',
});

fastify.get('/ping', async (request, reply) => {
  return { pong: 'it worked!' }
});

fastify.register(routerRoutes);
fastify.register(apiRoutes);

const start = async () => {
  try {
    initDb();
    const port = parseInt(process.env.PORT || '3000', 10);
    await fastify.listen({ port, host: '127.0.0.1' });
    fastify.log.info(`Server listening on ${port}`);

    // Auto-open dashboard (don't fail if in headless environment)
    if (process.env.NODE_ENV !== 'test') {
      try {
        await open(`http://localhost:${port}`);
      } catch (e) {
        fastify.log.info(`Could not auto-open browser, but server is running at http://localhost:${port}`);
      }
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
