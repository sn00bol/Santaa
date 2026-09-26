# Minigames System (`src/minigames`)

Complex minigames are usually divided into 5 parts:
- **Core (`...Core.js`):** Handles main logic, items skill and calculations exp,...
- **UI (`...UI.js` or `...Board.js`):** Handles display and gameplay for minigames
- **Map Manager (`MapManager.js`):** Where managed all map and random rarity
- **Shop (`...Shop.js`):** Handle or a single commands to view/buy items (its same as shop)
- **Main (`...js`):** Main command file to control all file above
- Other: At times, minigames generate extra files due to overly complex codebase like *fishBucket* and *fishSkill*,..  
(for ...list.js like fishlist or minelist, its just a list of items)

Simple or other minigames type: only 1 single file .js