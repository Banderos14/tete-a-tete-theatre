import type { TeamMember } from '../types';

export const TEAM: TeamMember[] = [
  { name: 'Анна Морозова',    role: 'Художественный руководитель', tone: 'linear-gradient(135deg, #3a1a1a, #1a0a08)', group: 'directors' },
  { name: 'Дмитрий Соколов', role: 'Режиссёр-постановщик',        tone: 'linear-gradient(135deg, #1a1a2a, #08080e)', group: 'directors' },
  { name: 'Елена Волкова',   role: 'Актриса',                     tone: 'linear-gradient(135deg, #2a1014, #14060a)', group: 'actors'    },
  { name: 'Михаил Орлов',    role: 'Актёр',                       tone: 'linear-gradient(135deg, #1a2014, #0a0e08)', group: 'actors'    },
  { name: 'Ольга Лебедева',  role: 'Актриса',                     tone: 'linear-gradient(135deg, #2a1a0a, #14080a)', group: 'actors'    },
  { name: 'Игорь Бельцев',   role: 'Актёр · Музыкант',           tone: 'linear-gradient(135deg, #1a141a, #08060a)', group: 'actors'    },
  { name: 'Соня Уставлева',  role: 'Художник по свету',           tone: 'linear-gradient(135deg, #2a1a14, #14080a)', group: 'crew'      },
  { name: 'Рустэм Коронин',  role: 'Звукорежиссёр',              tone: 'linear-gradient(135deg, #14141a, #08080e)', group: 'crew'      },
];
