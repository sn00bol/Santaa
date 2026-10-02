# Mining Rarity

These are base weights, not final percentages. Luck modifies the weights by tier and the eligible weights are normalized before rolling.

| Rarity | Base weight | Base EXP |
| --- | ---: | ---: |
| Common | 50 | 5 |
| Uncommon | 30 | 12 |
| Rare | 10 | 25 |
| Epic | 5.25 | 45 |
| Legendary | 4.25 | 100 |
| Mythic | 0.5 | 300 |

For a normal pickaxe with luck 1 and all ore pools populated, Legendary and Mythic are unavailable. The remaining base weights normalize to approximately Common 52.49%, Uncommon 31.50%, Rare 10.50%, and Epic 5.51%.

The effective luck multiplier is the pickaxe's `luck` plus Mining skill bonuses, with a minimum of 0.05. A rarity at tier index `n` receives `base weight * luck^n`, where Common is tier 0 and Mythic is tier 5. The eligible weights are then normalized. Luck below 1 lowers higher-tier odds; luck above 1 raises them.

Gold Pickaxe and Black Hole can roll Legendary and Mythic. A Legendary roll yields an Epic ore, and a Mythic roll yields a Legendary ore. Other pickaxes, including Dynamite, cannot roll those tiers.

## Dynamite

Equipping Dynamite adds 3-5 bonus ore rolls to a mining session. At least 3 free slots across unlocked backpacks are required to use it. If fewer slots remain than ores rolled, only the highest-rarity ores that fit are kept. One Common probability is chosen uniformly from 90% to 95% per use and applied to every bonus roll in that batch; the remaining chance uses the tool's luck-adjusted weights. Dynamite is consumed when the session starts, then the player switches to Your Hand. Bonus ores enter session loot and are lost if the session fails or expires. Ore cells already placed on the board use the normal pickaxe luck calculation.

## EXP

Ore EXP scales by `max(1, floor(item cost / 10))`. Mining EXP from collected ore is increased by Efficient Strike. Skill points are awarded from cumulative Mining EXP at one point per 100 EXP; this skill progress is separate from RPG level EXP.

Black Hole has a 10% chance to duplicate a revealed Rare, Epic, Legendary, or Mythic board ore.