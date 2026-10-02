# Mining Guide

Use `Zmine` to open Mining. The first visit grants a Default Pickaxe, Default Helmet, and Default Backpack. Equip owned tools and backpacks, then select **Mining now** to start a 5x5 minesweeper-style run. The Location menu is currently under construction; Default Mine is the active location.

## Board and Run

The board has 22 playable cells and three action cells: Exit, Flag Mode, and Cash Out. A run hides 3-4 bombs and 4-6 ore cells among empty cells. It may also contain a chest, trap, or Gold Mine. Reveal empty cells to open connected safe spaces; numbered cells show adjacent bombs. Flag suspected bombs before revealing them.

- **Ore:** adds the mineral to session loot. Keep a revealed ore individually or Cash Out to bank all remaining loot.
- **Bomb:** ends the run and loses uncommitted session loot. A working helmet absorbs the blast and loses 3 Helmet HP. Without helmet protection, you lose 15 HP, reduced by Blast Training but never below 1 damage.
- **Chest:** gives coins, EXP, or a mineral directly to general inventory.
- **Trap:** either freezes you for 5 seconds or shuffles unrevealed cells.
- **Gold Mine:** gives 50,000-99,999 coins and does not end the run.

Reveal every safe cell to complete the board. A completed board banks session loot and grants +25% EXP. Exiting or letting the menu expire leaves unbanked loot at risk; use Cash Out when you want to secure it.

Ore kept individually or cashed out grants Mining EXP. EXP is based on the ore's rarity and item cost; reaching a level threshold advances your RPG level. If a backpack fills, overflow ore is still added to general inventory. Black Hole can duplicate a revealed Rare-or-better board ore, including ores uncovered by a chain reveal.

## Pickaxes and Rarity

Pickaxe luck changes rarity weights by tier: luck below 1 lowers higher-tier odds, while luck above 1 raises them. Mining skills add to pickaxe luck. Base weights are Common 50, Uncommon 30, Rare 10, Epic 5.25, Legendary 4.25, and Mythic 0.5; these are weights, not guaranteed percentages.

Ordinary pickaxes cannot roll Legendary or Mythic. Gold Pickaxe and Black Hole can roll those tiers, but a Legendary roll yields an Epic ore and a Mythic roll yields a Legendary ore. Black Hole also has a 10% chance to duplicate a revealed Rare+ board ore.

## Dynamite

Dynamite is a one-use tool. At least 3 free slots across unlocked backpacks are required; otherwise the attempt is blocked and Dynamite is not consumed. On use, it self-destructs and you switch to Your Hand for the next run.

One Common chance between 90% and 95% is selected for the use. Dynamite rolls 3-5 bonus ores; if backpack space is lower than the roll count, only the highest-rarity ores that fit are kept. Therefore the bonus remains between 3 and 5 ores. The bonus appears on the board summary and is part of session loot, so it is lost if the run fails before banking it.

## Backpacks, Helmets, and Shop

Use **Equipment** to select a pickaxe and helmet. Pickaxes lose 1 durability when a run starts; a pickaxe that breaks falls back to Your Hand. Helmets absorb bomb damage and lose 3 HP per blast; a broken helmet is unequipped. Use the shop to buy pickaxes, helmets, and backpacks.

Use **View backpack** to inspect capacity and minerals. Multiple unlocked backpacks can be used; mining tries the active backpack and then another unlocked backpack with room. Lock a backpack to keep it out of automatic storage and selling. Select a mineral or sell all sellable minerals from the selected backpack; the overview can sell across all unlocked backpacks.

## Mining Skills

Every 100 cumulative Mining EXP from kept ore grants one Mining Skill Point. This progress is separate from RPG level EXP. Spend points across three branches:

- **Prospecting:** Keen Eye and Vein Reader increase pickaxe luck.
- **Toolcraft:** Steady Grip may preserve pickaxe durability; Efficient Strike increases ore EXP.
- **Survival:** Blast Training reduces unprotected bomb damage.

Use the Skills menu to review level effects and prerequisites. Resetting skills refunds spent points while retaining earned points.
