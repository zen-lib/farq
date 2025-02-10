export interface JetConfig {
	baseUrl: string;
	updateHeaders?: (headers: HeadersInit) => HeadersInit;
}

export type JetFunc = <ResponseType, BodyType = unknown, QueryType = unknown>(
	slug: string,
	request?: JetRequest<BodyType, QueryType>
) => Promise<ResponseType>;

interface JetRequest<BodyType = unknown, QueryType = unknown> {
	body?: BodyType;
	query?: QueryType;
	headers?: HeadersInit;
	method?: string;
}

export class Jet {
	private config: JetConfig;

	constructor(config: JetConfig) {
		this.config = config;
	}

	jet: JetFunc = async <ResponseType, BodyType = unknown, QueryType = unknown>(
		slug: string,
		request?: JetRequest<BodyType, QueryType>
	) => {
		const headers = new Headers(request?.headers || {});
		if (this.config.updateHeaders) {
			this.config.updateHeaders(headers);
		}
		const append = request?.query && Object.keys(request.query).length ? `?${serializeQuery(request.query)}` : '';
		const body = request?.body && JSON.stringify(request.body);
		if (body) {
			headers.set('Content-Type', 'application/json');
		}
		const res = await fetch(`${this.config.baseUrl}${slug}${append}`, {
			headers,
			method: request?.method || 'POST',
			body,
		});
		const json = await res.json();
		if (!(res.status >= 200 && res.status < 300)) {
			throw { status: res.status, response: json };
		}
		return json as ResponseType;
	};
}

export const serializeQuery = (obj: { [key: string]: string }) =>
	Object.keys(obj)
		.reduce((parts: string[], key) => {
			parts.push(`${key}=${encodeURIComponent(obj[key])}`);
			return parts;
		}, [])
		.join('&');
