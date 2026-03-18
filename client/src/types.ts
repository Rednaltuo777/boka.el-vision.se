export interface User {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  logoUrl?: string | null;
  department: string | null;
  phone: string | null;
  role: "superadmin" | "admin" | "client";
}

export interface Course {
  id: string;
  name: string;
  isCustom: boolean;
}

export interface Booking {
  id: string;
  date: string;
  endDate: string | null;
  city: string;
  participants: number;
  notes?: string;
  rescheduleToken: boolean;
  isPrivate?: boolean;
  sharedNotes: string;
  privateNotes?: string;
  customCourse: string | null;
  courseId: string;
  clientId: string;
  course: Course;
  client: Pick<User, "id" | "name" | "company" | "email" | "logoUrl">;
  createdAt: string;
  updatedAt: string;
  hasUnread?: boolean;
  latestChatAt?: string | null;
  displayTitle?: string;
  canAccessChat?: boolean;
  canEditBookingFields?: boolean;
  canMoveBooking?: boolean;
  editWindowEndsAt?: string;
}

export interface BlockingPeriod {
  id: string;
  startDate: string;
  endDate: string;
  type: "vacation" | "blocked" | "private";
  customLabel?: string | null;
  displayLabel?: string;
  createdAt: string;
  updatedAt: string;
  createdById: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  bookingId: string;
  author: { id: string; name: string | null; role: string };
}

export interface Invitation {
  id: string;
  email: string;
  token: string;
  used: boolean;
  expiresAt: string;
  createdAt: string;
  registerUrl?: string;
}
