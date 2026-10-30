import * as THREE from "three";
import gsap from "gsap";
let transferredScene = null;

// Local, procedural geometry keeps the scene usable without remote model or texture files.
export function createDataIsland(host, labels, { reduced, onFailure }) {
  if (host.closest(".home-hero") && transferredScene) {
    const existing = transferredScene;
    transferredScene = null;
    if (!reduced) {
      existing.adopt(host, labels, onFailure);
      return existing;
    }
    existing.cancel();
  }
  const initialAngle = -0.22;
  let transferring = false,
    adopted = false,
    homeHost,
    homeLabels,
    expiry;
  let disposed = false;
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.dataset.sceneId = crypto.randomUUID();
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5.2, 5.2, 4, -4, 0.1, 60);
  camera.position.set(8, 7, 10);
  camera.lookAt(0, 0.55, 0);
  scene.add(new THREE.HemisphereLight(0xf6ffe9, 0x40594a, 2.0));
  const sun = new THREE.DirectionalLight(0xfff5d7, 3.0);
  sun.position.set(-3, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -6,
    right: 6,
    top: 6,
    bottom: -6,
    near: 0.5,
    far: 25,
  });
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xcbe8d2, 1.4);
  fill.position.set(5, 4, -7);
  scene.add(fill);
  const world = new THREE.Group();
  world.rotation.y = initialAngle;
  scene.add(world);

  const mats = {};
  for (const [name, color] of Object.entries({
    ground: 0xa7bd8d,
    edge: 0x385e41,
    path: 0xd9dfc7,
    ink: 0x285b3c,
    green: 0x397954,
    sage: 0x79a980,
    light: 0xbad595,
    lime: 0xd9eab0,
    paper: 0xf4f4df,
    pale: 0xe5ebd2,
    gold: 0xbab172,
    stem: 0x486346,
  }))
    mats[name] = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.02,
    });

  function mesh(geometry, material, position, parent = world) {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(...position);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }
  function box(w, h, d, material, position, parent) {
    return mesh(new THREE.BoxGeometry(w, h, d), material, position, parent);
  }
  mesh(
    new THREE.CylinderGeometry(3.85, 3.85, 0.22, 72),
    mats.edge,
    [0, -0.2, 0],
  );
  mesh(
    new THREE.CylinderGeometry(3.85, 3.85, 0.11, 72),
    mats.ground,
    [0, -0.035, 0],
  );
  const rim = mesh(
    new THREE.TorusGeometry(3.69, 0.024, 6, 96),
    mats.path,
    [0, 0.03, 0],
  );
  rim.rotation.x = Math.PI / 2;
  box(5.8, 0.026, 0.12, mats.path, [0, 0.032, 0.75]);
  box(0.13, 0.025, 4.3, mats.path, [-0.65, 0.033, 0.15]);

  // The seven heights use the same explicitly labelled coffee example as the home page.
  const heights = [120, 150, 90, 180, 210, 280, 230];
  const towers = heights.map((value, i) => {
    const tower = new THREE.Group();
    tower.position.set(-2.25 + i * 0.72, 0.04, -0.55);
    world.add(tower);
    const height = value / 104;
    box(
      0.49,
      height,
      0.68,
      i === 5 ? mats.ink : i % 2 ? mats.green : mats.sage,
      [0, height / 2, 0],
      tower,
    );
    box(
      0.51,
      0.045,
      0.7,
      i === 5 ? mats.lime : mats.light,
      [0, height + 0.022, 0],
      tower,
    );
    box(
      0.035,
      height * 0.6,
      0.015,
      mats.light,
      [0.17, height * 0.43, 0.348],
      tower,
    );
    return tower;
  });

  // A small spreadsheet slab, a donut and an upright report form the data workflow.
  const table = new THREE.Group();
  table.position.set(-1.65, 0.15, 1.7);
  table.rotation.y = -0.08;
  world.add(table);
  box(1.5, 0.13, 1.13, mats.paper, [0, 0, 0], table);
  box(1.3, 0.025, 0.19, mats.ink, [0, 0.079, -0.35], table);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) {
      box(
        0.25,
        0.026,
        0.13,
        (row + col) % 3 === 0 ? mats.green : mats.light,
        [-0.48 + col * 0.32, 0.08, -0.09 + row * 0.21],
        table,
      );
    }
  const donut = new THREE.Group();
  donut.position.set(0.1, 0.13, 1.9);
  world.add(donut);
  [mats.ink, mats.sage, mats.lime].forEach((material, i) => {
    const part = mesh(
      new THREE.TorusGeometry(0.46, 0.115, 8, 24, Math.PI * 0.64),
      material,
      [0, 0, 0],
      donut,
    );
    part.rotation.set(Math.PI / 2, 0, (i * Math.PI * 2) / 3);
  });
  const report = new THREE.Group();
  report.position.set(2.05, 0.96, 1.1);
  report.rotation.set(-0.09, -0.26, -0.09);
  world.add(report);
  box(1.18, 1.65, 0.075, mats.paper, [0, 0, 0], report);
  box(0.72, 0.08, 0.018, mats.ink, [-0.08, 0.6, 0.05], report);
  box(0.47, 0.035, 0.018, mats.sage, [-0.2, 0.41, 0.05], report);
  [0.22, 0.36, 0.29, 0.51, 0.62].forEach((height, i) =>
    box(
      0.12,
      height,
      0.025,
      i === 4 ? mats.ink : mats.sage,
      [-0.38 + i * 0.19, -0.37 + height / 2, 0.055],
      report,
    ),
  );
  box(0.8, 0.035, 0.018, mats.sage, [0, -0.53, 0.05], report);
  box(0.52, 0.035, 0.018, mats.light, [-0.14, -0.65, 0.05], report);

  // Faceted greenery gives the diorama a human scale without copying a campus scene.
  for (let i = 0; i < 15; i++) {
    const angle = -0.1 + (i / 14) * Math.PI * 1.2;
    const x = Math.cos(angle) * 3.3,
      z = Math.sin(angle) * 3.3;
    if (z > 1 && x > 0.5) continue;
    const height = 0.33 + (i % 3) * 0.07;
    mesh(new THREE.CylinderGeometry(0.035, 0.045, height, 5), mats.stem, [
      x,
      height / 2,
      z,
    ]);
    mesh(
      new THREE.IcosahedronGeometry(0.23 + (i % 2) * 0.03, 1),
      i % 3 ? mats.green : mats.light,
      [x, height + 0.12, z],
    );
  }
  const satellite = new THREE.Group();
  satellite.position.set(-2.1, 2.65, 0.85);
  satellite.rotation.set(0.2, 0.3, 0.15);
  world.add(satellite);
  mesh(new THREE.IcosahedronGeometry(0.24, 0), mats.gold, [0, 0, 0], satellite);
  const orbit = mesh(
    new THREE.TorusGeometry(0.36, 0.015, 5, 40),
    mats.lime,
    [0, 0, 0],
    satellite,
  );
  orbit.rotation.x = 0.65;

  const anchors = [
    [labels[0], table, new THREE.Vector3(0, 0.35, 0)],
    [labels[1], towers[5], new THREE.Vector3(0, 2.95, 0)],
    [labels[2], report, new THREE.Vector3(0, 1.05, 0)],
  ];
  let width = 1,
    height = 1,
    frame = 0,
    visible = true,
    paused = reduced;
  let lastTime = 0,
    elapsed = 0;
  // Measure every mesh and label through a full turn, in camera space. The
  // camera then fits the envelope at each viewport ratio instead of cropping
  // tall bars in a wide, short login canvas.
  camera.updateMatrixWorld(true);
  const envelope = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };
  const viewPoint = new THREE.Vector3();
  const nodes = [];
  world.traverse((object) => {
    if (!object.isMesh) return;
    // Use actual vertices: a cylinder's box corners would overestimate the
    // circular island and unnecessarily shrink the scene.
    const positions = object.geometry.attributes.position;
    const corners = [];
    for (let index = 0; index < positions.count; index++)
      corners.push(new THREE.Vector3().fromBufferAttribute(positions, index));
    nodes.push({ object, corners });
  });
  function include(point) {
    point.applyMatrix4(camera.matrixWorldInverse);
    envelope.minX = Math.min(envelope.minX, point.x);
    envelope.maxX = Math.max(envelope.maxX, point.x);
    envelope.minY = Math.min(envelope.minY, point.y);
    envelope.maxY = Math.max(envelope.maxY, point.y);
  }
  for (let step = 0; step < 48; step++) {
    world.rotation.y = (step * Math.PI) / 24;
    world.updateMatrixWorld(true);
    for (const { object, corners } of nodes)
      for (const point of corners)
        include(viewPoint.copy(point).applyMatrix4(object.matrixWorld));
    for (const [, object, offset] of anchors)
      include(object.localToWorld(viewPoint.copy(offset)));
  }
  world.rotation.y = initialAngle;
  // Leave room for the entrance translation and the subtle floating elements.
  envelope.minY -= 0.25;
  envelope.maxY += 0.12;
  const projection = new THREE.Vector3();
  function render() {
    if (disposed) return;
    renderer.render(scene, camera);
    for (const [index, [, object, offset]] of anchors.entries()) {
      const label = labels[index];
      if (!label) continue;
      projection.copy(offset);
      object.localToWorld(projection);
      projection.project(camera);
      label.style.transform = `translate(${((projection.x + 1) * width) / 2}px,${((-projection.y + 1) * height) / 2}px) translate(-50%,-100%)`;
    }
  }
  function tick(now) {
    frame = 0;
    if (disposed || paused || !visible || document.hidden) return;
    // 每个可见的浏览器动画帧都绘制，避免 30fps 限速及阈值抖动造成跳帧。
    elapsed += Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    // Smoothly reach a constant orbital speed (one revolution in ~35s).
    // Rotation is time-based and never reads mouse or touch input.
    world.rotation.y =
      initialAngle + 0.18 * (elapsed - 1.2 * (1 - Math.exp(-elapsed / 1.2)));
    satellite.position.y = 2.65 + Math.sin(elapsed * 0.8) * 0.08;
    satellite.rotation.y = elapsed * 0.15;
    report.position.y = 0.96 + Math.sin(elapsed * 0.6) * 0.025;
    render();
    frame = requestAnimationFrame(tick);
  }
  function schedule() {
    if (!frame && !paused && visible && !document.hidden) {
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }
  function framingScale(width, height) {
    const padding = Math.min(30, Math.min(width, height) * 0.08);
    return Math.max(
      ((envelope.maxX - envelope.minX) * 1.04) /
        Math.max(1, width - padding * 2),
      ((envelope.maxY - envelope.minY) * 1.04) /
        Math.max(1, height - padding * 2),
    );
  }
  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    if (!width || !height) return;
    const scale = framingScale(width, height);
    const centerX = (envelope.minX + envelope.maxX) / 2,
      centerY = (envelope.minY + envelope.maxY) / 2;
    camera.left = centerX - (scale * width) / 2;
    camera.right = centerX + (scale * width) / 2;
    camera.top = centerY + (scale * height) / 2;
    camera.bottom = centerY - (scale * height) / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    render();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else schedule();
  });
  intersection.observe(host);
  function visibility() {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else schedule();
  }
  function lost(event) {
    event.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
    paused = true;
    onFailure();
  }
  renderer.domElement.addEventListener("webglcontextlost", lost);
  function capture(event) {
    if (disposed || paused || !event.detail.host) return;
    transferring = true;
    transferredScene = api;
    rehost(event.detail.host, []);
    event.detail.runtime = api;
    expiry = setTimeout(() => {
      if (!adopted) api.cancel();
    }, 5000);
  }
  host.addEventListener("seet-capture", capture);
  document.addEventListener("visibilitychange", visibility);
  resize();
  const context = gsap.context(() => {
    if (!reduced) {
      gsap
        .timeline({ onUpdate: render, defaults: { ease: "power3.out" } })
        .from(world.position, { y: -0.25, duration: 1.4 }, 0)
        .from(world.scale, { x: 0.85, y: 0.85, z: 0.85, duration: 1.4 }, 0)
        .from(
          towers.map((t) => t.scale),
          { y: 0.01, duration: 1.1, stagger: 0.08 },
          0.15,
        );
    }
  });
  schedule();
  function rehost(nextHost, nextLabels) {
    host.removeEventListener("seet-capture", capture);
    resizeObserver.unobserve(host);
    intersection.unobserve(host);
    host = nextHost;
    labels = nextLabels;
    host.appendChild(renderer.domElement);
    host.addEventListener("seet-capture", capture);
    resizeObserver.observe(host);
    intersection.observe(host);
    resize();
  }
  const api = {
    adopt(nextHost, nextLabels, failure) {
      adopted = true;
      clearTimeout(expiry);
      homeHost = nextHost;
      homeLabels = nextLabels;
      onFailure = failure;
    },
    transferScale(rect) {
      return (
        framingScale(width, height) / framingScale(rect.width, rect.height)
      );
    },
    finish(nextHost, nextLabels) {
      if (disposed) return;
      rehost(homeHost || nextHost, homeLabels || nextLabels);
      transferring = false;
    },
    cancel() {
      transferring = false;
      if (transferredScene === api) transferredScene = null;
      api.dispose();
    },
    dispose() {
      // Login unmounts while this renderer moves; ownership then passes to Home.
      if (disposed || (transferring && !adopted)) return;
      disposed = true;
      clearTimeout(expiry);
      host.removeEventListener("seet-capture", capture);
      cancelAnimationFrame(frame);
      context.revert();
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      const geometries = new Set(),
        materials = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
  return api;
}
