import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest, hasAdminAccess } from "../middleware/auth";

const router = Router();

function canAccessChat(booking: { clientId: string }, req: AuthRequest) {
  return hasAdminAccess(req.userRole) || booking.clientId === req.userId;
}

// Get chat messages for a booking
router.get("/:bookingId", authenticate, async (req: AuthRequest, res: Response) => {
  const bookingId = req.params.bookingId as string;
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    res.status(404).json({ error: "Bokning ej hittad" });
    return;
  }

  if (!canAccessChat(booking, req)) {
    res.status(403).json({ error: "Åtkomst nekad" });
    return;
  }

  const messages = await prisma.chatMessage.findMany({
    where: { bookingId },
    include: { author: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });

  const latestMessage = messages[messages.length - 1];
  if (latestMessage && req.userId) {
    await prisma.bookingChatRead.upsert({
      where: {
        bookingId_userId: {
          bookingId,
          userId: req.userId,
        },
      },
      update: { lastReadAt: latestMessage.createdAt },
      create: {
        bookingId,
        userId: req.userId,
        lastReadAt: latestMessage.createdAt,
      },
    });
  }

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

  if (!canAccessChat(booking, req)) {
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

  await prisma.bookingChatRead.upsert({
    where: {
      bookingId_userId: {
        bookingId,
        userId: req.userId!,
      },
    },
    update: { lastReadAt: message.createdAt },
    create: {
      bookingId,
      userId: req.userId!,
      lastReadAt: message.createdAt,
    },
  });

  res.json(message);
});

export default router;
