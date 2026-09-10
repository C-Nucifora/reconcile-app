const paths = {
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  download: "M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 7h6M9 11h6M9 15h3",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  lock: "M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
};

export default function Icon({
  name,
  size = 18,
}: {
  name: keyof typeof paths;
  size?: number;
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
    >
      <path d={paths[name]} />
      {name === "people" && <circle cx="9" cy="7" r="4" />}
    </svg>
  );
}

export function Avatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  const hue = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
  return (
    <span
      className={`avatar avatar-${hue}${small ? " avatar-small" : ""}`}
      aria-hidden="true"
    >
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
