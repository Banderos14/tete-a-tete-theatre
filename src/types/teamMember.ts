export type TeamGroup = 'directors' | 'actors' | 'youth';

export interface TeamMember {
  name: string;
  nameFR?: string;
  role: string;
  photo?: string;
  tone: string;
  group: TeamGroup;
}
