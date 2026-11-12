// Alla kampanjtexter på ett ställe. Inga versaler: allt skrivs och visas i gemener.
export const CONFIG = {
  bootName: 'hackathon.exe',
  // Antalet tävlande grupper i hackathonet. Används i rubriken över personerna i scen 2.
  // Inte samma sak som antalet repon i orgen (där ingår även kampanjrepot och testrepon).
  projectCount: 8,
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
  // Rummet i scen 1 och 3. 'code' = 3D-rummet byggt i kod (room.ts).
  // 'plate' = fotorummet (room-plate.ts): stillbilder + djup i public/room/, beskrivet i plate.json.
  // Saknas plate.json används kodrummet. Testa utan att ändra här: ?room=plate eller ?room=code.
  room: 'plate' as 'code' | 'plate',
  plate: 'room/plate.json',
} as const;

export const BASE = import.meta.env.BASE_URL;
