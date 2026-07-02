export type Group = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type Member = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceSession = {
  id: string;
  date: string;
  attendance: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
};

export type MemberSummary = {
  memberId: string;
  name: string;
  active: boolean;
  attended: number;
  percentage: number;
};

export type GroupSummary = {
  totalSessions: number;
  members: MemberSummary[];
};

export type ApiError = {
  error: string;
};
