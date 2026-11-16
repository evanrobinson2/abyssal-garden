// ============================================================================
// Space Garden engine: a small WebGPU renderer built on the Abyssal Garden methods
// (https://github.com/Noniv/abyssal-garden, MIT). What it does:
//   - HDR rgba16float with 4x MSAA and a reversed-Z depth32float buffer (infinite far plane)
//   - instanced solids (Mesh vertex format from math.js) plus emissive points
//   - a sky pass, a bloom chain, and a post pass that tone-maps and applies the scene's grade
//   - two-way dynamic resolution from GPU timestamp queries (9.8 to 13.6 ms band)
//   - zero per-frame allocations: all per-frame state lives in F and preallocated arrays
// A scene module supplies its WGSL (sky, solid shading, fog, grade) and its geometry.
// ============================================================================
const $ = (id) => document.getElementById(id);
const QS = new URLSearchParams(location.search);
const SHOT = QS.has('shot'); // ?shot=<pose index>&t=<time>: render one fixed frame at 1456x816 and upload it
const fail = (m) => { throw new Error(m, { cause: 1 }); };

async function runScene(SC) {
  const canvas = $('c'), body = document.body;
  const say = (m) => { $('s').textContent = m; };
  if (!navigator.gpu) fail('This scene needs WebGPU. Try a current Chrome or Edge, or Safari 26.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) fail('No WebGPU adapter found.');
  const hasTS = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice({ requiredFeatures: hasTS ? ['timestamp-query'] : [] });
  device.addEventListener('uncapturederror', (e) => console.error('GPU: ' + e.error.message));
  const ctx = canvas.getContext('webgpu'), FMT = navigator.gpu.getPreferredCanvasFormat();
  const Q = device.queue, HDR = 'rgba16float', DEPTH = 'depth32float', AA = 4;
  const TU = GPUTextureUsage, BU = GPUBufferUsage;
  const buf = (data, usage) => { const b = device.createBuffer({ size: (data.byteLength + 3) & ~3, usage: usage | BU.COPY_DST }); Q.writeBuffer(b, 0, data.buffer || data, data.byteOffset || 0, data.byteLength); return b; };
  const tex = (w, h, format, usage, samples = 1) => device.createTexture({ size: [w, h], format, usage, sampleCount: samples });

  // ---------------------------------------------------------------- build the scene's content (load time)
  say('Shaping the rocks…'); await new Promise((r) => setTimeout(r, 30));
  const G = SC.build(); // { meshes:[{vb,ib,nv, inst:Float32Array(12/inst)}], points:Float32Array(8/pt), poses:[[x,y,z,yaw,pitch,fovY]], collide?(F) }
  say('Lighting the scene…'); await new Promise((r) => setTimeout(r, 30));

  // ---------------------------------------------------------------- shared WGSL
  const COMMON = /*wgsl*/`
struct U { cam: vec4f, fwd: vec4f, right: vec4f, up: vec4f, sun: vec4f, res: vec4f, p0: vec4f, p1: vec4f };
@group(0) @binding(0) var<uniform> u: U;
fn toClip(p: vec3f) -> vec4f {
  let r = p - u.cam.xyz; let f = 1.0 / u.fwd.w;
  return vec4f(dot(r, u.right.xyz) * f / u.right.w, dot(r, u.up.xyz) * f, u.up.w, dot(r, u.fwd.xyz));
}
fn rayDir(ndc: vec2f) -> vec3f { return normalize(u.fwd.xyz + u.right.xyz * ndc.x * u.fwd.w * u.right.w + u.up.xyz * ndc.y * u.fwd.w); }
fn qrot(q: vec4f, v: vec3f) -> vec3f { let t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
fn h31(p: vec3f) -> f32 { var q = fract(p * 0.1031); q += dot(q, q.zyx + 31.32); return fract((q.x + q.y) * q.z); }
fn vn3(p: vec3f) -> f32 {
  let i = floor(p); var f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3f(1, 0, 0)), f.x), mix(h31(i + vec3f(0, 1, 0)), h31(i + vec3f(1, 1, 0)), f.x), f.y),
             mix(mix(h31(i + vec3f(0, 0, 1)), h31(i + vec3f(1, 0, 1)), f.x), mix(h31(i + vec3f(0, 1, 1)), h31(i + vec3f(1, 1, 1)), f.x), f.y), f.z);
}
fn fbm3(p0: vec3f, o: i32) -> f32 { var p = p0; var a = 0.5; var s = 0.0; for (var i = 0; i < o; i++) { s += a * vn3(p); p = p * 2.03 + vec3f(17.1, 31.7, 5.3); a *= 0.5; } return s / (1.0 - 2.0 * a); }
fn sat(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
`;
  const SCN = COMMON + SC.wgsl; // scene functions: sky(rd), shadeSolid(...), fogApply(col, wp, d), grade(...)

  const mod = (code) => { const m = device.createShaderModule({ code }); m.getCompilationInfo().then((i) => { for (const e of i.messages) if (e.type === 'error') console.error('WGSL ' + e.lineNum + ': ' + e.message + ' | ' + code.split('\n')[e.lineNum - 1]); }); return m; };
  const mSky = mod(SCN + /*wgsl*/`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)); return vec4f(p * 2.0 - 1.0, 0.0, 1.0); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let ndc = vec2f(fc.x * u.res.z * 2.0 - 1.0, 1.0 - fc.y * u.res.w * 2.0);
  return vec4f(sky(rayDir(ndc)), 1.0);
}`);
  const mSolid = mod(SCN + /*wgsl*/`
struct VO { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) aux: f32, @location(3) @interpolate(flat) prm: vec4f, @location(4) lp: vec3f };
@vertex fn vs(@location(0) p: vec3f, @location(1) na: vec4f, @location(2) i0: vec4f, @location(3) i1: vec4f, @location(4) i2: vec4f) -> VO {
  var o: VO;
  var wp = i0.xyz + qrot(i1, p * i0.w);
  wp.y += sin(u.cam.w * 0.9 + i2.y * 6.28) * select(i2.z, 0.0, i2.x > 2.5); // gentle bob (not for painted parts, whose i2.yzw is a colour)
  o.wp = wp; o.n = qrot(i1, na.xyz); o.aux = na.w; o.prm = i2; o.lp = p; o.pos = toClip(wp); return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let n = normalize(i.n); // meshes carry outward normals (terrain: field gradient; others: outward winding)
  let c = shadeSolid(i.wp, n, i.aux, i.prm, i.lp);
  return vec4f(fogApply(c, i.wp, length(i.wp - u.cam.xyz)), 1.0);
}`);
  const mPts = mod(SCN + /*wgsl*/`
struct P { a: vec4f, b: vec4f }; // a: xyz + size (m), b: rgb emission + motion kind
@group(0) @binding(1) var<storage, read> pts: array<P>;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) c: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let q = pts[ii]; var o: VO;
  let cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  var c = cs[vi]; var wp = q.a.xyz; let t = u.cam.w; let k = q.b.w;
  if (k > 0.5) { wp += pointMotion(wp, k, t); }
  var right = u.right.xyz; var up = u.up.xyz; var sz = vec2f(q.a.w);
  if (k > 2.5) { // streak: stretched along its motion
    let dir = normalize(pointMotion(wp, k, t + 0.05) - pointMotion(wp, k, t));
    right = dir; up = normalize(cross(dir, wp - u.cam.xyz)); sz = vec2f(q.a.w * 18.0, q.a.w * 0.6);
  }
  let d = length(wp - u.cam.xyz);
  let minS = d * u.fwd.w * 2.0 * u.res.w * 1.6; // at least ~1.6 px
  let s = max(sz, vec2f(minS));
  let fade = sat(sz.x / minS); // sub-pixel points dim instead of shrinking
  o.pos = toClip(wp + right * c.x * s.x + up * c.y * s.y); o.uv = c;
  o.c = fogApply(q.b.rgb * fade, wp, d) - fogApply(vec3f(0.0), wp, d);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f { let r = 1.0 - dot(i.uv, i.uv); if (r <= 0.0) { discard; } return vec4f(i.c * r * r, 0.0); }`);
  const mBlit = mod(/*wgsl*/`
@group(0) @binding(0) var t: texture_2d<f32>; @group(0) @binding(1) var s: sampler;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)); return vec4f(p * 2.0 - 1.0, 0.0, 1.0); }
@fragment fn down0(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let d = vec2f(textureDimensions(t)); let ts = 1.0 / d; let uv = fc.xy * 2.0 * ts;
  var c = (textureSample(t, s, uv + ts * vec2f(-1, -1)) + textureSample(t, s, uv + ts * vec2f(1, -1)) + textureSample(t, s, uv + ts * vec2f(-1, 1)) + textureSample(t, s, uv + ts * vec2f(1, 1))).rgb * 0.25;
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722)); c *= clamp((l - 1.0) / 2.0, 0.0, 1.0); // only the bright parts bloom
  return vec4f(min(c, vec3f(64.0)), 1.0);
}
@fragment fn down(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let d = vec2f(textureDimensions(t)); let ts = 1.0 / d; let uv = fc.xy * 2.0 * ts;
  return vec4f((textureSample(t, s, uv + ts * vec2f(-1, -1)) + textureSample(t, s, uv + ts * vec2f(1, -1)) + textureSample(t, s, uv + ts * vec2f(-1, 1)) + textureSample(t, s, uv + ts * vec2f(1, 1))).rgb * 0.25, 1.0);
}
@fragment fn up(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let d = vec2f(textureDimensions(t)); let ts = 1.0 / d; let uv = fc.xy * 0.5 * ts;
  var c = textureSample(t, s, uv).rgb * 4.0;
  c += (textureSample(t, s, uv + ts * vec2f(-1, 0)) + textureSample(t, s, uv + ts * vec2f(1, 0)) + textureSample(t, s, uv + ts * vec2f(0, -1)) + textureSample(t, s, uv + ts * vec2f(0, 1))).rgb * 2.0;
  c += (textureSample(t, s, uv + ts * vec2f(-1, -1)) + textureSample(t, s, uv + ts * vec2f(1, -1)) + textureSample(t, s, uv + ts * vec2f(-1, 1)) + textureSample(t, s, uv + ts * vec2f(1, 1))).rgb;
  return vec4f(c / 16.0, 1.0);
}`);
  const mPost = mod(SCN + /*wgsl*/`
@group(0) @binding(1) var sL: sampler; @group(0) @binding(2) var tRes: texture_2d<f32>; @group(0) @binding(3) var tBl: texture_2d<f32>;
@group(0) @binding(4) var tD: texture_depth_multisampled_2d;
fn depthAt(p: vec2i) -> f32 { let d = vec2i(textureDimensions(tD)) - 1; return textureLoad(tD, clamp(p, vec2i(0), d), 0); }
fn hdrAt(uv: vec2f) -> vec3f { return textureSampleLevel(tRes, sL, uv, 0.0).rgb; }
` + SC.post + /*wgsl*/`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)); return vec4f(p * 2.0 - 1.0, 0.0, 1.0); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy * u.res.zw; let px = vec2i(fc.xy);
  var c = textureSampleLevel(tRes, sL, uv, 0.0).rgb;
  let bl = textureSampleLevel(tBl, sL, uv, 0.0).rgb;
  return vec4f(grade(c, bl, uv, px, depthAt(px)), 1.0);
}`);

  // ---------------------------------------------------------------- pipelines
  device.pushErrorScope('validation');
  const ubo = device.createBuffer({ size: 128, usage: BU.UNIFORM | BU.COPY_DST }), UB = new Float32Array(32);
  const ptsBuf = buf(G.points.length ? G.points : new Float32Array(8), BU.STORAGE), nPts = G.points.length / 8;
  const sL = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  const depthW = { format: DEPTH, depthWriteEnabled: true, depthCompare: 'greater' };
  const depthR = { format: DEPTH, depthWriteEnabled: false, depthCompare: 'greater' };
  const ms = { count: AA };
  const pSky = device.createRenderPipeline({ layout: 'auto', vertex: { module: mSky, entryPoint: 'vs' }, fragment: { module: mSky, entryPoint: 'fs', targets: [{ format: HDR }] },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'always' }, multisample: ms });
  const pSolid = device.createRenderPipeline({ layout: 'auto',
    vertex: { module: mSolid, entryPoint: 'vs', buffers: [
      { arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'snorm8x4' }] },
      { arrayStride: 48, stepMode: 'instance', attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x4' }, { shaderLocation: 3, offset: 16, format: 'float32x4' }, { shaderLocation: 4, offset: 32, format: 'float32x4' }] }] },
    fragment: { module: mSolid, entryPoint: 'fs', targets: [{ format: HDR }] }, primitive: { cullMode: 'none' }, depthStencil: depthW, multisample: ms });
  const add = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } };
  const pPts = device.createRenderPipeline({ layout: 'auto', vertex: { module: mPts, entryPoint: 'vs' }, fragment: { module: mPts, entryPoint: 'fs', targets: [{ format: HDR, blend: add }] }, depthStencil: depthR, multisample: ms });
  const blitP = (ep, blend) => device.createRenderPipeline({ layout: 'auto', vertex: { module: mBlit, entryPoint: 'vs' }, fragment: { module: mBlit, entryPoint: ep, targets: [{ format: HDR, blend }] } });
  const pDown0 = blitP('down0'), pDown = blitP('down'), pUp = blitP('up', add);
  const pPost = device.createRenderPipeline({ layout: 'auto', vertex: { module: mPost, entryPoint: 'vs' }, fragment: { module: mPost, entryPoint: 'fs', targets: [{ format: FMT }] } });

  { const err = await device.popErrorScope(); if (err) { console.error('PIPELINE ' + err.message); fail('Shader error: ' + err.message.slice(0, 300)); } }
  const bgSky = device.createBindGroup({ layout: pSky.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }] });
  const bgSolid = device.createBindGroup({ layout: pSolid.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }] });
  const bgPts = device.createBindGroup({ layout: pPts.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: { buffer: ptsBuf } }] });
  // meshes: GPU buffers; instances are uploaded once (the scene is static apart from shader motion)
  const draws = G.meshes.filter((m) => m.inst.length).map((m) => ({ vb: buf(new Uint8Array(m.vb), BU.VERTEX), ib: buf(m.ib, BU.INDEX), n: m.ib.length, ibuf: buf(m.inst, BU.VERTEX), ni: m.inst.length / 12 }));

  // ---------------------------------------------------------------- render targets (rebuilt on resize)
  const PIXMAX = 2560 * 1440, PIXMIN = 3e5;
  let W = 0, H = 0, DW = 0, DH = 0, pix = PIXMAX;
  let passScene, passPost, bloomPass = [], bloomBG = [], bgPost, targets = [];
  const NB = 6;
  function resize() {
    if (SHOT) { DW = 1456; DH = 816; } else { DW = max(2, round(canvas.clientWidth * devicePixelRatio)); DH = max(2, round(canvas.clientHeight * devicePixelRatio)); }
    const s = SHOT ? 1 : min(1, sqrt(pix / (DW * DH)));
    const w = max(2, round(DW * s) & ~1), h = max(2, round(DH * s) & ~1);
    if (w === W && h === H) return;
    W = w; H = h; canvas.width = W; canvas.height = H;
    ctx.configure({ device, format: FMT, alphaMode: 'opaque', usage: TU.RENDER_ATTACHMENT | TU.COPY_SRC });
    for (const t of targets) t.destroy();
    const tMS = tex(W, H, HDR, TU.RENDER_ATTACHMENT, AA), tDp = tex(W, H, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, AA);
    const tRes = tex(W, H, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
    targets = [tMS, tDp, tRes];
    const bl = [];
    for (let i = 0; i < NB; i++) { const t = tex(max(1, W >> (i + 1)), max(1, H >> (i + 1)), HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING); bl.push(t); targets.push(t); }
    const vRes = tRes.createView(), vBl = bl.map((t) => t.createView());
    passScene = { colorAttachments: [{ view: tMS.createView(), resolveTarget: vRes, loadOp: 'clear', storeOp: 'discard', clearValue: [0, 0, 0, 1] }],
      depthStencilAttachment: { view: tDp.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' } };
    passPost = { colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] };
    const att = (v, clear) => ({ colorAttachments: [{ view: v, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    const blitBG = (p, v) => device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: v }, { binding: 1, resource: sL }] });
    bloomPass = []; bloomBG = [];
    for (let i = 0; i < NB; i++) { bloomPass.push([att(vBl[i], true), i ? pDown : pDown0]); bloomBG.push(blitBG(i ? pDown : pDown0, i ? vBl[i - 1] : vRes)); }
    for (let i = NB - 1; i > 0; i--) { bloomPass.push([att(vBl[i - 1], false), pUp]); bloomBG.push(blitBG(pUp, vBl[i])); }
    bgPost = device.createBindGroup({ layout: pPost.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: sL },
      { binding: 2, resource: vRes }, { binding: 3, resource: vBl[0] }, { binding: 4, resource: tDp.createView() }] });
  }
  resize();
  addEventListener('resize', resize);

  // ---------------------------------------------------------------- GPU timing
  let qs, qRes, qRead = [], tsW;
  const F = new Float64Array(32); // per-frame state, preallocated
  const [CX, CY, CZ, YAW, PIT, VX, VY, VZ, TIME, LAST, GPU, FOV] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  let dynT = 0, dynN = 0, dynG = 0, dynGN = 0;
  if (hasTS) {
    qs = device.createQuerySet({ type: 'timestamp', count: 2 });
    qRes = device.createBuffer({ size: 16, usage: BU.QUERY_RESOLVE | BU.COPY_SRC });
    for (let i = 0; i < 4; i++) {
      const b = device.createBuffer({ size: 16, usage: BU.MAP_READ | BU.COPY_DST }), o = { b, busy: false };
      o.done = () => { const a = new BigInt64Array(b.getMappedRange()); const ms = Number(a[1] - a[0]) / 1e6; b.unmap(); o.busy = false; if (ms > 0 && ms < 1e3) { F[GPU] = ms; dynG += ms; dynGN++; } };
      qRead.push(o);
    }
    tsW = { querySet: qs, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 };
  }

  // ---------------------------------------------------------------- camera + input
  const poses = G.poses;
  const setPose = (i) => { const p = poses[i]; F[CX] = p[0]; F[CY] = p[1]; F[CZ] = p[2]; F[YAW] = p[3]; F[PIT] = p[4]; F[FOV] = p[5]; F[VX] = F[VY] = F[VZ] = 0; };
  setPose(SHOT ? +QS.get('shot') || 0 : 0);
  if (SHOT) F[TIME] = +QS.get('t') || 0;
  const keys = new Uint8Array(256); let mdx = 0, mdy = 0, flying = false, hud = false;
  const KC = { KeyW: 1, KeyS: 2, KeyA: 3, KeyD: 4, KeyE: 5, KeyQ: 6, ShiftLeft: 7, ShiftRight: 7 };
  addEventListener('keydown', (e) => {
    if (KC[e.code]) keys[KC[e.code]] = 1;
    if (e.code.startsWith('Digit')) { const i = +e.code.slice(5) - 1; if (i >= 0 && i < poses.length) setPose(i); }
    if (e.code === 'KeyH') { hud = !hud; $('i').hidden = !hud; }
  });
  addEventListener('keyup', (e) => { if (KC[e.code]) keys[KC[e.code]] = 0; });
  addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; } });
  const go = () => { body.className = 'g'; canvas.requestPointerLock?.(); flying = true; };
  $('go').onclick = go; canvas.onclick = () => { if (flying) canvas.requestPointerLock?.(); };
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && flying) { body.className = 'm'; flying = false; } });

  // ---------------------------------------------------------------- frame
  const submitList = [null];
  let hudT = 0, hudN = 0, hudMs = 0;
  // shot mode renders on a timer, so it also works in a background tab
  const next = SHOT || QS.has('timer') ? (f) => setTimeout(() => f(performance.now()), 16) : requestAnimationFrame; // ?timer: for testing in a hidden tab
  function frame(now) {
    if (!SHOT || shotN < 12) next(frame);
    const dtr = now - F[LAST]; F[LAST] = now;
    let dt = dtr / 1000; if (dt > 0.1) dt = 0.1;
    if (SHOT) dt = 0;
    // dynamic resolution: once a second, keep GPU time between 9.8 and 13.6 ms (pixels only)
    if (!SHOT && dtr < 1e3 && (dynT += dtr) > 1000) {
      const g = dynGN ? dynG / dynGN : 0, a = dynT / max(1, dynN); let k = 1;
      if (g) { if (g > 13.6 || g < 9.8) k = 11.7 / g; } else if (a > 17.6) k = 15 / a; else if (a < 12.5) k = 1.1;
      k = clamp(k, 0.5, 1.7); pix = clamp(pix * k, PIXMIN, min(PIXMAX, DW * DH || PIXMAX));
      dynT = dynN = dynG = dynGN = 0; resize();
    }
    dynN++;
    F[TIME] += dt;
    // fly camera
    const ls = 0.0022; F[YAW] += mdx * ls; F[PIT] = clamp(F[PIT] - mdy * ls, -1.5, 1.5); mdx = mdy = 0;
    const cy = cos(F[YAW]), sy = sin(F[YAW]), cp = cos(F[PIT]), sp = sin(F[PIT]);
    const fx = sy * cp, fy = sp, fz = cy * cp, rx = cy, rz = -sy; // right = (cos yaw, 0, -sin yaw)
    const ux = -sp * sy, uy = cp, uz = -sp * cy;
    if (flying) {
      const sp2 = keys[7] ? 22 : 6, mf = keys[1] - keys[2], mr = keys[4] - keys[3], mu = keys[5] - keys[6];
      const ax = (fx * mf + rx * mr) * sp2, ay = (fy * mf + mu) * sp2, az = (fz * mf + rz * mr) * sp2, kk = 1 - Math.exp(-dt * 6);
      F[VX] += (ax - F[VX]) * kk; F[VY] += (ay - F[VY]) * kk; F[VZ] += (az - F[VZ]) * kk;
    } else { const kk = 1 - Math.exp(-dt * 4); F[VX] -= F[VX] * kk; F[VY] -= F[VY] * kk; F[VZ] -= F[VZ] * kk; }
    F[CX] += F[VX] * dt; F[CY] += F[VY] * dt; F[CZ] += F[VZ] * dt;
    if (G.collide && !SHOT) G.collide(F); // shots use the exact hero camera
    // uniforms
    UB[0] = F[CX]; UB[1] = F[CY]; UB[2] = F[CZ]; UB[3] = F[TIME];
    UB[4] = fx; UB[5] = fy; UB[6] = fz; UB[7] = Math.tan(F[FOV] / 2);
    UB[8] = rx; UB[9] = 0; UB[10] = rz; UB[11] = W / H;
    UB[12] = ux; UB[13] = uy; UB[14] = uz; UB[15] = 0.05;
    UB[16] = SC.sun[0]; UB[17] = SC.sun[1]; UB[18] = SC.sun[2]; UB[19] = 0;
    UB[20] = W; UB[21] = H; UB[22] = 1 / W; UB[23] = 1 / H;
    if (SC.p0) { UB[24] = SC.p0[0]; UB[25] = SC.p0[1]; UB[26] = SC.p0[2]; UB[27] = SC.p0[3]; }
    if (SC.p1) { UB[28] = SC.p1[0]; UB[29] = SC.p1[1]; UB[30] = SC.p1[2]; UB[31] = SC.p1[3]; }
    Q.writeBuffer(ubo, 0, UB);

    const e = device.createCommandEncoder();
    if (hasTS) passScene.timestampWrites = tsW;
    let r = e.beginRenderPass(passScene);
    r.setPipeline(pSky); r.setBindGroup(0, bgSky); r.draw(3);
    r.setPipeline(pSolid); r.setBindGroup(0, bgSolid);
    for (let i = 0; i < draws.length; i++) { const d = draws[i]; r.setVertexBuffer(0, d.vb); r.setVertexBuffer(1, d.ibuf); r.setIndexBuffer(d.ib, 'uint32'); r.drawIndexed(d.n, d.ni); }
    if (nPts) { r.setPipeline(pPts); r.setBindGroup(0, bgPts); r.draw(6, nPts); }
    r.end();
    for (let i = 0; i < bloomPass.length; i++) { r = e.beginRenderPass(bloomPass[i][0]); r.setPipeline(bloomPass[i][1]); r.setBindGroup(0, bloomBG[i]); r.draw(3); r.end(); }
    const cur = ctx.getCurrentTexture();
    passPost.colorAttachments[0].view = cur.createView();
    r = e.beginRenderPass(passPost); r.setPipeline(pPost); r.setBindGroup(0, bgPost); r.draw(3); r.end();
    let slot = null;
    if (hasTS) { slot = qRead.find((o) => !o.busy) || null; if (slot) { e.resolveQuerySet(qs, 0, 2, qRes, 0); e.copyBufferToBuffer(qRes, 0, slot.b, 0, 16); slot.busy = true; } }
    let shotBuf = null, bpr = 0;
    if (SHOT && ++shotN === 12) { bpr = (W * 4 + 255) & ~255; shotBuf = device.createBuffer({ size: bpr * H, usage: BU.MAP_READ | BU.COPY_DST }); e.copyTextureToBuffer({ texture: cur }, { buffer: shotBuf, bytesPerRow: bpr }, [W, H]); }
    submitList[0] = e.finish(); Q.submit(submitList);
    if (slot) slot.b.mapAsync(GPUMapMode.READ).then(slot.done);
    if (shotBuf) saveShot(shotBuf, bpr);
    if (hud && (hudT += dtr) > 500) { $('i').textContent = `${(1000 * ++hudN / hudT).toFixed(0)} fps · GPU ${F[GPU].toFixed(1)} ms · ${W}×${H} · ${draws.reduce((a, d) => a + d.ni, 0)} solids · ${nPts} points · at ${F[CX].toFixed(1)}, ${F[CY].toFixed(1)}, ${F[CZ].toFixed(1)}`; hudT = hudN = 0; } else if (hud) hudN++;
  }
  let shotN = 0;
  async function saveShot(b, bpr) {
    await b.mapAsync(GPUMapMode.READ); const src = new Uint8Array(b.getMappedRange()), img = new ImageData(W, H), d = img.data, bgra = FMT.startsWith('bgra');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = y * bpr + x * 4, o = (y * W + x) * 4; d[o] = src[s + (bgra ? 2 : 0)]; d[o + 1] = src[s + 1]; d[o + 2] = src[s + (bgra ? 0 : 2)]; d[o + 3] = 255; }
    const c2 = new OffscreenCanvas(W, H); c2.getContext('2d').putImageData(img, 0, 0);
    const blob = await c2.convertToBlob({ type: 'image/png' });
    const name = QS.get('name') || `${SC.id}-pose${QS.get('shot')}`;
    const res = await fetch('/shots/' + name + '.png', { method: 'PUT', body: blob }).catch(() => null);
    document.title = 'SHOT ' + (res && res.ok ? 'saved ' : 'failed ') + name;
  }
  body.className = SHOT ? 'g' : 'm';
  next((t) => { F[LAST] = t; frame(t); });
}
