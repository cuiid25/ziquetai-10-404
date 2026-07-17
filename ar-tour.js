import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const shell = document.querySelector('#ar-shell');
const canvas = document.querySelector('#ar-canvas');
const cameraVideo = document.querySelector('#ar-camera');
const loading = document.querySelector('#loading');
const roomName = document.querySelector('#room-name');
const roomHint = document.querySelector('#room-hint');
const debugState = document.querySelector('#debug-state');
const arModeButton = document.querySelector('#ar-mode');
const controlHelp = document.querySelector('#control-help');
const modal = document.querySelector('#scene-modal');
const sceneImage = document.querySelector('#scene-image');
const sceneName = document.querySelector('#scene-name');
const minimap = document.querySelector('#minimap');
const mapContext = minimap.getContext('2d');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9cfbd);
scene.fog = new THREE.FogExp2(0xd9cfbd, 0.018);
const normalFog = scene.fog;

const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, 0.08, 80);
camera.position.set(5.4, 1.62, 3.15);
camera.rotation.order = 'YXZ';
camera.rotation.y = 0;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');

const controls = new PointerLockControls(camera, document.body);
const apartmentGroup = new THREE.Group();
scene.add(apartmentGroup);
const clock = new THREE.Clock();
const colliders = [];
const markerMeshes = [];
const paintables = [];
const arHidden = [];
const keys = new Set();
let currentPalette = new URLSearchParams(location.search).get('palette') === 'sage' ? 'sage' : 'lime';
let currentRoom = null;
let touchLook = null;
let cameraFallbackActive = false;
let fallbackStream = null;
let normalCameraState = null;
let nativeARSupported = false;
let orientationActive = false;

const palettes = {
  lime: {
    wall: 0xf3ecdf,
    wallAccent: 0xb7b36a,
    floor: 0xcdb18d,
    floorLight: 0xeadfca,
    stone: 0xeee6d7,
    metal: 0xb69558,
    leather: 0xece4d8,
    textile: 0xc5c071,
    dark: 0x3d392d,
    sky: 0xd9cfbd,
    marker: 0xd6d065
  },
  sage: {
    wall: 0xf0e8da,
    wallAccent: 0x85896b,
    floor: 0xc6aa86,
    floorLight: 0xe6dcc9,
    stone: 0xe9e0cf,
    metal: 0xb18f58,
    leather: 0xe9e1d5,
    textile: 0x929579,
    dark: 0x383a30,
    sky: 0xd4cbb9,
    marker: 0x98a071
  }
};

const rooms = [
  { id:'entry', name:'入户玄关', x:5.5, z:3.0, w:4.7, d:2.4 },
  { id:'dining', name:'餐厅', x:1.1, z:2.5, w:4.3, d:3.6 },
  { id:'living', name:'客厅', x:1.4, z:-3.1, w:5.0, d:5.5 },
  { id:'north-balcony', name:'北向休闲阳台', x:1.4, z:-7.0, w:5.0, d:1.7 },
  { id:'elder-bedroom', name:'老人房', x:6.0, z:-3.5, w:3.8, d:4.8 },
  { id:'elder-ensuite', name:'老人房独立卫浴', x:6.0, z:0.3, w:3.8, d:2.1 },
  { id:'kitchen', name:'厨房', x:5.7, z:5.4, w:4.1, d:3.8 },
  { id:'storage-room', name:'杂物间', x:0.2, z:5.3, w:2.5, d:2.4 },
  { id:'south-utility-balcony', name:'南向生活阳台', x:1.6, z:7.15, w:4.5, d:1.5 },
  { id:'secondary-bathroom', name:'次卫', x:-2.05, z:3.3, w:1.7, d:2.6 },
  { id:'secondary-bedroom', name:'次卧', x:-5.5, z:3.6, w:4.7, d:4.5 },
  { id:'primary-bedroom', name:'主卧', x:-5.5, z:-5.0, w:4.7, d:5.8 },
  { id:'walk-in-closet', name:'衣帽间', x:-2.05, z:-6.3, w:1.7, d:2.7 },
  { id:'primary-bathroom', name:'主卫', x:-2.05, z:-3.1, w:1.7, d:2.7 }
];

function material(kind, options = {}) {
  const color = palettes[currentPalette][kind];
  const result = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? .64,
    metalness: options.metalness ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide
  });
  if (!options.fixed) paintables.push({ material: result, kind });
  return result;
}

