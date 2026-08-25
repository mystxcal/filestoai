// Drawn here rather than imported, so the interface carries no icon package.
// Phosphor geometry: 24-unit grid, 1.75 stroke, round caps.

type Props = { className?: string };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Glyph({ className = "size-4", children }: Props & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      {children}
    </svg>
  );
}

export const Folder = (p: Props) => (
  <Glyph {...p}>
    <path {...stroke} d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18Z" />
  </Glyph>
);

export const File = (p: Props) => (
  <Glyph {...p}>
    <path {...stroke} d="M6 4.5h7l5 5v10a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-15a.5.5 0 0 1 .5-.5Z" />
    <path {...stroke} d="M12.5 4.75V10h5.25" />
  </Glyph>
);

export const Caret = (p: Props) => (
  <Glyph {...p}>
    <path {...stroke} d="M9.5 6 15.5 12l-6 6" />
  </Glyph>
);

export const Tick = (p: Props) => (
  <Glyph {...p}>
    <path {...stroke} d="M5 12.5 9.5 17 19 7" />
  </Glyph>
);

export const Dash = (p: Props) => (
  <Glyph {...p}>
    <path {...stroke} d="M6.5 12h11" />
  </Glyph>
);

export const Copy = (p: Props) => (
  <Glyph {...p}>
    <rect {...stroke} x="8.5" y="8.5" width="11" height="11" rx="1.75" />
    <path {...stroke} d="M15.5 5.5A1 1 0 0 0 14.5 4.5h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1" />
  </Glyph>
);

export const Download = (p: Props) => (
  <Glyph {...p}>
    <path {...stroke} d="M12 4v11m0 0 4-4m-4 4-4-4" />
    <path {...stroke} d="M4.5 17.5v1a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1" />
  </Glyph>
);

export const Search = (p: Props) => (
  <Glyph {...p}>
    <circle {...stroke} cx="11" cy="11" r="6" />
    <path {...stroke} d="m15.5 15.5 4 4" />
  </Glyph>
);

export const Cross = (p: Props) => (
  <Glyph {...p}>
    <path {...stroke} d="m6.5 6.5 11 11m0-11-11 11" />
  </Glyph>
);

export const Clock = (p: Props) => (
  <Glyph {...p}>
    <circle {...stroke} cx="12" cy="12" r="8" />
    <path {...stroke} d="M12 7.5V12l3 2" />
  </Glyph>
);

export const Sun = (p: Props) => (
  <Glyph {...p}>
    <circle {...stroke} cx="12" cy="12" r="4" />
    <path {...stroke} d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </Glyph>
);

export const Moon = (p: Props) => (
  <Glyph {...p}>
    <path {...stroke} d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z" />
  </Glyph>
);

export const Refresh = (p: Props) => (
  <Glyph {...p}>
    <path {...stroke} d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7" />
    <path {...stroke} d="M19.5 4.5V9H15" />
  </Glyph>
);

export const External = (p: Props) => (
  <Glyph {...p}>
    <path {...stroke} d="M14 5h5v5" />
    <path {...stroke} d="m19 5-7.5 7.5" />
    <path {...stroke} d="M18 14.5v4A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4" />
  </Glyph>
);

export const Reveal = (p: Props) => (
  <Glyph {...p}>
    <path {...stroke} d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18Z" />
    <circle {...stroke} cx="12" cy="14" r="2.25" />
  </Glyph>
);

export const Warning = (p: Props) => (
  <Glyph {...p}>
    <path {...stroke} d="M12 4.5 21 19.5H3Z" />
    <path {...stroke} d="M12 10.5v4M12 17.2v.05" />
  </Glyph>
);
