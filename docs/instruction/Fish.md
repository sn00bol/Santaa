# Fishing Guide

Use `Zfish` to open the Fishing menu. The first visit grants starter gear: a Default Rod, a Default Bucket, a hand rod, a finger bait, and five Worms. Choose a location before starting a cast; if no location is selected, Fishing now opens the location menu.

## Prepare to Fish

Use **Equipment** to select an owned rod and bait. Bare Hand is always available and has unlimited durability; equipped rods lose 1 durability when a cast starts. A broken rod falls back to Bare Hand. The bait selector is disabled while using Bare Hand.

Use **Location** to preview maps and travel to one you have unlocked. Map tiers unlock from your lifetime catch history:

| Tier | Requirement |
| --- | --- |
| 1 | No requirement |
| 2 | 100 Common, 50 Uncommon, and 5 Rare catches |
| 3 | 300 combined Common + Uncommon, 50 Rare, and 10 Epic catches |
| 4 | 500 combined Common + Uncommon, 100 Rare, 50 Epic, and 5 Legendary catches |
| Hidden | 1,000 total catches and at least 1 Mythic catch |

The location panel displays each map's configured rarity rates. The active catch roller currently uses shared rarity weights modified by rod, weather, and day/night rather than the map rate table. Map tier still affects fish strength and the fish-versus-junk check.

## Cast and Reel

Press **Fishing now** to begin. After a short wait, a Tug of War starts. Reel in repeatedly to pull the fish toward you before it escapes. Fish strength, movement, behavior, rod power, bait power, and the Im Smarter skill affect the fight; Legendary and Mythic fish also restrict how quickly you can reel. The fish escapes if it reaches the end of the bar or the timer expires.

Winning the tug-of-war is followed by a separate fish-versus-junk roll. Map tiers 1-2 start with a 60% fish threshold; tiers 3-4 start at 50%. Weather and applicable skills adjust that threshold. A fish result awards one or more fish according to the rod; a junk result awards random items instead.

Fish caught are added to your inventory and placed in an available bucket when possible. A full bucket sends overflow fish to your general inventory. Successful fish catches grant EXP, update catch history used for map unlocks, and can award one Fishing Skill Point for each 100 cumulative Fishing EXP. Junk does not count as a fish catch.

Fishing rarity uses these shared base weights before modifiers: Common 40, Uncommon 30, Epic 20, Rare 9, Legendary 1, and Mythic 0.5. Rain and clouds raise some Uncommon/Rare weights; night reduces Common/Uncommon and raises Rare/Epic weights. The weights are not guaranteed final percentages.

## Rods and Bait

- Shark Rod doubles the base Mythic weight.
- Bucket Rod catches 3-5 fish or junk items per result, with a rarity penalty.
- Nice Glove catches 2 fish or junk items per result.
- Finger is always available and limits the rolled fish to Rare or below.
- Worm, Crank, and Jig have different reel power during Tug of War.

**Dynamite Kaboom note:** the current Fishing now handler consumes Kaboom and switches to Bare Hand before a cast begins. Its advertised multi-catch does not currently trigger.

## Buckets and Selling

Use **View buckets** to inspect your owned buckets and their combined capacity. Select a bucket to view its fish, lock or unlock it, sell one fish, or sell all sellable fish in that bucket. **Sell all fish** from the overview sells across unlocked buckets. The game first tries the active bucket, then another unlocked bucket with space; overflow goes to general inventory.

Buy additional rods, bait, and buckets from the Fishing Shop. The Shop shows item details before purchase. Buckets Enhanced and One Hand affect bucket fishing/capacity through their skill effects; skills can also unlock two additional bucket display slots.

## Skills

Fishing Skill Points are earned from successful fish EXP, at one point per 100 cumulative EXP. Spend points in three branches:

- **Economic:** Shopping God lowers Fishing Shop prices; The Sellers Man increases fish sale value.
- **Fishing Rod:** Hand Lovers improves the Bare Hand fish check; Im Stronger increases rod durability; Im Smarter improves reel power. Bazookanist and Buckets Enhanced are tied to their named rods, though Kaboom currently exits before casting.
- **Buckets:** One Hand increases each bucket's capacity; Slot #6 and Slot #7 unlock additional display slots, with Slot #7 requiring Slot #6.

Use the Skills menu to inspect levels, prerequisites, and point costs. Resetting skills refunds spent points; it does not remove earned points.

## Weather and Time

Each map has changing weather. Production weather normally resets every six hours; test mode uses a shorter interval. Day/night follows UTC+7, changing at 06:00 and 18:00. Weather affects fish-versus-junk odds; Rainy and Cloudy also modify some rarity weights.
