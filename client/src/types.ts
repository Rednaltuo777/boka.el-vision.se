export interface User {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  department: string | null;
  phone: string | null;
  role: "admin" | "client";
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
  sharedNotes: string;
  privateNotes?: string;
  customCourse: string | null;
  courseId: string;
  clientId: string;
  course: Course;
  client: Pick<User, "id" | "name" | "company" | "email">;
  createdAt: string;
  updatedAt: string;
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
