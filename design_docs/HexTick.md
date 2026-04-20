A software written to build and run autonomous factions on a hex map, that allows player exploration according to Cairn 2e rules

### Object Model
- All attributes are on a 1-100 scale (except population). 
- Any _max_ values caps the associated attribute.
- negative numbers are possible
- any modifiers are on the rounded-down multiple of 10. e.g. a score of 57 is a +5 modifier. 
- every tick is an 8 hour shift. Buttons will be available to tick either a shift or a whole day

#### Factions

| Attribute           | Description                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| is_mobile           | can move on the board                                                                                                                                                 |
| speed               | how many tile points they get per day. Derived from population, resources, and technology                                                                             |
| population          | has an initial value, but can increase or decrease from birth, death, war, and join forces events                                                                     |
| technology          | represents equipment quality and level of sophistication                                                                                                              |
| technology_max      | max technology level. Is increased by dungeon-delving                                                                                                                 |
| resources           | primarily food, but also represents medical equipment and comfort items.                                                                                              |
| resource_generation | a modifier to how well the faction generates resources on a hex. avg(population + technology)                                                                         |
| agreeableness       | how likely the faction is to trade or fight with another faction. Average is 0, this can go negative                                                                  |
| combat_skill        | how good they are at fighting                                                                                                                                         |
| combat_skill_max    | average of population + technology + resources. Gets a bonus modifier from negative agreeableness.                                                                    |
| comfort             | determines whether the faction will travel. population - resources + (resource_generation * hex resources)                                                            |
| fear                | proximity of another faction with low agreeableness or high combat_skill                                                                                              |
| scouting            | how many hexes ahead they can see                                                                                                                                     |
| population_trend    | modifier to whether they get a birth or death. (resources - population) / 10. Disease may modify this.                                                                |
| conditions          | list of Disease (will affect above stats), Famine (resources less than population for last three days), Dying (population under 20, and population_trend is negative) |
| destination         | GM can set a hex for the faction to crawl to                                                                                                                          |
| theology            | how likely the faction is to Delve.                                                                                                                                   |

##### Faction Actions

Factions work in shifts just like PCs, but don't need to rest. They can take three of these actions a day.

| Action | Description                                                                                                                                                                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supply | replenish resources from resources on the hex. They can get up to their resource_generation. subtract the resource_generation mod value (rounded to nearest multiple of ten) from the hex.                                                                        |
| Travel | Move up to half their speed                                                                                                                                                                                                                                       |
| Trade  | Trade with another group. Can trade resources for technology.                                                                                                                                                                                                     |
| Merge  | Join another faction. If a battle occurs that leaves population low, or two factions with sufficiently high agreeableness interact, this is a potential but rare outcome                                                                                          |
| Battle | Join in battle with another faction. Both make a d20 roll, add their combat_skill. Whoever wins subtracts their combat_skill from the other's population, and the winner loses half the loser's combat_skill. They can take resources equal to their combat_skill |
| Train  | roll d6, add it to their combat_skill. Occurs if resource trend is good and tech level is within 10 of their max. Whoever has the higher population modifies the other's theology by their theology modifier, to a max/min of their own theology.                 |
| Craft  | roll d6, add it to their technology up to their max.                                                                                                                                                                                                              |
| Delve  | If there's a dungeon on the square, we roll a d20 + combat_skill modifier against the dungeon's difficulty and see if the Faction is able to raise their technology_max                                                                                           |

Tick Behavior
Automatic per shift:
- Roll on encounter table
- Perform an Action
Per Day: 
- resources = resources - (population modifier)
Per Week:
- 1d20 + population_trend.

| 1     | Two deaths |
| ----- | ---------- |
| 2-3   | one death  |
| 18-19 | one birth  |
| 20    | two births |


Faction Behavior
- If the current hex's resources is higher than the Factions resource_generation, they will Supply
- If the current hex's resources are lower than the Faction's resource_generation, they will Travel, preferring low terrain_difficulty and high resources, unless another Faction is in range
- If another Faction is within their scouting range, resolve whether to move toward or away depending on agreeableness X combat_skill. Factions within scouting range are presumed able to determine population, combat_skill, and agreeableness
- If resources are in excess of population, and technology_max - technology > 10, they will Craft
- If the above is untrue, they will Train
- If the Faction has a GM-set destination, they will path toward it
- If we have enough resources to survive the next round, we will Delve. the decision is a d12 - theology modifier, and we only delve on an 10 higher. 
#### Hex

| Attribute            | Description                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| terrain_difficulty   | 1, 2, or 3 points to enter                                                                                                      |
| resources            | how many resources are available here                                                                                           |
| resource_generation  | how well the hex regenerates resources, as a modifier.                                                                          |
| points_of_interest   | joined array of what cool stuff is here                                                                                         |
| weather              | changes daily through type                                                                                                      |
| terrain_type         | controls terrain_difficulty and resource_generation. E.g. a mountain has high terrain_difficulty and low resource_generation    |
| encounter_likelihood | modifier to likelihood of random encounter. Different random encounter tables for factions and PCs. Can be positive or negative |
| player_explored      | whether the area is greyed out                                                                                                  |
| player_visible       | whether it's within scouting range (e.g. can we see what's on it)                                                               |
#### Faction Encounters
We roll a d20 + encounter likelihood

| Roll | Event                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------- |
| 1    | Roll on the Disease table                                                                                 |
| 2-5  | Progressive levels of monster difficulty, 2 being the lowest                                              |
| 6-17 | nothing happens                                                                                           |
| 18   | beneficial trading encounter, swap 5 of resources or technology (whichever is higher) for 10 of the other |
| 19   | found wanderers, add 1d6 population                                                                       |
| 20+  | Roll d20, add that many resources                                                                         |

