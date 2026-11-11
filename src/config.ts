// Alla kampanjtexter på ett ställe. Inga versaler: allt skrivs och visas i gemener.
export const CONFIG = {
  bootName: 'hackathon.exe',
  continueLabel: 'visa vinnarprojektet',
  winnerLabel: 'vinnande projekt',
  // Medier och data. Byt filerna i /public, ingen kodändring.
  media: {
    video: 'media/video.mp4',
    loop: 'media/loop.mp4',
  },
  data: {
    team: 'data/team.json', // byggs av scripts/build-team.mjs
    github: 'data/github.json', // hämtas av scripts/fetch-github.mjs
    winner: 'data/winner.json',
  },
} as const;

export const BASE = import.meta.env.BASE_URL;
