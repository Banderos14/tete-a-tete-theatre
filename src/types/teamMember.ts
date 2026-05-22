export type TeamGroup = 'directors' | 'actors' | 'crew';

export interface TeamMember {
  name: string;
  role: string;
  tone: string;
  group: TeamGroup;
}
