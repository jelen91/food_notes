import type { CSSProperties } from 'react';

export type IconName =
  'arrow' | 'check' | 'book' | 'food' | 'moon' | 'note' | 'lock' | 'download' | 'plus' | 'sun' | 'leaf';
const paths: Record<IconName, React.ReactNode> = {
  arrow: (
    <>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  book: (
    <>
      <path d="M12 6v14M12 6C9 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-7-1-10 2Z" />
    </>
  ),
  food: (
    <>
      <path d="M5 3v6m3-6v6M2 3v6c0 4 6 4 6 0M5 12v9M19 3c-4 3-5 7-1 9h2V3Zm1 9v9" />
    </>
  ),
  moon: <path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z" />,
  note: (
    <>
      <path d="M16 3H5v18h15V7ZM16 3v5h4M8 12h8M8 16h6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="3" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
    </>
  ),
  leaf: (
    <>
      <path d="M19 3C6 2 2 8 6 15s15 1 13-12ZM6 21c0-7 4-10 9-14" />
    </>
  ),
};
export default function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
