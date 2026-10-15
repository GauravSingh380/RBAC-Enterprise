// People directory, teams and My Work
import { api } from '../lib/api'
import type { MyWork, Person, PersonDetail, Team } from '../types/people'

export const peopleService = {
  directory: () => api.get<Person[]>('/people'),
  get: (userId: number) => api.get<PersonDetail>(`/people/${userId}`),
  update: (userId: number, data: { jobTitle?: string | null; managerId?: number | null }) => api.patch<PersonDetail>(`/people/${userId}`, data),

  teams: () => api.get<Team[]>('/teams'),
  createTeam: (data: { name: string; description?: string | null; color?: string; leadId?: number | null; memberIds?: number[] }) => api.post<Team[]>('/teams', data),
  updateTeam: (id: number, data: { name?: string; description?: string | null; color?: string; leadId?: number | null }) => api.patch<Team[]>(`/teams/${id}`, data),
  setTeamMembers: (id: number, userIds: number[]) => api.put<Team[]>(`/teams/${id}/members`, { userIds }),
  deleteTeam: (id: number) => api.delete<Team[]>(`/teams/${id}`),
}

export const myWorkService = {
  get: () => api.get<MyWork>('/my-work'),
}