function box(x, y, z, w, h, d, kind, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(kind, options));
  mesh.position.set(x, y, z);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = true;
  apartmentGroup.add(mesh);
  return mesh;
}

function addWall(x, z, w, d, kind = 'wall', collidable = true) {
  const mesh = box(x, 1.45, z, w, 2.9, d, kind, { roughness: .82 });
  arHidden.push(mesh);
  if (collidable) colliders.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 });
  return mesh;
}

function addWallX(z, x1, x2, gap1 = null, gap2 = null, kind = 'wall') {
  if (gap1 === null || gap2 === null) return addWall((x1+x2)/2, z, x2-x1, .16, kind);
  if (gap1 > x1) addWall((x1+gap1)/2, z, gap1-x1, .16, kind);
  if (gap2 < x2) addWall((gap2+x2)/2, z, x2-gap2, .16, kind);
}

function addWallZ(x, z1, z2, gap1 = null, gap2 = null, kind = 'wall') {
  if (gap1 === null || gap2 === null) return addWall(x, (z1+z2)/2, .16, z2-z1, kind);
  if (gap1 > z1) addWall(x, (z1+gap1)/2, .16, gap1-z1, kind);
  if (gap2 < z2) addWall(x, (gap2+z2)/2, .16, z2-gap2, kind);
}

function cylinder(x, y, z, radius, height, kind, options = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 40), material(kind, options));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  apartmentGroup.add(mesh);
  return mesh;
}

function makeLabel(text, x, z) {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 128;
  const context = labelCanvas.getContext('2d');
  context.fillStyle = 'rgba(27,25,19,.82)';
  context.beginPath();
  context.roundRect(14, 14, 484, 100, 28);
  context.fill();
  context.fillStyle = '#fffaf0';
  context.font = '500 42px -apple-system, BlinkMacSystemFont, PingFang SC, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:texture, transparent:true, depthTest:false }));
  sprite.position.set(x, 2.25, z);
  sprite.scale.set(2.4, .6, 1);
  apartmentGroup.add(sprite);
  arHidden.push(sprite);
}

function addBed(x, z, rotation = 0) {
  const group = new THREE.Group();
  const base = box(0, .32, 0, 2.25, .42, 2.25, 'leather', { roughness:.72 });
  const mattress = box(0, .58, 0, 2.1, .25, 2.08, 'wall', { roughness:.9 });
  const head = box(0, 1.08, 1.03, 2.2, 1.15, .18, 'textile', { roughness:.9 });
  [base, mattress, head].forEach(mesh => { scene.remove(mesh); group.add(mesh); });
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  apartmentGroup.add(group);
}

function addChair(x, z, rotation = 0, kind = 'textile') {
  const group = new THREE.Group();
  const seat = box(0, .48, 0, .72, .18, .72, kind, { roughness:.78 });
  const back = box(0, .9, .29, .72, .82, .14, kind, { roughness:.78 });
  const leg1 = box(-.26, .24, 0, .06, .45, .06, 'metal', { metalness:.75, roughness:.25 });
  const leg2 = box(.26, .24, 0, .06, .45, .06, 'metal', { metalness:.75, roughness:.25 });
  [seat, back, leg1, leg2].forEach(mesh => { scene.remove(mesh); group.add(mesh); });
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  apartmentGroup.add(group);
}

