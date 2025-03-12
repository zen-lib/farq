import easyRpc from 'easy-rpc';

async function main() {
	console.log('Easy RPC Demo');

	// Example configuration for easyRpc
	await easyRpc({
		entryDir: './src/api',
		endpointPathPrefix: '/api',
		indent: '  ',
		router: {
			outPath: './src/generated/rpcRouter.ts',
		},
		client: {
			clientName: 'ApiClient',
			outDir: './src/generated/client/',
		},
	});

	console.log('RPC client and router generated successfully!');
}

main().catch(console.error);
