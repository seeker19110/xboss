export type SRSCard = {
  ease_factor: number;
  interval_days: number;
  reps: number;
};

export type SRSResult = {
  ease_factor: number;
  interval_days: number;
  reps: number;
  next_review: Date;
};

export function reviewCard(card: SRSCard, quality: 0 | 1 | 2 | 3 | 4 | 5): SRSResult {
  const q = quality;

  if (q < 3) {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    return {
      ease_factor: card.ease_factor,
      interval_days: 1,
      reps: 0,
      next_review: next,
    };
  }

  let newInterval: number;
  if (card.reps === 0) {
    newInterval = 1;
  } else if (card.reps === 1) {
    newInterval = 6;
  } else {
    newInterval = Math.ceil(card.interval_days * card.ease_factor);
  }

  const newEase = Math.max(
    1.3,
    card.ease_factor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
  );

  const next = new Date();
  next.setDate(next.getDate() + newInterval);

  return {
    ease_factor: Math.round(newEase * 100) / 100,
    interval_days: newInterval,
    reps: card.reps + 1,
    next_review: next,
  };
}
