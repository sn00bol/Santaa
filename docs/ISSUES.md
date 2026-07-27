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
- **Detail**: the library shifted to managing message visibility via bitfield flags

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

---
## STILL NOT FIX OR OTHER ISSUE
### [ISSUE-015]: Currently Not found
---
# BUG
### [BUG-000]: Non-bug currently found