#### Diseases
All durations are 2d6 days

| Disease     | Effect                                                       | Roll  |
| ----------- | ------------------------------------------------------------ | ----- |
| Madness     | subtract combat_skill from population                        | 1     |
| Black Death | immediately lose 1d12 population, set population_trend to -5 | 2     |
| The Runs    | combat_skill - 1d12                                          | 3-5   |
| Ravenous    | resource usage *= 1.5                                        | 6-10  |
| Bad Food    | speed / 2, scouting / 2                                      | 11-15 |
| Restless    | Comfort / 2, Scouting * 1.5                                  | 16-20 |
#### Tick
Each tick needs a history so the app can be rolled back to a prior state. Each tick should be a snapshot of the instance's attributes at that time, with a tick number (all objects should be on the same tick sequence number). 
There is a Hex Tick, a Faction Tick, and a Party Tick. Faction and Party ticks will include the action that was taken with any dice roll number.

#### Character
Characters only tick if is_wanderer is true.

| Attribute           | Description                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| is_player           | usually not                                                                                                                               |
| faction             | FK                                                                                                                                        |
| combat_skill        | used to determine random encounters                                                                                                       |
| is_hungry           | determined if faction's famine_streak < 0                                                                                                 |
| name                | can be set randomly if player is auto-generated                                                                                           |
| age                 | can be set randomly if player is auto-generated                                                                                           |
| is_leader           | are they the leader of the faction                                                                                                        |
| notes               | GM-editable                                                                                                                               |
| drive               | GM-editable                                                                                                                               |
| is_wanderer         | do they move on their own                                                                                                                 |
| scouting            | only relevant for players, if scouting > 0 they are a scout for the player faction, and add map awareness. Scouts are wanderers, and tick |
| is_dead             | have they done died                                                                                                                       |
| destination         | only if is_wanderer, this is GM-set                                                                                                       |
| rations             | number of rations they have, decrease by one per day.                                                                                     |
| famine_streak       | if rations == 0, increment. Reset when rations increase. If famine_streak == 5, they die                                                  |
| resource_generation | looting ability. this will be 1-3                                                                                                         |
| ration_limit        | carrying capacity                                                                                                                         |
| Items               | GM-editable                                                                                                                               |
| Knowledge           | what do they know, Foreign Key                                                                                                            |
##### Character tick behavior (only happens if is_wanderer)
- If destination, travel
- if ration_limit / rations < 2, supply
- if encountering a faction with high agreeableness and can_merge (never if scout), merge (gain a new faction, that faction's population increments)
#### Knowledge
- title
- description
- do players know
#### Items
- title
- description
### Points of Interest

| Item         | Type                                                                                    |
| ------------ | --------------------------------------------------------------------------------------- |
| Dungeon      | explorable, has items and knowledge as well as difficulty                               |
| Village      | established on high-resource-generation tiles, can trade, belongs to a faction          |
| Ruin         | has Knowledge, items (sometimes), and difficulty (usually 0)                            |
| Stash        | Somebody left stuff here! Items, maybe knowledge                                        |
| Monster Base | If this is here, there's a highly likelihood of random encounter with that monster type |
|              |                                                                                         |
|              |                                                                                         |

#### Dungeon

| Attr                   | Desc                                                 |     |
| ---------------------- | ---------------------------------------------------- | --- |
| Title                  | GM-editable                                          |     |
| Description            | GM-editable                                          |     |
| Notes                  | GM-editable                                          |     |
| Items                  | FK                                                   |     |
| Knowledge              | FK                                                   |     |
| Difficulty             | described below                                      |     |
| technology_max_modifer | is added to a faction's technology_max if they delve |     |
If a faction choose to delve, they roll d20 + combat_skill against the difficulty


#### Party
The party is its own thing. It selects its own tiles to move to, which Ticks the world. 

| Attribute           | Description                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Characters          | players and their pickups                                                                    |
| Name                | The party gets a name!                                                                       |
| Faction             | usually empty unless they join a faction. If they do, that faction.is_player_faction == true |
| speed               | how far they can move                                                                        |
| max_speed           | how far they can move per day                                                                |
| resource_generation | how much they can loot                                                                       |
|                     |                                                                                              |
|                     |                                                                                              |
All these are manually set

Party Actions
All party actions are done with dice rolls by the party to prevent this from turning into a video game. The purpose of the party model is to track their position and actions in the world. The frontend modal for their actions

| Action  | Description                                                                     |
| ------- | ------------------------------------------------------------------------------- |
| Move    | They pay the cost to move into a new hex                                        |
| Explore | They explore a POI                                                              |
| Supply  | Cairn 2e                                                                        |
| Search  | Reveals all non-hidden POIs, but a success on a roll will reveal one hidden POI |
|         |                                                                                 |
|         |                                                                                 |


## Frontend

This will be a react + typescript frontend. I am aware that's overkill, but I use it for work so wanna get familiar.

| Pages         | Description                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map Selection | Pick a map, load into the GM Page                                                                                                                                                                                                                                                                                                                                     |
| GM Page       | displays the full map with all factions loaded as icons. Selecting a hex should display an informative modal about what's on the hex, it's terrain difficulty, etc. Has controls to tick a shift or a day, as well as reverse tick. Modals will pop up with GM information after ticks if something interesting happened, or if the players select a dungeon, etc<br> |
| Player Page   | The GM Page, but fog of war. The party's speed is displayed, and they can move to a new hex, which ticks a shift.                                                                                                                                                                                                                                                     |
| Create map    | We load a map, the grid is overlaid. I can adjust the size of the grid to match the map. When I hit Save, the correct number of hexes are created in the backend. I want to be able to edit the map and add poi from the frontend.                                                                                                                                    |
