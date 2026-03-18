import express from "express";
import path from "path";
import app from "./app";
import { ensureSuperadminFromEnv } from "./lib/bootstrapSuperadmin";

const PORT = process.env.PORT || 3001;

// Serve React frontend in production (standalone mode)
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

async function start() {
  await ensureSuperadminFromEnv();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
