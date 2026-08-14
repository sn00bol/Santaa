(This file for anyone try to pull request on it)
# ISSUE
---
## FIXED ISSUE OR CURRENTLY REVIEWED

### [ISSUES-001]: Fishing cooldown
 - **Status**: Fixed
 - **Detail**: Cooldown logic adjusted so exceeding 5 catches sets a 1-hour cooldown; users receive a message when limit reached or if cooldown active

### [ISSUES-002]: sell item
 - **Status**: Fixed
 - **Detail**: Selling has added in v1.1.1, before update the only way to "sell" (which is not working) at inventory commands

### [ISSUES-003]: fish.js in wrong locate
 - **Status**: Fixed
 - **Detail**: Before moving, `fish.js` runs fine in `src/commands/EconomicCMD/` but when move to minigames folder it cause buggy

### [ISSUES-004]: Cannot equip than one item
 - **Status**: Fixed
 - **Detail**: Added `unequipItem()` to `database/rpgmanager.js` and adjusted `inventory` equip/sell handlers so equipping replaces previous item and selling an equipped item unequips it.

### [ISSUES-005]: "ephemeral" for interaction response options is deprecated
- **Status**: Not necessary to fix
- **Detail**: the library shifted to managing message visibility via bitfield flags at log

### [ISSUES-006]: Jobs embed when using `Zjob work` its not optimized
- **Status**: Fixed
- **Detail**: The work flow currently sends the minigame result and the job result as two separate embeds. The output feels noisy and makes the reward summary harder to read.

### [ISSUES-007]: Jobs penalty minigame currently only have left and right
- **Status**: Fixed
- **Detail**: The penalty kick minigame only have `left` and `right`, so the interaction feels too limited and repetitive.

### [ISSUES-008]: Networth only calculate the user's earnings and bank balance not total money they earn
- **Status**: Fixed
- **Detail**: The old balance view only sums the available balance and bank balance. It does not reflect total lifetime earnings or other tracked assets, so the displayed net worth can be misleading.

### [ISSUE-009]: All command use cooldown have time too short
- **Status**: Fixed
- **Detail**: Had changed via package.json: `"dev": "set COOLDOWN_MODE=test&& nodemon src/index.js"`, with set COOLDOWN_MODE=test&& make cooldown more faster

### [ISSUE-010]: Cooldown sometime not work
- **Status**: Fixed
- **Detail**: Before fixed I make cooldownconfig.js but its literally useless lol, v1.0.1 STABLE had fixed it

### [ISSUE-011]: The job embed too complicated and many useless info and job names repeat twice
- **Status**: Fixed
- **Detail**: The embed too long than average command I make, also the job name repeat twice

### [ISSUE-012]: Currency emoji on Balance canvas cannot render emoji
- **Status**: Fixed
- **Detail**: the canvas not supporting emoji lol

### [ISSUE-013]: Wanted level increased too drastically even few commands
- **Status**: Fixed
- **Detail**: The wanted level has been increased too drastically, even though only a few crime/steal commands, new update fix it with required 5 times using crime/steal command to get 1 star

### [ISSUE-014]: Wanted level decay too short
- **Status**: Fixed
- **Detail**: The wanted level decay too short (I set it on config.js only have 10 seconds for decay)

### [ISSUE-015] Not using fishing rod durability
- **Status**: Fixed
- **Detail**: At start v1.2.0-alpha.2, the durability specific type for fishing rod currently not using for somehow and I have to set random durability prevent bugs (v1.2.0-alpha.3 fixed it)

### [ISSUE-017]: Time closing fish too fast
- **Status**: Fixed
- **Detail**: Time closing command too fast, on v1.2.0-alpha.3 change 2 minutes to 10 minutes

### [ISSUE-019]: Fishing equipment not using "real" item
- **Status**: Fixed
- **Detail**: Before fix equipment literally using "ghost" item which is mean always owned zero, random durability, and bait too

### [ISSUE-020]: When use "Zbeg @user", it ask "beg for money?" and when accept it it give money without that user permission
- **Status**: Fixed
- **Detail**: detail on issue name bruh

---
## STILL NOT FIX OR OTHER ISSUE

### [ISSUE-016]: buckets, skills not added
- **Status**: Still in development
- **Detail**: Currently which button had added: Shop, Equipment, location, fishing now the rest of them are unusable or still developing

### [ISSUE-018]: Wanted Level not working on fish
- **Status**: Not added
- **Detail**: Well who gonna add that when fish still unstable?

### [ISSUE-019]: Buckets capacity on fishing now not working
- **Status**: Not fixed
- **Detail**: After user winning on fishing minigames, you could notice that buckets capacity not change anything because not adding buckets on alpha 4

---
# BUG
## FIXED BUGS OR CURRENTLY REVIEWED

### [BUG-001]: Equipment button on fish shop too slow to respond
- **Status**: Fixed
- **Detail**: At the main menu this button work perfectly but at fish shop, normally it work but when goes in buying item it too slow to respond discord

### [BUG-002]: Click "reel in" button to fast
- **Status**: Discord problem
- **Detail**: At fish tug of war minigames, if user clicking reel in too fast make bot couldnt respond in time, had fixed but discord moment again

---
## STILL NOT FIX OR OTHER ISSUE

### [BUG-003]: Still not found
