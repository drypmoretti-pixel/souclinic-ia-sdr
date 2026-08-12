import Fastify from "fastify";
const app = Fastify({ logger: false });
app.get("/health", async () => ({ ok: true }));
app.listen({ port: 3002, host: "127.0.0.1" })
  .then(() => console.log("LISTENING_OK"))
  .catch(e => { console.error("LISTEN_ERROR", e.message); process.exit(1); });
