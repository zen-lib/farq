"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// .munk/server.ts
var import_http = __toESM(require("http"), 1);

// test/routes/test/getMeHelloWorld.ts
async function getMeHelloWorld(options) {
  return { message: "Hello World" };
}

// test/routes/test2/getMeHelloWorld.ts
async function getMeHelloWorld2(options) {
  return { message: "Hello World from test2" };
}

// .munk/server.ts
try {
  const routes = {
    "/test/getMeHelloWorld": getMeHelloWorld,
    "/test2/getMeHelloWorld": getMeHelloWorld2
  };
  const server = import_http.default.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    console.log(req.url);
    if (!req.url) {
      res.statusCode = 400;
      res.end(JSON.stringify({ message: "Bad request" }));
      return;
    }
    let route = routes[req.url];
    if (route) {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const jsonBody = body ? JSON.parse(body) : {};
          const result = await route(jsonBody);
          res.end(JSON.stringify(result));
        } catch (error) {
          console.error("Error processing request:", error);
          res.statusCode = 500;
          res.end(JSON.stringify({ message: "Internal Server Error" }));
        }
      });
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: "Not found" }));
    }
  });
  server.listen(5003);
  console.log("Server running on port 5003");
} catch (e) {
  console.error(e);
}
