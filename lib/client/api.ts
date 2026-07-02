import type { Group, GroupSummary, Member } from "../../types/domain";

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token: string;
  body?: unknown;
};

async function request<T>(path: string, options: ApiOptions): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? "No se pudo completar la accion.");
  }

  return payload as T;
}

export const api = {
  listGroups: (token: string) => request<{ groups: Group[] }>("/api/groups", { token }),
  createGroup: (token: string, name: string) => request<{ group: Group }>("/api/groups", { token, method: "POST", body: { name } }),
  updateGroup: (token: string, groupId: string, name: string) =>
    request<{ group: Group }>(`/api/groups/${groupId}`, { token, method: "PATCH", body: { name } }),
  deleteGroup: (token: string, groupId: string) => request<{ ok: true }>(`/api/groups/${groupId}`, { token, method: "DELETE" }),
  listMembers: (token: string, groupId: string) => request<{ members: Member[] }>(`/api/groups/${groupId}/members`, { token }),
  createMember: (token: string, groupId: string, name: string) =>
    request<{ member: Member }>(`/api/groups/${groupId}/members`, { token, method: "POST", body: { name } }),
  updateMember: (token: string, groupId: string, memberId: string, name: string) =>
    request<{ member: Member }>(`/api/groups/${groupId}/members/${memberId}`, { token, method: "PATCH", body: { name } }),
  deactivateMember: (token: string, groupId: string, memberId: string) =>
    request<{ member: Member }>(`/api/groups/${groupId}/members/${memberId}`, { token, method: "DELETE" }),
  getSession: (token: string, groupId: string, date: string) =>
    request<{ attendance: Record<string, boolean> | null }>(`/api/groups/${groupId}/sessions/${date}`, { token }),
  saveSession: (token: string, groupId: string, date: string, attendance: Record<string, boolean>) =>
    request<{ ok: true }>(`/api/groups/${groupId}/sessions/${date}`, { token, method: "POST", body: { attendance } }),
  getSummary: (token: string, groupId: string) => request<{ summary: GroupSummary }>(`/api/groups/${groupId}/summary`, { token })
};
