// All kampanjtexter på ett ställe. Byt här, inget annat behöver ändras.
export const CONFIG = {
  bootName: 'HACKATHON.EXE',
  kicker: '> SYSTEM ONLINE_',
  headline: 'ÄVENTYRET HACKATHON 2026',
  description:
    'Tre dygn, ett uppdrag, en vinnare. Allt som byggdes ligger i systemet. Dags att avgöra.',
  cta: 'KORA VINNARE',
  continueLabel: 'VISA VINNAREN',
  winnerLabel: 'VINNARE',
  // Medier och data. Byt filerna i /public, ingen kodändring.
  media: {
    video: 'media/video.mp4',
    loop: 'media/loop.mp4',
  },
  data: {
    stats: 'data/stats.json',
    winner: 'data/winner.json',
  },
} as const;

export const BASE = import.meta.env.BASE_URL;
