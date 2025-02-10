"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// .munk/client.ts
var client_exports = {};
__export(client_exports, {
  default: () => MunkClient
});
module.exports = __toCommonJS(client_exports);

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
