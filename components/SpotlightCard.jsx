"use client";

import { useRef } from "react";

const SpotlightCard = (props) => {
  const {
    children,
    className = "",
    spotlightColor = "rgba(255, 255, 255, 0.18)",
    onMouseMove = undefined,
    ...divProps
  } = props ?? {};

  const divRef = useRef(null);

  const handleMouseMove = (e) => {
    onMouseMove?.(e);
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    divRef.current.style.setProperty('--mouse-x', `${x}px`);
    divRef.current.style.setProperty('--mouse-y', `${y}px`);
    divRef.current.style.setProperty('--spotlight-color', spotlightColor);
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      className={`card-spotlight ${className}`}
      {...divProps}
    >
      {children}
    </div>
  );
};

export default SpotlightCard;