function buildApartment() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), material('floorLight', { roughness:.85, side:THREE.DoubleSide }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  apartmentGroup.add(floor);
  arHidden.push(floor);

  addWall(0, -8, 16, .22);
  addWall(0, 8, 16, .22);
  addWall(-8, 0, .22, 16);
  addWall(8, 0, .22, 16);

  addWall(-3, -6.65, .16, 2.7);
  addWall(-3, -2.5, .16, 3.2);
  addWall(-3, 1.3, .16, 1.9);
  addWall(-3, 4.78, .16, 2.65);
  addWall(-3, 7.63, .16, .75);
  addWall(4, -6.58, .16, 2.85);
  addWall(4, -2.38, .16, 3.15);
  addWall(4, 1.3, .16, 1.9);
  addWall(4, 4.78, .16, 2.65);
  addWall(4, 7.63, .16, .75);

  addWallX(-2, -8, -3, -4.6, -3.6);
  addWallX(1, -8, -3, -4.6, -3.6);
  addWallX(6, -8, -3, -4.6, -3.6);
  addWallX(-5, -3, -.95, -2.35, -1.35, 'wallAccent');
  addWallX(-2, -3, -.95, -2.35, -1.35);
  addWallX(1, 4, 8, 5.35, 6.45);
  addWallX(3.8, 4, 8, 5.15, 6.25, 'wallAccent');
  addWallX(6.6, -1.1, 4, .55, 1.55);

  rooms.forEach(room => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.28, .035, 12, 40),
      material('marker', { metalness:.18, roughness:.35 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(room.x, .035, room.z);
    apartmentGroup.add(ring);
    arHidden.push(ring);
    markerMeshes.push(ring);
    makeLabel(room.name, room.x, room.z);
  });

  // Living room
  box(.2, .44, -3.25, 2.7, .75, .92, 'leather', { roughness:.72 });
  box(-.72, .44, -2.45, .85, .75, .95, 'leather', { roughness:.72 });
  box(3.78, 1.1, -3.15, .12, 1.5, 2.4, 'dark', { roughness:.28 });
  cylinder(1.25, .24, -2.0, .62, .38, 'stone', { roughness:.38 });
  cylinder(2.15, .2, -2.4, .48, .32, 'wallAccent', { roughness:.42 });
  addChair(2.55, -4.85, -.7, 'textile');

  // Dining
  const diningTop = new THREE.Mesh(new THREE.CylinderGeometry(.92, .92, .12, 48), material('stone', { roughness:.32 }));
  diningTop.scale.set(1.55, 1, 1);
  diningTop.position.set(1.05, .78, 2.55);
  diningTop.castShadow = true;
  apartmentGroup.add(diningTop);
  cylinder(1.05, .4, 2.55, .38, .7, 'metal', { metalness:.65, roughness:.3 });
  [[-.2,2.55,Math.PI/2],[2.3,2.55,-Math.PI/2],[.2,1.65,0],[1.9,1.65,0],[.2,3.45,Math.PI],[1.9,3.45,Math.PI]].forEach(([x,z,r]) => addChair(x,z,r,'leather'));

  // Bedrooms and wardrobes
  addBed(-5.55, -5.0, Math.PI);
  addBed(-5.55, 3.55, Math.PI);
  addBed(6.0, -3.55, Math.PI);
  box(-7.55, 1.4, -4.9, .62, 2.75, 3.8, 'wall', { roughness:.76 });
  box(-7.55, 1.4, 3.6, .62, 2.75, 3.6, 'wall', { roughness:.76 });
  box(7.55, 1.4, -3.5, .62, 2.75, 3.5, 'wall', { roughness:.76 });

  // Walk-in closet
  box(-2.72, 1.25, -6.35, .42, 2.45, 2.6, 'wallAccent', { roughness:.6 });
  box(-1.38, 1.25, -6.35, .42, 2.45, 2.6, 'wall', { roughness:.6 });
  box(-2.05, .48, -6.35, .72, .85, 1.4, 'stone', { roughness:.35 });

  // Bathrooms
  box(-2.55, .55, -3.2, .72, .82, 1.65, 'stone', { roughness:.35 });
  box(-1.4, 1.1, -3.7, .05, 2.0, 1.45, 'wallAccent', { transparent:true, opacity:.36, fixed:true, roughness:.18 });
  box(5.1, .55, .3, .72, .82, 1.7, 'stone', { roughness:.35 });
  box(6.95, .42, .25, 1.25, .4, .78, 'stone', { roughness:.35 });
  box(6.95, 1.05, -.15, 1.2, 1.15, .12, 'wallAccent', { roughness:.75 });

  // Kitchen
  box(4.65, .48, 5.35, .65, .92, 3.9, 'wallAccent', { roughness:.56 });
  box(6.95, .48, 5.35, .65, .92, 3.9, 'wallAccent', { roughness:.56 });
  box(4.65, 1.0, 5.35, .74, .12, 3.95, 'stone', { roughness:.3 });
  box(6.95, 1.0, 5.35, .74, .12, 3.95, 'stone', { roughness:.3 });

  // Storage room: 1.8m cigar cabinet and robot dock
  const cigar = box(-.55, .95, 5.25, .72, 1.9, .62, 'dark', { roughness:.25 });
  cigar.material.metalness = .15;
  for (let y=.25; y<1.7; y+=.25) box(-.55, y, 4.91, .58, .025, .04, 'metal', { metalness:.58, roughness:.3 });
  box(.65, 1.12, 5.72, 1.0, 2.2, .5, 'wallAccent', { roughness:.55 });
  box(.65, .32, 4.95, .62, .65, .52, 'wall', { roughness:.45 });
  cylinder(.65, .08, 4.56, .22, .11, 'wall', { roughness:.35 });

  // South utility balcony
  cylinder(1.05, .46, 7.35, .38, .9, 'dark', { roughness:.3 });
  cylinder(1.05, 1.38, 7.35, .38, .9, 'dark', { roughness:.3 });
  box(2.4, .48, 7.45, 1.45, .92, .62, 'wallAccent', { roughness:.56 });

  // Entry
  box(7.55, 1.42, 3.0, .5, 2.75, 2.2, 'wall', { roughness:.76 });
  box(4.45, .76, 3.45, 1.65, .12, .42, 'stone', { roughness:.32 });
  box(4.45, 1.65, 3.48, 1.65, 1.65, .04, 'metal', { metalness:.62, roughness:.22 });

  // Lighting
  const hemi = new THREE.HemisphereLight(0xfff5df, 0x6e6657, 2.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0cf, 4.6);
  sun.position.set(-4, 10, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  scene.add(sun);
  [[1,-3],[1,2],[6,-3],[-5,-5],[-5,4],[5,5]].forEach(([x,z]) => {
    const light = new THREE.PointLight(0xffc979, 5.5, 7, 2);
    light.position.set(x, 2.55, z);
    scene.add(light);
  });
}

function setPalette(name) {
  currentPalette = name;
  shell.dataset.palette = name;
  const colors = palettes[name];
  paintables.forEach(entry => entry.material.color.setHex(colors[entry.kind]));
  scene.background?.setHex(colors.sky);
  scene.fog?.color.setHex(colors.sky);
  document.querySelector('#palette-lime').classList.toggle('active', name === 'lime');
  document.querySelector('#palette-sage').classList.toggle('active', name === 'sage');
  if (modal.classList.contains('open')) openRoom(currentRoom);
}

function isBlocked(x, z) {
  const radius = .24;
  if (x < -7.62 || x > 7.62 || z < -7.62 || z > 7.62) return true;
  return colliders.some(c => x > c.minX-radius && x < c.maxX+radius && z > c.minZ-radius && z < c.maxZ+radius);
}

function moveCamera(dx, dz) {
  const nextX = camera.position.x + dx;
  const nextZ = camera.position.z + dz;
  if (!isBlocked(nextX, camera.position.z)) camera.position.x = nextX;
  if (!isBlocked(camera.position.x, nextZ)) camera.position.z = nextZ;
}

function nearestRoom() {
  let best = rooms[0];
  let distance = Infinity;
  for (const room of rooms) {
    const next = Math.hypot(camera.position.x-room.x, camera.position.z-room.z);
    if (next < distance) { best = room; distance = next; }
  }
  return { room:best, distance };
}

function openRoom(room = currentRoom) {
  if (!room) return;
  controls.unlock();
  sceneName.textContent = room.name;
  const filename = room.id === 'south-utility-balcony' ? 'south-utility-balcony' : room.id;
  sceneImage.src = `assets/tour-cream-${currentPalette}/${filename}.jpg`;
  sceneImage.alt = `${room.name}高清家装效果图`;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeRoom() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function saveNormalCamera() {
  if (normalCameraState) return;
  normalCameraState = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone()
  };
}

function prepareARScene() {
  saveNormalCamera();
  controls.unlock();
  keys.clear();
  scene.background = null;
  scene.fog = null;
  renderer.setClearAlpha(0);
  apartmentGroup.position.set(-5.4, 0, -3.15);
  arHidden.forEach(object => { object.visible = false; });
  shell.classList.add('ar-active');
  arModeButton.textContent = '退出AR实景';
  controlHelp.textContent = 'AR模式已开启：移动手机查看实景叠加；退出后可继续电脑3D行走。';
}

function onDeviceOrientation(event) {
  if (!orientationActive || renderer.xr.isPresenting) return;
  const alpha = THREE.MathUtils.degToRad(event.alpha || 0);
  const beta = THREE.MathUtils.degToRad(event.beta || 0);
  const gamma = THREE.MathUtils.degToRad(event.gamma || 0);
  const screenAngle = THREE.MathUtils.degToRad(screen.orientation?.angle || window.orientation || 0);
  const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
  const q1 = new THREE.Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5));
  const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -screenAngle);
  camera.quaternion.setFromEuler(euler).multiply(q1).multiply(q0);
}

