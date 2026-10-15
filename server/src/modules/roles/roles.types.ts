export interface Role {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissionIds: number[];
}
