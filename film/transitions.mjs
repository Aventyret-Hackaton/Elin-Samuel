// Trippiga övergångar för ffmpegs xfade (egna uttryck per pixel).
export const samp = (p, x, y) => `if(eq(PLANE,0),${p}0(${x},${y}),if(eq(PLANE,1),${p}1(${x},${y}),${p}2(${x},${y})))`;
// Gemensam start: dx, dy, r, vinkel, sin(pi*P), mjuk P
export const pre = 'st(0,X-W/2);st(1,Y-H/2);st(2,hypot(ld(0),ld(1)));st(3,atan2(ld(1),ld(0)));st(5,sin(PI*P));st(8,P*P*(3-2*P));';
export const post = `st(6,clip(ld(6),0,W-1));st(7,clip(ld(7),0,H-1));ld(8)*${samp('b', 'ld(6)', 'ld(7)')}+(1-ld(8))*${samp('a', 'ld(6)', 'ld(7)')}`;
export const warps = {
  // virvel: vinkeln vrids mer i mitten av bilden
  vortex: 'st(4,ld(3)+10*ld(5)*exp(-ld(2)/(0.55*H)));st(6,W/2+ld(2)*cos(ld(4)));st(7,H/2+ld(2)*sin(ld(4)));',
  // kalejdoskop: vikt vinkel (6 speglingar) som blandas in och roterar
  kaleido:
    'st(4,mod(ld(3)+PI*10,PI/3));st(4,if(gt(ld(4),PI/6),PI/3-ld(4),ld(4)));st(4,ld(3)*(1-ld(5))+(ld(4)+2*P)*ld(5));st(9,ld(2)*(1+0.35*ld(5)*sin(ld(2)/36)));st(6,W/2+ld(9)*cos(ld(4)));st(7,H/2+ld(9)*sin(ld(4)));',
  // flytande: vågor som sveper över bilden
  liquid: 'st(6,X+70*ld(5)*sin(Y/34+P*20));st(7,Y+70*ld(5)*cos(X/42+P*16));',
  // tunnel: oändlig inzoomning med upprepning
  tunnel: 'st(4,exp(-2.4*ld(5)));st(6,mod(W/2+ld(0)*ld(4)+W*8,W));st(7,mod(H/2+ld(1)*ld(4)+H*8,H));',
};
export const order = ['vortex', 'kaleido', 'liquid', 'tunnel'];
export const expr = (name) => `${pre}${warps[name]}${post}`;

