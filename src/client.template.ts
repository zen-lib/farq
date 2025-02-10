import { Jet, JetFunc } from '../src/Jet.ts';

/* {{types}} */

export interface ClientOptions {
	baseUrl: string;
	updateHeaders?: (headers: HeadersInit) => HeadersInit;
}

export default class MunkClient {
	private jet: JetFunc;

	constructor(options: ClientOptions) {
		const { jet } = new Jet({
			baseUrl: options.baseUrl,
			updateHeaders: options.updateHeaders,
		});

		this.jet = jet;
	}

	/* {{functions}} */
}
