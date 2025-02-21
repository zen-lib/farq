import munk from './munk.ts';

munk({ dir: process.argv[2] || './test/routes', outDir: process.argv[3] || './dist' }).catch((err) => {
	console.error(err);
	process.exit(1);
});
