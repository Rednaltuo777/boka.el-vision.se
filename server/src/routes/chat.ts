import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// Get chat messages for a booking
router.get("/:bookingId", authenticate, async (req: AuthRequest, res: Response) => {
  const bookingId = req.params.bookingId as string;
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    res.status(404).json({ error: "Bokning ej hittad" });
    return;
  }

  if (req.userRole !== "admin" && booking.clientId !== req.userId) {
    res.status(403).json({ error: "Åtkomst nekad" });
    return;
  }

  const messages = await prisma.chatMessage.findMany({
    where: { bookingId },
    include: { author: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });

  res.json(messages);
});

// Post a message
router.post("/:bookingId", authenticate, async (req: AuthRequest, res: Response) => {
  const bookingId = req.params.bookingId as string;
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    res.status(404).json({ error: "Bokning ej hittad" });
    return;
  }

  if (req.userRole !== "admin" && booking.clientId !== req.userId) {
    res.status(403).json({ error: "Åtkomst nekad" });
    return;
  }

  const { content } = req.body;
  if (!content?.trim()) {
    res.status(400).json({ error: "Meddelande krävs" });
    return;
  }

  const message = await prisma.chatMessage.create({
    data: {
      content: content.trim(),
      bookingId,
      authorId: req.userId!,
    },
    include: { author: { select: { id: true, name: true, role: true } } },
  });

  res.json(message);
});

export default router;
