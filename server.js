const http = require("http");
const Gun = require("gun");

const port = process.env.PORT || 8765;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Gun Relay is running");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Gun Relay listening on port ${port}`);
});

Gun({
  web: server,
  file: "gun_data"
});
