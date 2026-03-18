import type { AuthRequest } from "../middleware/auth";

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

export function getEmailDomain(email?: string | null) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const atIndex = normalizedEmail.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalizedEmail.length - 1) {
    return null;
  }

  return normalizedEmail.slice(atIndex + 1);
}

export function sharesEmailDomain(leftEmail?: string | null, rightEmail?: string | null) {
  const leftDomain = getEmailDomain(leftEmail);
  const rightDomain = getEmailDomain(rightEmail);

  return Boolean(leftDomain && rightDomain && leftDomain === rightDomain);
}

export function canViewSharedBookingContent(
  booking: { clientId: string; isPrivate?: boolean; client?: { email?: string | null } | null },
  req: AuthRequest,
) {
  if (req.userRole === "admin" || req.userRole === "superadmin") {
    return true;
  }

  if (booking.clientId === req.userId) {
    return true;
  }

  if (booking.isPrivate) {
    return false;
  }

  return sharesEmailDomain(booking.client?.email, req.userEmail);
}