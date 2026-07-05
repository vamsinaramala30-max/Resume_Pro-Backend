export function addDaysFromNow(days) {
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

export function getPlanFromBody(bodyPlan) {
  if (!bodyPlan) return null;
  const p = String(bodyPlan).toUpperCase();
  if (p === "PRO" || p === "TEAM") return p;
  return null;
}

