import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
/* {{imports}} */

const app = Fastify();
app.register(fastifyWebsocket);
app.register(routes);
app.listen({ host: '127.0.0.1', port: 7000 });

function routes(app: FastifyInstance) {
	app.get('/', async () => {
		return { message: 'Munk server is running' };
	});
	/* {{routes}} */
}
