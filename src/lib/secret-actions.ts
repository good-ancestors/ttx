import { getProbabilityCard } from "./game-data";

/**
 * Redact a secret action for public display.
 * Shows role + probability level + outcome, but NOT the action text.
 */
export function redactSecretAction(
  roleName: string,
  action: { text: string; priority: number; secret?: boolean; probability?: number; rolled?: number; success?: boolean }
): string {
  if (!action.secret) return action.text;

  const prob = action.probability ? getProbabilityCard(action.probability) : null;
  const probLabel = prob ? prob.label.toLowerCase() : "unknown";
  const outcome = action.success === true ? "that succeeded" : action.success === false ? "that failed" : "";

  return `${roleName} took a covert action (${probLabel} odds) ${outcome}`.trim();
}