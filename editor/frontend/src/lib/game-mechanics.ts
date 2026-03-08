export interface CombatStats {
  attack: number;
  defense: number;
  affinity: number; // Percentage (-100 to 100)
}

export const GameMechanics = {
  // Formulas
  calculateRawActionPower: (skillPower: number, attack: number): number => {
    return skillPower * attack;
  },

  calculateDefenseMitigation: (defense: number): number => {
    return 100 / (100 + defense);
  },

  calculateEffectiveHP: (maxHp: number, defense: number): number => {
    // EHP = HP * (1 + Defense/100) or HP / Mitigation
    // Mitigation is 100/(100+Def), so 1/Mitigation is (100+Def)/100 = 1 + Def/100
    return maxHp * (1 + defense / 100);
  },

  calculateOutgoingAffinity: (userAffinity: number): number => {
    return 1 + (userAffinity / 100);
  },

  calculateIncomingAffinity: (targetAffinity: number): number => {
    return 1 - (targetAffinity / 100);
  },

  calculateFinalElementalDamage: (
    skillPower: number,
    attackerAttack: number,
    attackerAffinity: number,
    targetDefense: number,
    targetAffinity: number
  ): number => {
    const rawPower = GameMechanics.calculateRawActionPower(skillPower, attackerAttack);
    const outgoingAffinity = GameMechanics.calculateOutgoingAffinity(attackerAffinity);
    const defenseMitigation = GameMechanics.calculateDefenseMitigation(targetDefense);
    const incomingAffinity = GameMechanics.calculateIncomingAffinity(targetAffinity);

    return rawPower * outgoingAffinity * defenseMitigation * incomingAffinity;
  },

  // Descriptions
  descriptions: {
    max_hp: "Total health",
    attack: "Increases action power",
    defense: "Reduces incoming direct damage",
    affinity: "Modifies elemental actions and reactions for Fire, Ice, Earth, Wind, Light, Shadow",
    affinity_effects: (element: string) => [
      `Increases power of ${element} actions`,
      `Reduces damage taken from ${element}`,
      `Increases strength of ${element} status effects`,
      `Increases resistance against hostile ${element} status effects`,
    ],
  },
};
