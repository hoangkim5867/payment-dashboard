/* CSCEC MEP Index · 2026 Christmas Scroll Edition
 * Additive UI only. All original links, Firebase authentication, permissions,
 * translations and chat handlers are left in place.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const workspace = document.querySelector('.workspace');
  const originalHeading = workspace?.querySelector('.heading');
  const grid = workspace?.querySelector('.grid');
  const langSwitcher = document.getElementById('langSwitch');
  const topbar = document.querySelector('.topbar');
  if (!workspace || !originalHeading || !grid || !langSwitcher || !topbar) return;

  const strings = {
    vi: {
      mode:'Chế độ Noel', turnOn:'Bật chế độ Noel', turnOff:'Tắt chế độ Noel',
      kicker:'WINTER EDITION · 2026', line1:'Merry',line2:'Christmas.',
      intro:'Giữa bộn bề công việc, vẫn có những khoảnh khắc lung linh.',
      action:'Khám phá chức năng',hint:'Cuộn để khám phá',
      chapter:'01  /  KHÔNG GIAN LÀM VIỆC',
      functionsIntro:'Mọi công cụ, trong một không gian.',
      detail:'',
      finaleKicker:'CSCEC MEP · HOLIDAY SEASON',
      finaleTitle:'Khi mùa lễ hội thắp sáng những ngày cuối năm.',
      finaleDesc:'',
      back:'Trở lại các chức năng',footer:'CSCEC MEP · CHÚC MỘT MÙA GIÁNG SINH AN LÀNH'
    },
    zh: {
      mode:'圣诞模式',turnOn:'开启圣诞模式',turnOff:'关闭圣诞模式',
      kicker:'冬季特别版 · 2026',line1:'Merry',line2:'Christmas.',
      intro:'忙碌的工作中，也藏着闪闪发光的小美好。',
      action:'浏览功能',hint:'向下滚动',
      chapter:'01  /  工作空间',
      functionsIntro:'所有工具，尽在一处。',
      detail:'',
      finaleKicker:'CSCEC MEP · 圣诞季',
      finaleTitle:'当节日的灯火点亮岁末时光。',
      finaleDesc:'',
      back:'返回功能区',footer:'CSCEC MEP · 圣诞快乐'
    },
    en: {
      mode:'Christmas mode',turnOn:'Turn Christmas mode on',turnOff:'Turn Christmas mode off',
      kicker:'WINTER EDITION · 2026',line1:'Merry',line2:'Christmas.',
      intro:'Even in the midst of busy days, little moments still sparkle.',
      action:'Explore workspace',hint:'Scroll to explore',
      chapter:'01  /  YOUR WORKSPACE',
      functionsIntro:'Every tool, one workspace.',
      detail:'',
      finaleKicker:'CSCEC MEP · HOLIDAY SEASON',
      finaleTitle:"When festive lights brighten the year's final days.",
      finaleDesc:'',
      back:'Back to functions',footer:'CSCEC MEP · WISHING YOU A MERRY CHRISTMAS'
    }
  };
  const KEY='cscec_index_noel_scroll_2026';
  const readLanguage=()=>{
    const active=langSwitcher.querySelector('[data-lang].active')?.getAttribute('data-lang');
    if (['vi','zh','en'].includes(active)) return active;
    let stored='vi';
    try {stored=localStorage.getItem('cscec_home_language_v1')||'vi';} catch(_){}
    return strings[stored]?stored:'vi';
  };
  const getText=key=>(strings[readLanguage()]||strings.vi)[key];

  const toggle=document.createElement('button');
  toggle.id='noelScrollToggle';toggle.type='button';toggle.className='noel-scroll-toggle';
  toggle.innerHTML='<span aria-hidden="true" class="noel-switch-icon">✦</span><span class="noel-toggle-label"></span><span aria-hidden="true" class="noel-switch-track"><span class="noel-switch-knob"></span></span>';
  langSwitcher.after(toggle);

  const progress=document.createElement('div');
  progress.className='noel-scroll-progress';progress.setAttribute('aria-hidden','true');
  document.body.append(progress);

  const hero=document.createElement('section');hero.className='noel-hero';hero.id='noelWelcome';
  hero.innerHTML=`<div class="noel-hero-photo" aria-hidden="true"></div>
    <div class="noel-snow-layer" aria-hidden="true"></div>
    <div class="noel-hero-content">
      <div class="noel-overline"><span class="noel-line"></span><span data-noel-text="kicker"></span></div>
      <h2 class="noel-headline"><span data-noel-text="line1"></span><span class="noel-accent" data-noel-text="line2"></span></h2>
      <p class="noel-hero-lead" data-noel-text="intro"></p>
      <div class="noel-hero-actions"><button type="button" class="noel-hero-cta" id="noelExplore"><span data-noel-text="action"></span><span aria-hidden="true">↗</span></button><span class="noel-hero-caption">CSCEC MEP / 2026</span></div>
    </div><div class="noel-scroll-hint"><span data-noel-text="hint"></span></div>`;
  workspace.prepend(hero);

  const sections=document.createElement('section');
  sections.className='noel-functions-wrap';sections.id='noelFunctions';
  workspace.insertBefore(sections,originalHeading);
  const eyebrow=document.createElement('div');eyebrow.className='noel-functions-eyebrow noel-reveal';eyebrow.setAttribute('data-noel-text','chapter');
  sections.append(eyebrow,originalHeading,grid);
  // Original heading and all original cards are reused, never copied or rendered in an image.
  grid.querySelectorAll('.card').forEach((card,i)=>{
    card.classList.add('noel-reveal');
    if(i===0){const deco=document.createElement('span');deco.className='noel-card-accent';deco.textContent='✧';deco.setAttribute('aria-hidden','true');card.append(deco);}
  });
  originalHeading.classList.add('noel-reveal');

  // Keep the original evergreen closing section, with a fresh message and restrained festive shimmer.
  const ending=document.createElement('section');ending.className='noel-ending noel-reveal';
  ending.innerHTML='<div class="noel-ending-kicker" data-noel-text="finaleKicker"></div><h2 class="noel-ending-title" data-noel-text="finaleTitle"></h2><div class="noel-ending-stars" aria-hidden="true">✦ &nbsp; ✧ &nbsp; ✦</div><button class="noel-ending-btn" type="button" id="noelBack" data-noel-text="back"></button>';
  workspace.append(ending);
  const footer=document.createElement('div');footer.className='noel-bottom-cue';footer.setAttribute('data-noel-text','footer');workspace.append(footer);

  // Lightweight snowfall in the hero alone (never a screenshot overlay, never covers controls).
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const snowLayer=hero.querySelector('.noel-snow-layer');
    const fragment=document.createDocumentFragment();
    for(let i=0;i<24;i++){
      const el=document.createElement('i');
      el.style.setProperty('--left',((i*43+19)%100)+'%');
      el.style.setProperty('--size',(i%4===0?3:2)+'px');
      el.style.setProperty('--dur',(10+i%13)+'s');
      el.style.setProperty('--delay','-'+((i*11)%17)+'s');
      el.style.setProperty('--drift',((i%2?1:-1)*(15+i%35))+'px');
      fragment.append(el);
    }
    snowLayer.append(fragment);
  }

  let enabled=true;
  try{
    const stored=localStorage.getItem(KEY);
    enabled=stored==='1'?true:stored==='0'?false:[10,11].includes(new Date().getMonth());
  }catch(_){enabled=true;}

  const motionReduce=matchMedia('(prefers-reduced-motion: reduce)');
  const revealItems=[eyebrow,originalHeading,...grid.querySelectorAll('.card'),ending];
  let observer=null;
  const startReveals=()=>{
    if(motionReduce.matches||!('IntersectionObserver' in window)){
      revealItems.forEach(el=>el.classList.add('is-visible'));return;
    }
    if(observer)observer.disconnect();
    observer=new IntersectionObserver(entries=>{
      for(const entry of entries){if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}
    },{threshold:.08,rootMargin:'0px 0px -18px 0px'});
    revealItems.forEach(el=>observer.observe(el));
  };
  const translate=()=>{
    document.querySelectorAll('[data-noel-text]').forEach(el=>{
      const key=el.getAttribute('data-noel-text');
      if(key==='line1'||key==='line2'||typeof getText(key)==='string') el.textContent=getText(key)||'';
    });
    toggle.querySelector('.noel-toggle-label').textContent=getText('mode');
    toggle.setAttribute('aria-label',enabled?getText('turnOff'):getText('turnOn'));
    toggle.title=enabled?getText('turnOff'):getText('turnOn');
  };
  let raf=0;
  function onScroll(){
    if(!enabled||raf)return;
    raf=requestAnimationFrame(()=>{
      raf=0;
      const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);
      root.style.setProperty('--noel-progress',Math.max(0,Math.min(1,scrollY/max)).toFixed(4));
      if(!motionReduce.matches&&innerWidth>740){
        root.style.setProperty('--noel-parallax',Math.min(145,scrollY*.19).toFixed(1)+'px');
      }
    });
  }
  const apply=()=>{
    root.classList.toggle('noel-motion-on',enabled);
    toggle.setAttribute('aria-pressed',String(enabled));
    translate();
    if(enabled){startReveals();onScroll();}
  };
  toggle.addEventListener('click',()=>{
    enabled=!enabled;
    try{localStorage.setItem(KEY,enabled?'1':'0');}catch(_){}
    apply();
    window.scrollTo({top:0,behavior:'instant'});
  });
  document.getElementById('noelExplore')?.addEventListener('click',()=>sections.scrollIntoView({behavior:motionReduce.matches?'instant':'smooth',block:'start'}));
  document.getElementById('noelBack')?.addEventListener('click',()=>sections.scrollIntoView({behavior:motionReduce.matches?'instant':'smooth',block:'start'}));
  // Original language handler runs in the existing script. Refresh this module afterward.
  langSwitcher.addEventListener('click',event=>{if(event.target.closest('[data-lang]'))setTimeout(translate,0);});
  const activeLangObserver=new MutationObserver(translate);
  activeLangObserver.observe(langSwitcher,{subtree:true,attributes:true,attributeFilter:['class']});
  addEventListener('scroll',onScroll,{passive:true});
  addEventListener('resize',onScroll,{passive:true});
  apply();
})();