import { useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import gsap from "gsap";

// Presentation-only routing: keep existing history, authentication and data flows.
export function usePageMotion(page) {
  const previous = useRef(page);
  const departure = useRef(null);
  const leaving = useRef(false);
  const deadline = useRef(null);
  useLayoutEffect(() => {
    departure.current?.kill();
    clearTimeout(deadline.current);
    departure.current = null;
    leaving.current = false;
    const changed = previous.current !== page;
    previous.current = page;
    if (
      !changed ||
      ["/home", "/login"].includes(page) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const surface = document.getElementById("root")?.firstElementChild;
    if (!surface) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        surface,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.3,
          ease: "power2.out",
          clearProps: "opacity",
        },
      );
    });
    return () => context.revert();
  }, [page]);
  useLayoutEffect(
    () => () => {
      departure.current?.kill();
      clearTimeout(deadline.current);
    },
    [],
  );

  return function leaveHome(commit) {
    const surface = document.querySelector(".home-experience");
    if (
      !surface ||
      document.hidden ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      commit();
      return;
    }
    if (leaving.current) return;
    leaving.current = true;
    let committed = false;
    const finish = () => {
      if (committed) return;
      committed = true;
      clearTimeout(deadline.current);
      flushSync(commit);
    };
    // Navigation must also finish when a low frame rate throttles the tween.
    deadline.current = setTimeout(finish, 400);
    departure.current = gsap.to(surface, {
      opacity: 0,
      duration: 0.2,
      ease: "power2.in",
      overwrite: "auto",
      onComplete: finish,
    });
  };
}
