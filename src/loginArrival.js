import gsap from "gsap";

let pending = null;

// 只交接一个实时 WebGL 场景，不截屏、不创建第二个模型。
export function captureLoginArrival() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const host = document.querySelector(".login-visual .island-canvas");
  const panel = document.querySelector(".login-visual");
  if (!host || !panel) return;
  const rect = host.getBoundingClientRect(),
    clip = panel.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "login-arrival-layer";
  layer.setAttribute("aria-hidden", "true");
  const stage = document.createElement("div");
  stage.className = "login-arrival-stage";
  layer.append(stage);
  document.body.append(layer);
  gsap.set(layer, {
    clipPath: `inset(${clip.top}px ${Math.max(0, innerWidth - clip.right)}px ${Math.max(0, innerHeight - clip.bottom)}px ${clip.left}px)`,
  });
  gsap.set(stage, {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    transformOrigin: "50% 50%",
  });
  const detail = { host: stage };
  host.dispatchEvent(new CustomEvent("seet-capture", { detail }));
  if (!detail.runtime) {
    layer.remove();
    return;
  }
  pending = {
    runtime: detail.runtime,
    rect,
    layer,
    stage,
    time: performance.now(),
    owner: null,
  };
}

export function playLoginArrival(root) {
  const source = pending;
  const target = root.querySelector(".home-hero .island-canvas");
  if (!source || !target || performance.now() - source.time > 5000) return null;
  const destination = target.getBoundingClientRect();
  const scene = target.closest(".data-island");
  const content = root.querySelectorAll(
    ".home-header, .home-hero-copy, .home-hero-note, .home-hero-bottom",
  );
  const token = {};
  source.owner = token;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    source.runtime.finish(target, [...scene.querySelectorAll(".scene-label")]);
    gsap.set(scene, { clearProps: "opacity" });
    gsap.set(content, { clearProps: "opacity,transform" });
    source.layer.remove();
    if (pending === source) pending = null;
  };
  const timeline = gsap.timeline({
    defaults: { ease: "power2.inOut" },
    onComplete: finish,
  });
  timeline
    .set(scene, { opacity: 0 })
    .to(
      source.stage,
      {
        x:
          destination.left +
          destination.width / 2 -
          source.rect.left -
          source.rect.width / 2,
        y:
          destination.top +
          destination.height / 2 -
          source.rect.top -
          source.rect.height / 2,
        scale: source.runtime.transferScale(destination),
        duration: 1.15,
      },
      0,
    )
    .to(source.layer, { clipPath: "inset(0px 0px 0px 0px)", duration: 0.65 }, 0)
    .from(
      content,
      { opacity: 0, duration: 0.7, stagger: 0.025, clearProps: "opacity" },
      0.35,
    );
  const resize = () => {
    timeline.kill();
    finish();
  };
  window.addEventListener("resize", resize);
  return () => {
    timeline.kill();
    window.removeEventListener("resize", resize);
    // StrictMode immediately sets up the same effect again; defer abandonment.
    queueMicrotask(() => {
      if (!finished && source.owner === token) {
        source.runtime.cancel();
        source.layer.remove();
        if (pending === source) pending = null;
      }
    });
  };
}
