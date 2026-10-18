// Bộ biểu tượng nét mảnh (lưới 24), vẽ bằng currentColor.

const P: Record<string, string> = {
  play: "M7 4.5v15l12-7.5z",
  pause: "M7 4h3.5v16H7zM13.5 4H17v16h-3.5z",
  home: "M5 5v14M19 5l-10 7 10 7z",
  stepBack: "M17 6l-8 6 8 6zM7 6v12",
  stepFwd: "M7 6l8 6-8 6zM17 6v12",
  undo: "M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2",
  redo: "M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h2",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  download: "M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  eyeOff: "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.3-.5 4.6-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  magnet: "M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4zM6 8h4M14 8h4",
  present: "M3 4h18v12H3zM8 20h8M12 16v4M10 8l4 2-4 2z",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.5",
  plan: "M3 3h18v18H3zM3 9h18M9 21V9",
  cube: "M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10",
  split: "M3 4h18v16H3zM12 4v16",
  mirror: "M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z",
  distribute: "M4 4v16M20 4v16M9 8h6v8H9z",
  wingL: "M3 4h5v16H3zM20 12h-9M14 8l-4 4 4 4",
  swap: "M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4",
  wingR: "M16 4h5v16h-5zM4 12h9M10 8l4 4-4 4",
  sync: "M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5",
  zoomIn: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5M8 11h6M11 8v6",
  zoomOut: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5M8 11h6",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  loop: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  close: "M6 6l12 12M18 6L6 18",
  chevron: "M6 9l6 6 6-6",
  music: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  userPlus: "M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a8 8 0 0 1 14-5.3M19 14v6M16 17h6",
  follow: "M12 3v18M5 8l-3 4 3 4M19 8l3 4-3 4",
  video: "M3 6h12v12H3zM15 10l6-3v10l-6-3z",
  warn: "M12 3l10 18H2zM12 10v5M12 18v.5",
  camera: "M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  copy: "M8 8h12v12H8zM4 16V4h12",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7",
  ghost: "M5 21V10a7 7 0 0 1 14 0v11l-3-2-2 2-2-2-2 2-2-2zM9 10v1M15 10v1",
  tag: "M3 3h8l10 10-8 8L3 11zM7.5 7.5v.5",
  print: "M6 9V3h12v6M6 18H3v-8h18v8h-3M6 14h12v7H6z",
  sidebar: "M3 4h18v16H3zM9 4v16",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  unlock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2",
  turn: "M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 3v5.5h5.5",
  learn: "M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM4 9l8 1 6-5M12 10v5l-3 6M12 15l4 6",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
};

const FILLED = new Set(["play", "pause"]);

export function Icon({ name, size }: { name: keyof typeof P | string; size?: number }) {
  const d = P[name] ?? "";
  const filled = FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"
      fill={filled ? "currentColor" : "none"} stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}
