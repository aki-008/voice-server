import express from "express";

import { CLIENT_DIST } from "./lib/paths.js";
import apiRouter from "./routes/api.js";

export function createApp() {
  const isDev = process.env.NODE_ENV !== "production";
  const app = express();

  app.use(express.json());
  app.use("/api", apiRouter);

  if (!isDev) {
    app.use(express.static(CLIENT_DIST));
    app.get("*", (_req, res) => {
      res.sendFile("index.html", { root: CLIENT_DIST });
    });
  }

  return app;
}
