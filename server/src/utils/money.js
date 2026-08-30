/**
 * Money is stored in rupees as a Float. Every arithmetic result passes through
 * `round2` so we never persist 1499.9999999999998, and gateways get integer paise.
 */
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const toPaise = (rupees) => Math.round(round2(rupees) * 100);
export const fromPaise = (paise) => round2(Number(paise) / 100);
export const sum = (arr, pick = (x) => x) => round2(arr.reduce((t, x) => t + Number(pick(x) || 0), 0));
