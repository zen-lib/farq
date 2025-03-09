import munk from './munk.ts';

munk({ dir: process.argv[2] || './test/routes' }).catch((err) => {
	console.error(err);
	process.exit(1);
});
