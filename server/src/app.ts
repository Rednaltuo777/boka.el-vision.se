import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import bookingRoutes from "./routes/bookings";
import courseRoutes from "./routes/courses";
import chatRoutes from "./routes/chat";
import invitationRoutes from "./routes/invitations";
import outlookRoutes from "./routes/outlook";

const app = express();

const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").trim();
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/outlook", outlookRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;