async function enableDeviceOrientation() {
  try {
    if (typeof window.DeviceOrientationEvent?.requestPermission === 'function') {
      const result = await window.DeviceOrientationEvent.requestPermission();
      orientationActive = result === 'granted';
    } else {
      orientationActive = 'DeviceOrientationEvent' in window;
    }
    if (orientationActive) window.addEventListener('deviceorientation', onDeviceOrientation);
  } catch {
    orientationActive = false;
  }
}

async function startCameraFallback() {
  try {
    fallbackStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal:'environment' }, width:{ ideal:1920 }, height:{ ideal:1080 } },
      audio: false
    });
    cameraVideo.srcObject = fallbackStream;
    await cameraVideo.play();
    prepareARScene();
    cameraFallbackActive = true;
    shell.classList.add('camera-ar');
    camera.position.set(0, 1.62, 0);
    camera.rotation.set(0, 0, 0);
    await enableDeviceOrientation();
  } catch (error) {
    roomHint.textContent = '无法开启摄像头，请在手机浏览器地址栏允许相机权限后重试。';
    arModeButton.textContent = '重试AR实景';
  }
}

function restoreStandardView() {
  fallbackStream?.getTracks().forEach(track => track.stop());
  fallbackStream = null;
  cameraVideo.srcObject = null;
  cameraFallbackActive = false;
  orientationActive = false;
  window.removeEventListener('deviceorientation', onDeviceOrientation);
  shell.classList.remove('camera-ar', 'ar-active');
  apartmentGroup.position.set(0, 0, 0);
  arHidden.forEach(object => { object.visible = true; });
  scene.background = new THREE.Color(palettes[currentPalette].sky);
  scene.fog = normalFog;
  scene.fog.color.setHex(palettes[currentPalette].sky);
  renderer.setClearAlpha(1);
  if (normalCameraState) {
    camera.position.copy(normalCameraState.position);
    camera.quaternion.copy(normalCameraState.quaternion);
  }
  normalCameraState = null;
  arModeButton.textContent = '进入AR实景';
  controlHelp.textContent = '手机点“进入AR实景”叠加摄像头；电脑可用方向键/WASD行走，鼠标环视。';
}

