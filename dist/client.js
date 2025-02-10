// src/Jet.ts
var Jet = class {
  config;
  constructor(config) {
    this.config = config;
  }
  jet = async (slug, request) => {
    const headers = new Headers(request?.headers || {});
    if (this.config.updateHeaders) {
      this.config.updateHeaders(headers);
    }
    const append = request?.query && Object.keys(request.query).length ? `?${serializeQuery(request.query)}` : "";
    const body = request?.body && JSON.stringify(request.body);
    if (body) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(`${this.config.baseUrl}${slug}${append}`, {
      headers,
      method: request?.method || "POST",
      body
    });
    const json = await res.json();
    if (!(res.status >= 200 && res.status < 300)) {
      throw { status: res.status, response: json };
    }
    return json;
  };
};
var serializeQuery = (obj) => Object.keys(obj).reduce((parts, key) => {
  parts.push(`${key}=${encodeURIComponent(obj[key])}`);
  return parts;
}, []).join("&");

// .munk/client.ts
var MunkClient = class {
  jet;
  constructor(options) {
    const { jet } = new Jet({
      baseUrl: options.baseUrl,
      updateHeaders: options.updateHeaders
    });
    this.jet = jet;
  }
  test = {
    getMeHelloWorld: async (body) => await this.jet("/test/getMeHelloWorld", { body })
  };
  test2 = {
    getMeHelloWorld: async (body) => await this.jet("/test2/getMeHelloWorld", { body })
  };
};
export {
  MunkClient as default
};
