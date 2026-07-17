(() => {
  const root = document.querySelector('.tour');
  if (!root) return;

  const isSage = root.dataset.variant === 'sage';
  const folder = isSage ? 'assets/tour-cream-sage/' : 'assets/tour-cream-lime/';
  const palette = isSage
    ? ['奶油烤漆', '鼠尾草绿', '奶油洞石', '香槟金']
    : ['暖奶油色', '青柠灰绿', '奶油大理石', '香槟金'];
  const scenes = [
    ['entry', '入户玄关', '入户收纳贴墙展开，镜面、石材薄台与灯带建立第一视线，原中央走廊完整保留。'],
    ['dining', '餐厅', '椭圆奶油大理石餐桌配轻薄皮革餐椅，餐边柜以低饱和绿色控制视觉重心。'],
    ['living', '客厅', '象牙白皮革沙发、石材茶几和整面护墙形成开阔公共区，不挤占通往阳台及卧室的动线。'],
    ['north-balcony', '北向休闲阳台', '轻量休闲椅、石材边几与一体花池保留采光，让室内外材质连续。'],
    ['elder-bedroom', '老人房', '软包床、圆角边几及连续夜间照明兼顾安静质感和长辈通行安全。'],
    ['elder-ensuite', '老人房独立卫浴', '无门槛淋浴、坐凳和扶手与浅色防滑石材整合，保留安全转身空间。'],
    ['kitchen', '厨房', '奶油柜体与低饱和绿色下柜组织双排操作面，设备、门窗和工作通道均按原位置保留。'],
    ['storage-room', '杂物间', '1.8米恒温恒湿雪茄柜与清洁收纳并列，自动上下水扫地机器人基站及检修空间清晰可见。'],
    ['south-utility-balcony', '南向生活阳台', '洗烘、清洁池、晾晒与耐水储物柜统一收纳，家务动线保持清爽。'],
    ['secondary-bathroom', '次卫', '洗漱、如厕与淋浴沿原狭长空间有序展开，用浅色石材降低切割感。'],
    ['secondary-bedroom', '次卧', '皮革软包床、窗边书桌和整墙柜构成完整居住功能，绿色只作局部层次。'],
    ['primary-bedroom', '主卧', '低对比软包、奶油墙板与大理石边几形成安静套房，衣帽间入口保持通透。'],
    ['walk-in-closet', '衣帽间', '玻璃衣柜、香槟金框和小型石材中岛保留双侧通行，抽屉以低饱和绿色收束。'],
    ['primary-bathroom', '主卫', '双台盆、无门槛淋浴与浅色石材统一材质体系，悬浮柜体减轻体量。']
  ].map(([id, name, desc]) => ({
    id,
    name,
    desc,
    image: `${folder}${id === 'south-utility-balcony' ? 'south-utility-balcony' : id}.jpg`
  }));

  const imgA = document.querySelector('#scene-a');
  const imgB = document.querySelector('#scene-b');
  const backdrop = document.querySelector('#backdrop');
  const title = document.querySelector('#scene-title');
  const description = document.querySelector('#scene-description');
  const counter = document.querySelector('#counter');
  const materials = document.querySelector('#materials');
  const dock = document.querySelector('#dock');
  const progress = document.querySelector('#progress');
  const auto = document.querySelector('#auto');
  const plan = document.querySelector('#plan');
  let index = 0;
  let front = imgA;
  let back = imgB;
  let autoTimer = null;

  materials.replaceChildren(...palette.map(label => {
    const span = document.createElement('span');
    span.textContent = label;
    return span;
  }));

  scenes.forEach((scene, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'room-button';
    button.textContent = scene.name;
    button.addEventListener('click', () => show(i));
    dock.appendChild(button);
  });

  function show(next, immediate = false) {
    index = (next + scenes.length) % scenes.length;
    const scene = scenes[index];
    const incoming = back;
    const outgoing = front;
    incoming.src = scene.image;
    incoming.alt = `${scene.name}效果图`;
    backdrop.src = scene.image;
    const activate = () => {
      outgoing.classList.remove('active');
      incoming.classList.add('active');
      front = incoming;
      back = outgoing;
    };
    incoming.onload = activate;
    if (immediate || incoming.complete) activate();
    title.textContent = scene.name;
    description.textContent = scene.desc;
    counter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`;
    progress.style.width = `${(index + 1) / scenes.length * 100}%`;
    [...dock.children].forEach((button, i) => button.classList.toggle('active', i === index));
    const selected = dock.children[index];
    dock.scrollTo({ left: Math.max(0, selected.offsetLeft - dock.clientWidth / 2 + selected.offsetWidth / 2), behavior: 'smooth' });
    if (auto.getAttribute('aria-pressed') === 'true') restartAuto();
  }

  function restartAuto() {
    clearInterval(autoTimer);
    if (auto.getAttribute('aria-pressed') !== 'true') return;
    autoTimer = setInterval(() => show(index + 1), 6500);
  }

  document.querySelector('#prev').addEventListener('click', () => show(index - 1));
  document.querySelector('#next').addEventListener('click', () => show(index + 1));
  document.querySelector('#plan-open').addEventListener('click', () => plan.classList.add('open'));
  document.querySelector('#plan-close').addEventListener('click', () => plan.classList.remove('open'));
  document.querySelector('#fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) root.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
  auto.addEventListener('click', () => {
    const active = auto.getAttribute('aria-pressed') !== 'true';
    auto.setAttribute('aria-pressed', String(active));
    auto.textContent = active ? '暂停巡游' : '自动巡游';
    restartAuto();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') show(index + 1);
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'Escape') plan.classList.remove('open');
  });

  scenes.slice(1).forEach(scene => {
    const image = new Image();
    image.src = scene.image;
  });
  show(0, true);
})();
