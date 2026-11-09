(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const readout = document.getElementById('statusReadout');
  const soundBtn = document.getElementById('soundBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const motionBtn = document.getElementById('motionBtn');
  const keys = Object.create(null);
  const colors = { cyan:'#55e4ff', blue:'#1676ff', navy:'#123363', gold:'#ffc94a', red:'#ef4e65', dark:'#091a29', white:'#e9fbff' };
  let state = 'title', activeHero = 0, cameraX = 0, last = 0, clock = 0, shake = 0;
  let soundOn = true, reducedMotion = false, audio = null, musicTimer = null, score = 0, best = Number(localStorage.getItem('dualcore-best') || 0);
  const padInput = Object.create(null);
  const spriteSheets = { x: null, zero: null };
  const spriteFrames = [
    [[27,43,22,41],[54,42,22,42],[81,42,22,42]],
    [[22,7,30,32],[55,7,27,32],[88,42,30,34]]
  ];
  for (const [hero, file] of [['x','x-custom.png'],['zero','zero-custom.png']]) {
    const image = new Image();
    image.onload = () => {
      const sheet = document.createElement('canvas');
      sheet.width = image.naturalWidth; sheet.height = image.naturalHeight;
      const sheetCtx = sheet.getContext('2d', { willReadFrequently: hero === 'x' });
      sheetCtx.drawImage(image, 0, 0);
      if (hero === 'x') {
        const pixels = sheetCtx.getImageData(0, 0, sheet.width, sheet.height);
        for (let i = 0; i < pixels.data.length; i += 4) {
          if (pixels.data[i] === 0 && pixels.data[i + 1] === 106 && pixels.data[i + 2] === 0) pixels.data[i + 3] = 0;
        }
        sheetCtx.putImageData(pixels, 0, 0);
      }
      spriteSheets[hero] = sheet;
    };
    image.src = `assets/${file}`;
  }
  let player, enemies, shots, particles, pickups, boss, fireHeldAt = 0;
  const worldWidth = 3500;
  const platforms = [
    {x:0,y:470,w:525,h:70},{x:590,y:470,w:560,h:70},{x:1210,y:470,w:455,h:70},{x:1730,y:470,w:535,h:70},{x:2320,y:470,w:490,h:70},{x:2870,y:470,w:630,h:70},
    {x:230,y:380,w:150,h:18},{x:690,y:350,w:175,h:18},{x:975,y:405,w:120,h:18},{x:1285,y:360,w:165,h:18},{x:1555,y:310,w:135,h:18},{x:1865,y:382,w:150,h:18},{x:2110,y:335,w:170,h:18},{x:2425,y:385,w:165,h:18},{x:2680,y:325,w:145,h:18},{x:3020,y:390,w:150,h:18}
  ];
  const enemyStarts = [300,480,760,1060,1330,1610,1900,2170,2490,2750,2960];
  function freshGame(){
    player={x:76,y:390,vx:0,vy:0,w:25,h:42,face:1,onGround:false,hp:8,maxHp:8,inv:0,dash:0,dashCool:0,fireCd:0,slash:0,charge:0,anim:0};
    enemies=enemyStarts.map((x,i)=>({x,y:428,w:28,h:34,hp:2,dir:i%2?1:-1,home:x,phase:i*.7,alive:true}));
    shots=[];particles=[];pickups=[{x:700,y:321,kind:'heart',got:false},{x:1738,y:438,kind:'heart',got:false},{x:2325,y:438,kind:'energy',got:false},{x:2760,y:295,kind:'heart',got:false}];
    boss={x:3130,y:363,w:64,h:90,hp:18,maxHp:18,dir:-1,alive:true,cd:1.2,flash:0};
    score=0;cameraX=0;activeHero=0;shake=0;
  }
  freshGame();
  const heroes=[{name:'X',color:'#46dcff',sub:'PLASMA BUSTER',move:'Charge shots pierce armor'},{name:'ZERO',color:'#ffcb56',sub:'ENERGY SABER',move:'Close-range strikes hit hard'}];
  function startAudio(){
    if(!soundOn)return;
    if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();}
    if(audio.state==='suspended')audio.resume();
    if(musicTimer)return;
    const bpm=118, step=60/bpm/2, scale=[0,3,7,10,12,10,7,3,0,3,7,12,15,12,7,3];
    let beat=0;
    musicTimer=setInterval(()=>{
      if(!audio||!soundOn||state==='title'||state==='paused'||state==='dead'||state==='win')return;
      const now=audio.currentTime, root=[55,49,41,46][Math.floor(beat/16)%4];
      const make=(freq,duration,type,volume)=>{const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,now);g.gain.exponentialRampToValueAtTime(.001,now+duration);o.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+duration+.01)};
      if(beat%2===0)make(root,step*1.7,'triangle',.055);
      if(beat%4===0)make(root/2,.12,'square',.07);
      if(beat%4===2)make(root*2,.055,'square',.023);
      make(root*Math.pow(2,scale[beat%16]/12),step*.8,'square',.027);
      beat++;
    },step*1000);
  }
  function stopAudio(){if(musicTimer){clearInterval(musicTimer);musicTimer=null}if(audio&&audio.state==='running')audio.suspend()}
  function sfx(freq=440,dur=.08,type='square',vol=.045){if(!soundOn||!audio)return;const now=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(Math.max(45,freq*.55),now+dur);g.gain.setValueAtTime(vol,now);g.gain.exponentialRampToValueAtTime(.001,now+dur);o.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+dur)}
  function setSound(on){soundOn=on;soundBtn.innerHTML=(on?'♫ <span>SOUND ON</span>':'♫ <span>SOUND OFF</span>');soundBtn.setAttribute('aria-pressed',String(on));if(on)startAudio();else stopAudio()}
  soundBtn.addEventListener('click',()=>setSound(!soundOn));
  pauseBtn.addEventListener('click',togglePause);
  motionBtn.addEventListener('click',()=>{reducedMotion=!reducedMotion;if(reducedMotion)shake=0;motionBtn.innerHTML=`◉ <span>FX ${reducedMotion?'OFF':'ON'}</span>`;motionBtn.setAttribute('aria-pressed',String(!reducedMotion))});
  document.getElementById('restartBtn').addEventListener('click',()=>{freshGame();state='playing';startAudio();updateReadout()});
  function updateReadout(){readout.textContent=state==='playing'?`${heroes[activeHero].name} ACTIVE · ${player.hp}/${player.maxHp} ARMOR · ${score} DATA`:`${state==='win'?'Warden defeated. Run it back for a higher score.':state==='dead'?'Armor depleted. Restart and try another route.':'Choose your hunter and launch the mission.'}`}
  function togglePause(){if(state==='playing'){state='paused';stopAudio()}else if(state==='paused'){state='playing';startAudio()}updateReadout()}
  function begin(){if(state==='title'||state==='dead'||state==='win'){freshGame();state='playing';startAudio();updateReadout()}else if(state==='paused')togglePause()}
  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();if([' ','arrowleft','arrowright','arrowup','arrowdown'].includes(k))e.preventDefault();
    if(!keys[k]){if(k==='q'||k==='shift')swapHero();if(k==='escape'||k==='p')togglePause();if(k==='m')motionBtn.click();if((k==='enter'||k===' ')&&state!=='playing')begin();if(k==='r'){freshGame();state='playing';startAudio();updateReadout()}}
    keys[k]=true;if(k==='j'||k==='z')fireHeldAt=clock;
  });
  window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false});
  canvas.addEventListener('pointerdown',()=>{if(state!=='playing')begin()});
  document.querySelectorAll('.touch-controls button').forEach(button=>{
    const action=button.dataset.key;
    button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(action==='switch')swapHero();else if(action==='jump'){keys.jump=true;if(state!=='playing')begin()}else if(action==='dash')keys.dash=true;else if(action==='fire'){keys.fire=true;fireHeldAt=clock}else keys[action]=true;});
    const up=e=>{e.preventDefault();if(action==='jump')keys.jump=false;else if(action==='dash')keys.dash=false;else if(action==='fire')keys.fire=false;else if(action!=='switch')keys[action]=false};
    button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
  });
  function gamepadInput(){const gp=navigator.getGamepads?.()[0];for(const k of Object.keys(padInput))padInput[k]=false;if(!gp)return;padInput.left=gp.axes[0]<-.35||!!gp.buttons[14]?.pressed;padInput.right=gp.axes[0]>.35||!!gp.buttons[15]?.pressed;padInput.jump=!!gp.buttons[0]?.pressed;padInput.fire=!!gp.buttons[2]?.pressed||!!gp.buttons[7]?.pressed;padInput.dash=!!gp.buttons[1]?.pressed;if(gp.buttons[3]?.pressed&&!gamepadInput.lastSwap){swapHero()}gamepadInput.lastSwap=!!gp.buttons[3]?.pressed;if(gp.buttons[9]?.pressed&&!gamepadInput.lastStart){if(state==='playing'||state==='paused')togglePause();else begin()}gamepadInput.lastStart=!!gp.buttons[9]?.pressed;}
  function swapHero(){if(state!=='playing')return;activeHero=1-activeHero;player.slash=0;player.charge=0;for(let i=0;i<8;i++)particles.push({x:player.x+12,y:player.y+20,vx:(Math.random()-.5)*3,vy:(Math.random()-.5)*4,life:.34,color:heroes[activeHero].color,size:3});sfx(activeHero?660:510,.12,'triangle',.055);updateReadout()}
  const down=(...list)=>list.some(k=>keys[k]||padInput[k]);
  function update(dt){
    clock+=dt;gamepadInput();if(state!=='playing')return;
    dt=Math.min(dt,.035);const p=player; p.anim+=dt*9;p.inv=Math.max(0,p.inv-dt);p.dashCool=Math.max(0,p.dashCool-dt);p.fireCd-=dt;p.slash=Math.max(0,p.slash-dt);p.charge=down('j','z','fire')?p.charge+dt:0;
    if(down('left','a','arrowleft')){p.vx-=1200*dt;p.face=-1}if(down('right','d','arrowright')){p.vx+=1200*dt;p.face=1}
    p.vx=Math.max(-235,Math.min(235,p.vx));if(!down('left','a','arrowleft')&&!down('right','d','arrowright'))p.vx*=Math.pow(.001,dt);
    if(down('jump',' ','w','arrowup')&&p.onGround){p.vy=-475;p.onGround=false;sfx(260,.12,'triangle',.035)}
    if(down('dash','k','x')&&p.dashCool<=0){p.dash=.18;p.dashCool=.72;p.vx=p.face*500;p.vy*=.15;sfx(180,.13,'sawtooth',.04)}
    if(p.dash>0){p.dash-=dt;p.vx=p.face*500}else p.vy+=1250*dt;
    if(down('j','z','fire')&&p.fireCd<=0){
      if(activeHero===0){const charged=p.charge>1.0;shots.push({x:p.x+(p.face>0?p.w:-15),y:p.y+17,w:charged?27:16,h:charged?15:9,vx:p.face*(charged?630:510),vy:0,damage:charged?3:1,life:1.15,hero:0,charged});p.fireCd=charged?.42:.24;sfx(charged?760:540,.09,'square',charged?.06:.035)}
      else{p.slash=.23;p.fireCd=.32;const reach=p.face>0?52:-30;enemies.forEach(e=>{if(e.alive&&Math.abs((e.x+e.w/2)-(p.x+reach))<48&&Math.abs(e.y-p.y)<48)damageEnemy(e,2)});if(boss.alive&&Math.abs((boss.x+boss.w/2)-(p.x+reach))<68&&Math.abs(boss.y-p.y)<80)damageBoss(2);sfx(310,.15,'sawtooth',.05)}
    }
    p.x+=p.vx*dt;p.x=Math.max(0,Math.min(worldWidth-p.w,p.x));p.y+=p.vy*dt;p.onGround=false;
    for(const platform of platforms){if(p.x+p.w>platform.x&&p.x<platform.x+platform.w&&p.y+p.h>=platform.y&&p.y+p.h-p.vy*dt<=platform.y&&p.vy>=0){p.y=platform.y-p.h;p.vy=0;p.onGround=true}}
    if(p.y>H+120){hurt(2);p.y=390;p.vy=0}
    for(const e of enemies){if(!e.alive)continue;e.phase+=dt;e.x+=e.dir*(52+Math.sin(e.phase*2)*9)*dt;if(Math.abs(e.x-e.home)>90)e.dir*=-1;if(Math.abs(p.x-e.x)<p.w&&Math.abs(p.y-e.y)<p.h)hurt(1)}
    for(const shot of shots){shot.x+=shot.vx*dt;shot.life-=dt;for(const e of enemies){if(e.alive&&shot.x<e.x+e.w&&shot.x+shot.w>e.x&&shot.y<e.y+e.h&&shot.y+shot.h>e.y){damageEnemy(e,shot.damage);shot.life=0;break}}if(boss.alive&&shot.x<boss.x+boss.w&&shot.x+shot.w>boss.x&&shot.y<boss.y+boss.h&&shot.y+shot.h>boss.y){damageBoss(shot.damage);shot.life=0}}
    shots=shots.filter(s=>s.life>0&&s.x>-100&&s.x<worldWidth+100);
    for(const item of pickups){if(!item.got&&Math.abs(p.x-item.x)<30&&Math.abs(p.y-item.y)<50){item.got=true;if(item.kind==='heart')p.hp=Math.min(p.maxHp,p.hp+2);else score+=250;sfx(920,.22,'sine',.055);for(let n=0;n<12;n++)particles.push({x:item.x,y:item.y,vx:(Math.random()-.5)*100,vy:-Math.random()*120,life:.6,color:'#8bffbd',size:3})}}
    if(boss.alive){boss.cd-=dt;boss.x+=boss.dir*36*dt;if(boss.x<3000||boss.x>3260)boss.dir*=-1;if(boss.cd<=0&&Math.abs(boss.x-p.x)<440){shots.push({x:boss.x+(boss.dir<0?0:boss.w),y:boss.y+35,w:18,h:18,vx:boss.dir*220,vy:0,life:2,damage:0,enemy:true});boss.cd=1.55;sfx(170,.15,'sawtooth',.02)}}
    for(const s of shots.filter(o=>o.enemy)){s.x+=s.vx*dt;s.life-=dt;if(s.x<p.x+p.w&&s.x+s.w>p.x&&s.y<p.y+p.h&&s.y+s.h>p.y){hurt(1);s.life=0}}
    shots=shots.filter(s=>s.life>0);
    if(boss.alive&&Math.abs(p.x-boss.x)<p.w+boss.w&&Math.abs(p.y-boss.y)<p.h+boss.h)hurt(1);
    particles.forEach(a=>{a.x+=a.vx*dt;a.y+=a.vy*dt;a.life-=dt;a.vy+=120*dt});particles=particles.filter(a=>a.life>0);
    cameraX=Math.max(0,Math.min(worldWidth-W,p.x-W*.36));if(shake>0)shake=Math.max(0,shake-dt*20);
    if(p.x>worldWidth-110&&!boss.alive){state='win';best=Math.max(best,score);localStorage.setItem('dualcore-best',best);stopAudio();updateReadout()}
  }
  function hurt(amount){if(player.inv>0||state!=='playing')return;player.hp-=amount;player.inv=.9;if(!reducedMotion)shake=5;sfx(105,.22,'square',.06);for(let i=0;i<12;i++)particles.push({x:player.x+12,y:player.y+20,vx:(Math.random()-.5)*150,vy:(Math.random()-.5)*120,life:.35,color:'#ff5d70',size:3});if(player.hp<=0){player.hp=0;state='dead';stopAudio();updateReadout()}}
  function damageEnemy(e,n){e.hp-=n;score+=n*20;for(let i=0;i<4;i++)particles.push({x:e.x+14,y:e.y+14,vx:(Math.random()-.5)*120,vy:(Math.random()-.5)*100,life:.3,color:'#ff8d8d',size:3});if(e.hp<=0){e.alive=false;score+=100;sfx(125,.12,'square',.035)}}
  function damageBoss(n){if(!boss.alive)return;boss.hp-=n;boss.flash=.15;score+=15;if(!reducedMotion)shake=2;sfx(230,.08,'sawtooth',.04);if(boss.hp<=0){boss.alive=false;score+=2000;for(let i=0;i<40;i++)particles.push({x:boss.x+32,y:boss.y+45,vx:(Math.random()-.5)*340,vy:(Math.random()-.5)*340,life:.8+Math.random()*.4,color:['#55e4ff','#ffcb56','#ff556b'][i%3],size:3+Math.random()*5})}}
  function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))}
  function drawBackground(){
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#0b1c34');g.addColorStop(.55,'#142d45');g.addColorStop(1,'#172a39');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    // distant moon and layered industrial skyline
    ctx.fillStyle='#a5dff2';ctx.globalAlpha=.12;ctx.beginPath();ctx.arc(756-cameraX*.04,105,46,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    for(let layer=0;layer<3;layer++){const speed=[.12,.28,.52][layer],base=[314,373,426][layer],step=[120,92,76][layer];for(let wx=-step;wx<W+step;wx+=step){const idx=Math.floor((wx+cameraX*speed)/step),x=wx-((cameraX*speed)%step);const hash=Math.abs((idx*73+layer*31)%89);const bw=step*.55+hash*.35,bh=[80,125,94][layer]+(hash%5)*15;rect(x,base-bh,bw,bh,['#122942','#10253a','#112238'][layer]);for(let wy=base-bh+14;wy<base-10;wy+=18)for(let wx2=x+10;wx2<x+bw-8;wx2+=19)if(((Math.floor(wx2)+Math.floor(wy)+layer)%3)!==0)rect(wx2,wy,5,7,layer===2?'#21859a':'#28536c')}}
    // animated distant scan lights
    for(let i=0;i<9;i++){let x=(i*143-cameraX*.7)%W;if(x<0)x+=W;rect(x,300+(i%3)*20,22,2,'#44d6ed55')}
  }
  function drawPlatform(p){const x=p.x-cameraX;if(x+p.w<0||x>W)return;rect(x,p.y,p.w,p.h,'#101d2b');rect(x,p.y,p.w,5,'#4ad8e9');rect(x,p.y+5,p.w,3,'#267287');for(let wx=x+7;wx<x+p.w-4;wx+=28){rect(wx,p.y+13,17,3,'#263b4b');rect(wx+3,p.y+22,5,3,'#183346')}if(p.y<450)for(let wx=x+14;wx<x+p.w;wx+=50)rect(wx,p.y+4,2,7,'#b3f8ff')}
  function drawHero(x,y,hero,face,anim,slash,inv,dash=0){
    const col=hero===0?colors.cyan:colors.gold, secondary=hero===0?colors.blue:'#e84e68', dark=hero===0?colors.navy:'#642d52';const bob=Math.sin(anim)*1.3, X=Math.round(x),Y=Math.round(y+bob);
    ctx.save();if(face<0){ctx.translate(X*2+25,0);ctx.scale(-1,1)}
    if(dash>0){ctx.globalAlpha=.34;for(let n=1;n<=3;n++){rect(X-n*12,Y+5,23,34,hero===0?'#62eaff55':'#ffd36a55')}ctx.globalAlpha=1}
    if(inv>0&&Math.floor(inv*18)%2===0)ctx.globalAlpha=.35;
    const sheet=spriteSheets[hero===0?'x':'zero'];
    if(sheet){
      const frames=spriteFrames[hero], frame=frames[slash>0&&hero===1?2:Math.floor(anim*2)%2];
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(sheet,frame[0],frame[1],frame[2],frame[3],X-4,Y-1,33,43);
    }else{
      // Small fallback while the supplied sprite sheets are loading.
      rect(X+3,Y+31+bob,8,10,dark);rect(X+15,Y+31-bob,8,10,dark);rect(X+1,Y+38,12,5,secondary);rect(X+14,Y+38,12,5,secondary);
      rect(X+4,Y+17,18,17,secondary);rect(X+7,Y+18,12,14,col);rect(X+3,Y+25,7,7,dark);rect(X+17,Y+24,7,8,dark);
      rect(X+18,Y+20,10,8,col);rect(X+23,Y+19,10,11,secondary);rect(X+25,Y+21,9,7,'#bfdff0');rect(X+33,Y+22,3,5,col);
      rect(X+4,Y+3,18,16,secondary);rect(X+7,Y,13,13,col);rect(X+6,Y+4,17,4,hero===0?'#9df4ff':'#ffe19b');rect(X+10,Y+7,10,5,'#091625');rect(X+12,Y+8,6,2,hero===0?'#9ff8ff':'#ffb2a1');rect(X+4,Y+12,4,7,dark);rect(X+19,Y+12,5,6,dark);
      if(hero===1){rect(X+5,Y-4,9,4,'#ff314c');rect(X-1,Y-5,8,4,'#ff5260');rect(X-6,Y-3,7,3,'#bd274c')}
    }
    if(slash>0&&hero===1){ctx.globalAlpha=.88;ctx.strokeStyle='#ffe582';ctx.lineWidth=5;ctx.beginPath();ctx.arc(X+28,Y+21,27,-.95,.85);ctx.stroke();ctx.strokeStyle='#ff5577';ctx.lineWidth=2;ctx.beginPath();ctx.arc(X+28,Y+21,32,-.9,.7);ctx.stroke();ctx.globalAlpha=1}
    ctx.restore();
  }
  function drawEnemy(e){const x=e.x-cameraX;rect(x+4,e.y+5,20,25,'#4a2d4d');rect(x+1,e.y+13,26,13,'#c7445f');rect(x+5,e.y+4,18,13,'#ad3c57');rect(x+9,e.y+8,11,5,'#ffb36b');rect(x+3,e.y+27,8,7,'#202a3d');rect(x+18,e.y+27,8,7,'#202a3d');rect(x-3,e.y+16,5,7,'#ff7180')}
  function drawBoss(){if(!boss.alive){return}const x=boss.x-cameraX,y=boss.y;ctx.save();if(boss.flash>0&&Math.floor(boss.flash*60)%2)ctx.globalAlpha=.45;rect(x+9,y+8,46,74,'#432c4b');rect(x+5,y+20,54,46,'#9b3b58');rect(x+14,y+3,37,29,'#c14a64');rect(x+19,y+10,27,10,'#fb9b74');rect(x+23,y+13,6,3,'#fff0c1');rect(x+37,y+13,6,3,'#fff0c1');rect(x+0,y+26,15,13,'#d94c60');rect(x+49,y+26,15,13,'#d94c60');rect(x+13,y+62,15,27,'#27354a');rect(x+38,y+62,15,27,'#27354a');rect(x+17,y+38,32,8,'#672d4f');rect(x+23,y+53,16,6,'#ffc252');ctx.restore();rect(x-7,y-14,78,6,'#263244');rect(x-5,y-12,74*Math.max(0,boss.hp/boss.maxHp),2,'#ff5971');ctx.fillStyle='#ffd2d9';ctx.font='10px monospace';ctx.fillText('IRON WARDEN',x-6,y-19)}
  function draw(){
    ctx.save();if(shake>0)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);drawBackground();
    // cloud strata and distant rails
    for(let i=0;i<5;i++){const x=((i*270-cameraX*.2)%1150+1150)%1150;rect(x,244+i%2*20,94,2,'#39809a55');rect(x+20,230+i%2*20,3,18,'#39809a55')}
    platforms.forEach(drawPlatform);
    for(const item of pickups)if(!item.got){const x=item.x-cameraX;const pulse=Math.sin(clock*4)*3;ctx.globalAlpha=.35;ctx.beginPath();ctx.arc(x+8,item.y+8,12+pulse,0,Math.PI*2);ctx.fillStyle=item.kind==='heart'?'#ff8b9b':'#8bffbd';ctx.fill();ctx.globalAlpha=1;rect(x+3,item.y+3,10,10,item.kind==='heart'?'#ff8294':'#7effb2');rect(x+6,item.y+1,4,14,'#f3ffff');rect(x+1,item.y+6,14,4,'#f3ffff')}
    enemies.forEach(e=>e.alive&&drawEnemy(e));drawBoss();
    shots.forEach(s=>{if(s.enemy){rect(s.x-cameraX,s.y,16,16,'#fb5266');rect(s.x-cameraX+4,s.y+4,8,8,'#ffd092')}else{rect(s.x-cameraX,s.y,s.w,s.h,s.charged?'#c2fff8':'#eaffff');rect(s.x-cameraX+2,s.y+2,s.w-4,s.h-4,s.charged?'#41dcff':'#36baff')}});
    particles.forEach(a=>{ctx.globalAlpha=Math.max(0,a.life*2);rect(a.x-cameraX,a.y,a.size,a.size,a.color);ctx.globalAlpha=1});
    drawHero(player.x-cameraX,player.y,activeHero,player.face,player.anim,player.slash,player.inv,player.dash);
    ctx.restore();drawHUD();
    if(state==='title')drawTitle();if(state==='paused')drawOverlay('PAUSED','Press P / START to resume','');if(state==='dead')drawOverlay('SYSTEM FAILURE','Your armor is depleted.','PRESS ENTER OR TAP TO RETRY');if(state==='win')drawOverlay('WARDEN DOWN','You cleared the sector. DATA '+score,'PRESS ENTER OR TAP TO RUN AGAIN');
  }
  function drawHUD(){
    rect(17,15,234,64,'#081421dd');rect(17,15,234,2,'#46dafa');ctx.fillStyle='#e8f7ff';ctx.font='bold 14px monospace';ctx.fillText(activeHero===0?'X / PLASMA BUSTER':'ZERO / ENERGY SABER',29,37);
    for(let i=0;i<8;i++){rect(29+i*22,48,17,9,'#22364a');if(i<player.hp)rect(29+i*22,48,17,9,activeHero===0?'#52dfff':'#ffcc57')}
    ctx.fillStyle='#829caf';ctx.font='9px monospace';ctx.fillText('ARMOR',29,70);
    rect(760,15,183,45,'#081421dd');ctx.fillStyle='#7f9aad';ctx.font='9px monospace';ctx.fillText('MISSION DATA',773,32);ctx.fillStyle='#f0fbff';ctx.font='bold 15px monospace';ctx.fillText(String(score).padStart(6,'0'),773,51);
    // progress marker
    rect(282,22,380,3,'#203c50');rect(282,22,380*Math.min(1,player.x/(worldWidth-100)),3,'#41cce6');rect(282+380*Math.min(1,player.x/(worldWidth-100))-3,19,6,9,'#b7f9ff');
    ctx.fillStyle='#7190a3';ctx.font='8px monospace';ctx.fillText('SECTOR 01 · IRONWORKS',282,40);ctx.textAlign='right';ctx.fillText('BEST '+String(best).padStart(6,'0'),942,82);ctx.textAlign='left';
    if(activeHero===0&&player.charge>.35){rect(29,82,Math.min(90,player.charge*70),3,'#42ddff')}
  }
  function drawTitle(){ctx.fillStyle='#05111be8';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#34d7f0';ctx.globalAlpha=.5;ctx.strokeRect(26,25,W-52,H-50);ctx.globalAlpha=1;
    ctx.fillStyle='#44dffc';ctx.font='bold 12px monospace';ctx.fillText('A DUAL-CORE FAN-MADE ACTION PLATFORMER',58,77);
    ctx.fillStyle='#edfaff';ctx.font='900 62px Impact, "Arial Narrow", sans-serif';ctx.fillText('REPL0ID',56,151);ctx.fillStyle='#54ddff';ctx.fillText('REBELLION',56,208);
    ctx.fillStyle='#8da9bb';ctx.font='13px monospace';ctx.fillText('Two hunters. One machine uprising.',60,239);
    drawHero(675,206,0,1,clock,0,0);drawHero(784,206,1,1,clock+1,0,0);
    rect(60,277,388,1,'#294357');ctx.fillStyle='#a7bfce';ctx.font='11px monospace';ctx.fillText('X  ·  hold FIRE to charge a piercing plasma shot',60,305);ctx.fillText('ZERO · close the gap and carve with the energy saber',60,331);ctx.fillText('Q / Y  ·  swap hunters anytime · pickups restore armor',60,357);
    ctx.fillStyle='#59e2ff';ctx.font='bold 15px monospace';ctx.fillText('▶  PRESS ENTER / SPACE OR TAP TO DEPLOY',60,414);
    ctx.fillStyle='#7892a6';ctx.font='9px monospace';ctx.fillText('KEYBOARD: A/D MOVE · SPACE JUMP · J FIRE · K DASH · Q SWAP',60,448);ctx.fillText('CONTROLLER: LEFT STICK / D-PAD · A JUMP · X FIRE · B DASH · Y SWAP',60,468);
    ctx.textAlign='right';ctx.fillStyle='#e6c46a';ctx.fillText('BEST DATA  '+String(best).padStart(6,'0'),899,500);ctx.textAlign='left';
  }
  function drawOverlay(title,subtitle,action){ctx.fillStyle='#06121bdd';ctx.fillRect(0,0,W,H);ctx.strokeStyle=state==='win'?'#f4cb69':'#4bd9f1';ctx.lineWidth=1;ctx.strokeRect(225,164,510,200);ctx.textAlign='center';ctx.fillStyle=state==='win'?'#ffdc7f':'#e6f9ff';ctx.font='bold 32px Impact, sans-serif';ctx.fillText(title,W/2,227);ctx.fillStyle='#9cb6c5';ctx.font='13px monospace';ctx.fillText(subtitle,W/2,261);ctx.fillStyle='#48dcfa';ctx.font='bold 11px monospace';ctx.fillText(action||'PRESS P / START TO RESUME',W/2,313);ctx.textAlign='left'}
  function frame(t){const dt=(t-last)/1000||0;last=t;update(dt);draw();requestAnimationFrame(frame)}
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')togglePause()});
  window.addEventListener('gamepadconnected',()=>{readout.textContent='Controller connected · ready to deploy.'});
})();