function updateMinimap() {
  const ctx = mapContext;
  const width = minimap.width;
  const scale = width / 18;
  const toX = x => width/2 + x*scale;
  const toY = z => width/2 + z*scale;
  ctx.clearRect(0, 0, width, width);
  ctx.fillStyle = 'rgba(23,22,17,.78)';
  ctx.fillRect(0, 0, width, width);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  rooms.forEach(room => {
    ctx.strokeRect(toX(room.x-room.w/2), toY(room.z-room.d/2), room.w*scale, room.d*scale);
  });
  ctx.fillStyle = currentPalette === 'lime' ? '#d6d065' : '#9da47a';
  ctx.beginPath();
  ctx.arc(toX(camera.position.x), toY(camera.position.z), 8, 0, Math.PI*2);
  ctx.fill();
  const yaw = camera.rotation.y;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(toX(camera.position.x), toY(camera.position.z));
  ctx.lineTo(toX(camera.position.x + Math.sin(yaw)*.8), toY(camera.position.z - Math.cos(yaw)*.8));
  ctx.stroke();
}

function animate() {
  const delta = Math.min(clock.getDelta(), .05);
  const yaw = camera.rotation.y;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const speed = 2.85 * delta;
  let movement = new THREE.Vector3();
  if (!renderer.xr.isPresenting && !cameraFallbackActive) {
    if (keys.has('ArrowUp') || keys.has('KeyW')) movement.addScaledVector(forward, speed);
    if (keys.has('ArrowDown') || keys.has('KeyS')) movement.addScaledVector(forward, -speed);
    if (keys.has('KeyA')) movement.addScaledVector(right, -speed);
    if (keys.has('KeyD')) movement.addScaledVector(right, speed);
    if (keys.has('ArrowLeft')) camera.rotation.y += 1.65 * delta;
    if (keys.has('ArrowRight')) camera.rotation.y -= 1.65 * delta;
    if (movement.lengthSq()) moveCamera(movement.x, movement.z);
  }

  const nearest = nearestRoom();
  currentRoom = nearest.room;
  roomName.textContent = nearest.room.name;
  roomHint.textContent = nearest.distance < 2.3
    ? '已到达 · 按 Enter 查看当前空间的高清效果图'
    : `距离 ${nearest.distance.toFixed(1)}m · 继续靠近或按 Enter 查看`;
  const time = performance.now() * .001;
  markerMeshes.forEach((marker, i) => {
    const pulse = 1 + Math.sin(time*2.2+i*.7)*.14;
    marker.scale.setScalar(pulse);
    marker.rotation.z += delta*.18;
  });
  debugState.value = JSON.stringify({
    palette: currentPalette,
    room: currentRoom.id,
    x: Number(camera.position.x.toFixed(2)),
    z: Number(camera.position.z.toFixed(2)),
    yaw: Number(camera.rotation.y.toFixed(2)),
    modal: modal.classList.contains('open')
  });
  updateMinimap();
  renderer.render(scene, camera);
}

