/** Status tones shared by chips, badges and alerts (PRD FR-UI-05). */
export const toneClasses = {
  success: "bg-success text-success-ink",
  warning: "bg-warning text-warning-ink",
  danger: "bg-danger text-danger-ink",
  info: "bg-info text-info-ink",
  neutral: "bg-neutral text-neutral-ink",
  primary: "bg-primary text-primary-ink",
} as const;

export type Tone = keyof typeof toneClasses;
