import * as THREE from 'three';

/* ---------------- 天空穹顶 ---------------- */
export function createSky(scene) {
  const geo = new THREE.SphereGeometry(2600, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x03060f) },
      uMid: { value: new THREE.Color(0x0a1b3c) },
      uBottom: { value: new THREE.Color(0x1b1038) },
      uGlow: { value: new THREE.Color(0x2ad4ff) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uBottom, uGlow;
      uniform float uTime;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 c = mix(uBottom, uMid, smoothstep(0.30, 0.52, h));
        c = mix(c, uTop, smoothstep(0.5, 0.95, h));
        // 地平线光带
        float band = exp(-abs(d.y)*6.0);
        c += uGlow * band * 0.30;
        // 缓慢流动的极光
        float aur = sin(d.x*3.0 + uTime*0.05) * cos(d.z*2.4 - uTime*0.037);
        c += vec3(0.10,0.35,0.55) * smoothstep(0.55,1.0,h) * (0.05 + 0.05*aur);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  scene.add(mesh);
  return { mesh, update: (t) => { mat.uniforms.uTime.value = t; } };
}

/* ---------------- 星空 ---------------- */
export function createStars(scene, count = 1600) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const sz = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = 1500 + Math.random() * 700;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph) * 0.65;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    c.setHSL(0.5 + Math.random() * 0.14, 0.55, 0.55 + Math.random() * 0.4);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    sz[i] = 6 + Math.random() * 16;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    vertexColors: true, // 声明内置 color 属性
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      varying vec3 vCol;
      uniform float uTime;
      void main(){
        vCol = color;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      uniform float uTime;
      void main(){
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        float a = smoothstep(0.5, 0.0, d);
        a *= 0.65 + 0.35*sin(uTime*2.0 + vCol.r*40.0);
        gl_FragColor = vec4(vCol, a);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -900;
  scene.add(points);
  return { points, update: (t, cam) => { mat.uniforms.uTime.value = t; points.position.copy(cam.position); } };
}

/* ---------------- 全息网格海面 ---------------- */
export function createGrid(scene, size = 7000, seg = 1) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uScroll: { value: 0 },
      uFar: { value: size * 0.42 },
      uFine: { value: new THREE.Color(0x1c6c8c) },
      uCoarse: { value: new THREE.Color(0x3ae7ff) },
      uPulse: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main(){
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vP;
      uniform float uScroll, uFar, uPulse;
      uniform vec3 uFine, uCoarse;
      float gridLine(vec2 p, float scale, float w){
        vec2 q = p / scale;
        vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
        return 1.0 - min(min(g.x, g.y) / w, 1.0);
      }
      void main(){
        vec2 p = vec2(vP.x, vP.y - uScroll);
        float fine   = gridLine(p, 24.0, 1.3);
        float coarse = gridLine(p, 120.0, 1.8);
        float d = length(vP) / uFar;
        float fade = 1.0 - smoothstep(0.08, 1.0, d);
        float ring = exp(-pow((d - uPulse) * 7.0, 2.0)) * 0.9;
        vec3 col = uFine * fine * 0.85 + uCoarse * coarse * 1.2 + uCoarse * ring;
        float a = (fine * 0.5 + coarse * 0.95 + ring) * fade;
        if (a < 0.003) discard;
        gl_FragColor = vec4(col, a * 0.9);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -78;
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    mesh,
    update: (playerPos, dist, t) => {
      mesh.position.x = playerPos.x;
      mesh.position.z = playerPos.z;
      mat.uniforms.uScroll.value = dist;
      mat.uniforms.uPulse.value = (t * 0.06) % 1.4;
    },
  };
}

/* ---------------- 场景装饰（立柱 / 圆环 / 浮岛） ---------------- */
export function createProps(scene, count = 30) {
  const group = new THREE.Group();
  scene.add(group);
  const items = [];

  const pillarMat = new THREE.MeshBasicMaterial({ color: 0x184a66, transparent: true, opacity: 0.62, fog: true });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x3ae7ff, transparent: true, opacity: 0.5 });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x9a5cff, transparent: true, opacity: 0.42, side: THREE.DoubleSide, fog: true });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a3a66, roughness: 0.85, metalness: 0.25, flatShading: true, emissive: 0x14304f, emissiveIntensity: 0.95 });

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const edgeGeo = new THREE.EdgesGeometry(boxGeo);
  const ringGeo = new THREE.TorusGeometry(1, 0.035, 8, 48);
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);

  function scatter(item) {
    const a = Math.random() * Math.PI * 2;
    const r = 240 + Math.random() * 620;
    item.group.position.set(Math.cos(a) * r, -70 + Math.random() * 150, Math.sin(a) * r);
    item.spin = (Math.random() - 0.5) * 0.3;
    if (item.kind === 'ring') item.group.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  }

  for (let i = 0; i < count; i++) {
    const kind = i % 3 === 0 ? 'ring' : (i % 3 === 1 ? 'rock' : 'pillar');
    const g = new THREE.Group();
    if (kind === 'pillar') {
      const h = 90 + Math.random() * 260;
      const w = 8 + Math.random() * 16;
      const m = new THREE.Mesh(boxGeo, pillarMat);
      m.scale.set(w, h, w);
      m.position.y = h / 2;
      g.add(m);
      const e = new THREE.LineSegments(edgeGeo, edgeMat);
      e.scale.set(w, h, w);
      e.position.y = h / 2;
      g.add(e);
    } else if (kind === 'ring') {
      const r = 26 + Math.random() * 60;
      const m = new THREE.Mesh(ringGeo, ringMat);
      m.scale.setScalar(r);
      g.add(m);
    } else {
      const r = 10 + Math.random() * 26;
      const m = new THREE.Mesh(rockGeo, rockMat);
      m.scale.set(r, r * (0.6 + Math.random() * 0.6), r);
      g.add(m);
    }
    const item = { kind, group: g, spin: 0 };
    scatter(item);
    group.add(g);
    items.push(item);
  }

  return {
    group,
    update: (playerPos, forward, dt) => {
      const fwd = forward.clone().normalize();
      for (const it of items) {
        it.group.rotation.y += it.spin * dt;
        if (it.kind === 'ring') it.group.rotation.x += it.spin * 0.6 * dt;
        const rel = it.group.position.clone().sub(playerPos);
        const along = rel.dot(fwd);
        if (along < -300 || along > 1500 || rel.length() > 1600) {
          // 重新投放到我机前方
          const side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
          const up = new THREE.Vector3().crossVectors(side, fwd).normalize();
          const a = (Math.random() - 0.5) * 2.2;
          const b = (Math.random() - 0.5) * 1.4;
          const dist = 700 + Math.random() * 700;
          it.group.position.copy(playerPos)
            .add(fwd.clone().multiplyScalar(dist))
            .add(side.clone().multiplyScalar(a * dist * 0.45))
            .add(up.clone().multiplyScalar(b * 260));
          it.group.position.y = Math.max(it.group.position.y, -70);
        }
      }
    },
  };
}

/* ---------------- 太阳 / 辉光 ---------------- */
export function createSun(scene) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(120,240,255,0.85)');
  g.addColorStop(0.5, 'rgba(60,180,255,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(900);
  s.position.set(-1200, 320, -1900);
  scene.add(s);
  return s;
}
