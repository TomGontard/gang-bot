// src/services/playerService.js
export function computeHpMax(player, totalStats) {
  return 100 + (totalStats?.vitalite || 0) + Math.max(0, (player.level || 1) - 1);
}
export function clampHp(player) {
  player.hp = Math.min(player.hp, player.hpMax);
  if (player.hp < 0) player.hp = 0;
}
