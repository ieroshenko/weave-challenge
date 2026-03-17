export function formatNumber(value: number | undefined, digits = 0) {
  if (value === undefined || Number.isNaN(value)) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatScore(value: number | undefined) {
  return formatNumber(value, 1);
}

export function formatShortDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatTimestamp(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatHours(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "N/A";
  }

  if (value < 24) {
    return `${formatNumber(value, 1)}h`;
  }

  return `${formatNumber(value / 24, 1)}d`;
}
