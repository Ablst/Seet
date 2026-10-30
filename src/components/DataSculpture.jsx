import { useEffect, useRef, useState } from "react";

export default function DataSculpture() {
  const host = useRef(null),
    labels = useRef([]);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      setReduced(preference.matches);
    };
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    let cancelled = false,
      instance;
    setReady(false);
    // The 3D engine is a separate chunk; the form and navigation work while it loads.
    import("./dataIsland.mjs")
      .then(({ createDataIsland }) => {
        if (cancelled) return;
        instance = createDataIsland(host.current, labels.current, {
          reduced,
          onFailure: () => {
            if (!cancelled) setReady(false);
          },
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
      instance?.dispose();
    };
  }, [reduced]);
  return (
    <div className={`data-sculpture data-island ${ready ? "scene-ready" : ""}`}>
      <div className="island-fallback" aria-hidden="true">
        <svg className="sculpture-art" viewBox="0 0 580 480" fill="none">
          <ellipse
            className="sculpture-orbit"
            cx="285"
            cy="351"
            rx="245"
            ry="87"
          />
          <ellipse
            className="sculpture-orbit"
            cx="285"
            cy="351"
            rx="194"
            ry="66"
          />
          <path
            className="sculpture-axis"
            d="M35 385 309 225 555 368M309 225v-97"
          />
          {[
            { x: 95, y: 257, h: 119 },
            { x: 225, y: 158, h: 195 },
            { x: 355, y: 50, h: 278 },
          ].map(({ x, y, h }, i) => (
            <g className={`sculpture-column column-${i}`} key={i}>
              <path
                className="column-front"
                d={`M${x} ${y}l63 36v${h}l-63 -36z`}
              />
              <path
                className="column-side"
                d={`M${x + 63} ${y + 36}l63 -36v${h}l-63 36z`}
              />
              <path
                className="column-top"
                d={`M${x} ${y}l63 -36 63 36 -63 36z`}
              />
              <path
                className="column-highlight"
                d={`M${x + 63} ${y + 36}v${h}`}
              />
            </g>
          ))}
          <g className="sculpture-caption">
            <path className="sculpture-axis" d="M71 271 35 250M480 35h45" />
            <text x="18" y="236">
              从零散数字
            </text>
            <text x="443" y="21">
              到清晰答案
            </text>
          </g>
        </svg>
      </div>
      <div className="island-canvas" ref={host} aria-hidden="true" />
      <div className="island-labels" aria-hidden="true">
        {["数据", "图表", "报告"].map((text, index) => (
          <span
            className="scene-label"
            key={text}
            ref={(element) => {
              labels.current[index] = element;
            }}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
