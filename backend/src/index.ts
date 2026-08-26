import { createApp } from "./app";
import { env } from "./env";

const app = createApp();

app.listen({ port: env.PORT, host: env.HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
