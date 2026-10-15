export interface MemberRole {
  id: number;
  name: string;
  displayName: string;
}

/** A user as seen inside ONE organization. */
export interface Member {
  id: number; // user id
  name: string;
  email: string;
  isActive: boolean; // membership status in this organization
  joinedAt: Date;
  lastLoginAt: Date | null;
  roles: MemberRole[];
  /** outside collaborator: only their projects */
  isGuest: boolean;
  /** guests: the projects they are in */
  guestProjects: { id: number; key: string; name: string; role: string }[] | null;
}
