export interface User {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  logoUrl?: string | null;
  department: string | null;
  phone: string | null;
  role: "superadmin" | "admin" | "client";
  forcePasswordChange?: boolean;
}

export interface Course {
  id: string;
  name: string;
  isCustom: boolean;
}

export interface Booking {
  id: string;
  bookingNumber?: string;
  date: string;
  endDate: string | null;
  city: string;
  participants: number;
  status?: string;
  notes?: string;
  rescheduleToken: boolean;
  isPrivate?: boolean;
  sharedNotes: string;
  privateNotes?: string;
  customCourse: string | null;
  calendarCity?: string;
  courseId: string;
  clientId: string;
  createdById?: string;
  course: Course;
  client: Pick<User, "id" | "name" | "company" | "email" | "logoUrl">;
  createdBy?: Pick<User, "id" | "name" | "company" | "email">;
  createdAt: string;
  updatedAt: string;
  hasUnread?: boolean;
  latestChatAt?: string | null;
  displayTitle?: string;
  canViewBookingContent?: boolean;
  canAccessChat?: boolean;
  canEditBookingFields?: boolean;
  canReassignClient?: boolean;
  canMoveBooking?: boolean;
  moveBookingMessage?: string | null;
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

export interface StatisticsFilterOption {
  id: string;
  label: string;
  email: string;
}

export interface StatisticsStatusOption {
  value: string;
  label: string;
}

export interface StatisticsBookingRow {
  id: string;
  date: string;
  endDate: string | null;
  createdAt: string;
  city: string;
  participants: number;
  status: string;
  statusLabel: string;
  courseName: string;
  dateLabel: string;
  createdAtLabel: string;
  timeLabel: string;
  customer: {
    id: string;
    label: string;
    email: string;
  };
  createdBy: {
    id: string;
    label: string;
    email: string;
  };
}

export interface StatisticsClientSummary {
  clientId: string;
  label: string;
  count: number;
  participants: number;
}

export interface StatisticsResponse {
  filters: {
    fromDate: string | null;
    toDate: string | null;
    clientIds: string[];
    statuses: string[];
  };
  filterDescription: string;
  options: {
    clients: StatisticsFilterOption[];
    statuses: StatisticsStatusOption[];
  };
  summary: {
    totalBookings: number;
    totalParticipants: number;
    uniqueClients: number;
    bookingsPerClient: StatisticsClientSummary[];
  };
  bookings: StatisticsBookingRow[];
}
