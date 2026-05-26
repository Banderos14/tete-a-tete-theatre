export type TeamGroup = 'directors' | 'actors' | 'crew';

export interface TeamMember {
  name: string;
  nameFR?: string;
  role: string;
  tone: string;
  group: TeamGroup;
}