function pressKey(code, active) {
  if (active) keys.add(code);
  else keys.delete(code);
}

function nudgeFromKey(code) {
  const yaw = camera.rotation.y;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  if (code === 'ArrowLeft') camera.rotation.y += .12;
  if (code === 'ArrowRight') camera.rotation.y -= .12;
  if (code === 'ArrowUp' || code === 'KeyW') moveCamera(forward.x * .22, forward.z * .22);
  if (code === 'ArrowDown' || code === 'KeyS') moveCamera(-forward.x * .22, -forward.z * .22);
  if (code === 'KeyA') moveCamera(-right.x * .22, -right.z * .22);
  if (code === 'KeyD') moveCamera(right.x * .22, right.z * .22);
}

document.addEventListener('keydown', event => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (!event.repeat && !renderer.xr.isPresenting && !cameraFallbackActive) nudgeFromKey(event.code);
  if (event.code === 'Enter') openRoom();
  if (event.code === 'Escape') closeRoom();
});
document.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

const nativeARButton = ARButton.createButton(renderer, {
  optionalFeatures: ['local-floor', 'dom-overlay'],
  domOverlay: { root:shell }
});
nativeARButton.style.position = 'fixed';
nativeARButton.style.left = '-9999px';
nativeARButton.style.top = '-9999px';
document.body.appendChild(nativeARButton);
navigator.xr?.isSessionSupported('immersive-ar')
  .then(supported => { nativeARSupported = supported; })
  .catch(() => { nativeARSupported = false; });

renderer.xr.addEventListener('sessionstart', () => {
  prepareARScene();
});
renderer.xr.addEventListener('sessionend', () => {
  restoreStandardView();
});

arModeButton.addEventListener('click', async () => {
  if (renderer.xr.isPresenting) {
    await renderer.xr.getSession()?.end();
    return;
  }
  if (cameraFallbackActive) {
    restoreStandardView();
    return;
  }
  if (nativeARSupported) {
    nativeARButton.click();
    return;
  }
  await startCameraFallback();
});
document.querySelector('#start-walk').addEventListener('click', () => controls.lock());
document.querySelector('#fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) shell.requestFullscreen?.();
  else document.exitFullscreen?.();
});
document.querySelector('#palette-lime').addEventListener('click', () => setPalette('lime'));
document.querySelector('#palette-sage').addEventListener('click', () => setPalette('sage'));
document.querySelector('#open-room-mobile').addEventListener('click', () => openRoom());
document.querySelector('#scene-close').addEventListener('click', closeRoom);
modal.addEventListener('click', event => { if (event.target === modal) closeRoom(); });

document.querySelectorAll('.touch-controls button').forEach(button => {
  const mapping = { up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight' };
  const code = mapping[button.dataset.key];
  const start = event => { event.preventDefault(); pressKey(code, true); };
  const end = event => { event.preventDefault(); pressKey(code, false); };
  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', end);
  button.addEventListener('pointercancel', end);
  button.addEventListener('pointerleave', end);
});

canvas.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse') return;
  touchLook = { id:event.pointerId, x:event.clientX, y:event.clientY, yaw:camera.rotation.y, pitch:camera.rotation.x };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (!touchLook || touchLook.id !== event.pointerId) return;
  camera.rotation.y = touchLook.yaw - (event.clientX-touchLook.x) * .006;
  camera.rotation.x = THREE.MathUtils.clamp(touchLook.pitch - (event.clientY-touchLook.y) * .004, -.65, .65);
});
canvas.addEventListener('pointerup', () => { touchLook = null; });
canvas.addEventListener('pointercancel', () => { touchLook = null; });

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
});

buildApartment();
setPalette(currentPalette);
window.__tourDebug = {
  camera,
  getState: () => JSON.parse(debugState.value || '{}'),
  openRoom: () => openRoom(),
  setPalette
};
renderer.setAnimationLoop(animate);
setTimeout(() => loading.classList.add('done'), 380);
