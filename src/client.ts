import { Jet, JetFunc } from '../src/Jet.ts';

export namespace test {
	export interface GetMeHelloWorldOptions {
		message: string;
	}
	export interface GetMeHelloWorldResponse {
		message: string;
	}
}

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

	test = {
		getMeHelloWorld: async (body: test.GetMeHelloWorldOptions): Promise<test.GetMeHelloWorldResponse> =>
			await this.jet<test.GetMeHelloWorldOptions, test.GetMeHelloWorldResponse>('/test/getMeHelloWorld', { body }),
	};
}
