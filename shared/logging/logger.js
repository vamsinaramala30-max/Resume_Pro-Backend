export default function logEvent({ level = "info", message, requestId, extra } = {}) {
  const payload = {
    level,
    message,
    ...(requestId ? { requestId } : null),
    ...(extra ? { extra } : null),
    time: new Date().toISOString(),
  };

  // Keep it dependency-free for now.
  if (level === "error") console.error(JSON.stringify(payload));
  else console.log(JSON.stringify(payload));
}

