// .munk/server.ts
import http from "http";

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
  const server = http.createServer((req, res) => {
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
