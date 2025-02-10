import { Jet, JetFunc } from '../src/Jet.ts';

export namespace types {
	export namespace test {
		export interface GetMeHelloWorldOptions {
			message: string;
		}
		export interface GetMeHelloWorldResponse {
			message: string;
		}
	}
		export namespace test2 {
		export interface GetMeHelloWorldOptions {
			message: string;
		}
		export interface GetMeHelloWorldResponse {
			message: string;
		}
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
			getMeHelloWorld : async (body: types.test.GetMeHelloWorldOptions): Promise<types.test.GetMeHelloWorldResponse> =>
				await this.jet<types.test.GetMeHelloWorldOptions, types.test.GetMeHelloWorldResponse>('/test/getMeHelloWorld', { body }),
	}
	test2 = {
			getMeHelloWorld : async (body: types.test2.GetMeHelloWorldOptions): Promise<types.test2.GetMeHelloWorldResponse> =>
				await this.jet<types.test2.GetMeHelloWorldOptions, types.test2.GetMeHelloWorldResponse>('/test2/getMeHelloWorld', { body }),
	}

}
