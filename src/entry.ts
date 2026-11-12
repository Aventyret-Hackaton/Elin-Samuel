// Ingång: telefoner och surfplattor får en stillsam sida med vinnaren (src/mobile.ts),
// datorer får hela upplevelsen (src/main.ts). Upplevelsen kräver mus och tangentbord.
// Dynamisk import, så att mobilen aldrig laddar Three.js, filmen eller ljudet.
// Testa: ?device=mobile eller ?device=desktop tvingar fram respektive läge.
const forced = new URLSearchParams(location.search).get('device');
const touchOnly = matchMedia('(hover: none) and (pointer: coarse)').matches;
const narrow = matchMedia('(max-width: 760px)').matches;
const mobile = forced ? forced === 'mobile' : touchOnly || narrow;

if (mobile) void import('./mobile');
else void import('./main');
