import { Router, Response } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import * as outlook from "../lib/outlook";

const router = Router();

/** GET /api/outlook/status — Check if Outlook calendar is connected */
router.get("/status", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const status = await outlook.getConnectionStatus();
  res.json(status);
});

/** GET /api/outlook/connect — Start OAuth2 flow (redirect to Microsoft) */
router.get("/connect", authenticate, requireAdmin, (_req: AuthRequest, res: Response) => {
  try {
    const url = outlook.getAuthUrl();
    res.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kunde inte starta Outlook-anslutning";
    res.status(500).json({ error: message });
  }
});

/** GET /api/outlook/callback — OAuth2 callback from Microsoft */
router.get("/callback", async (req, res: Response) => {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    res.redirect(`${clientUrl}/settings?outlook=error&message=${encodeURIComponent(req.query.error_description as string || error)}`);
    return;
  }

  if (!code) {
    res.status(400).json({ error: "Ingen auktoriseringskod mottagen" });
    return;
  }

  try {
    await outlook.handleCallback(code);
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    res.redirect(`${clientUrl}/settings?outlook=connected`);
  } catch (err) {
    console.error("Outlook callback error:", err);
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const message = err instanceof Error ? err.message : "Okänt fel";
    res.redirect(`${clientUrl}/settings?outlook=error&message=${encodeURIComponent(message)}`);
  }
});

/** POST /api/outlook/disconnect — Remove Outlook connection */
router.post("/disconnect", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  await outlook.disconnect();
  res.json({ success: true });
});

export default router;
