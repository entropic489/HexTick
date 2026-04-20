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

##### Faction Actions

Factions work in shifts just like PCs, but don't need to rest. They can take three of these actions a day.

| Action | Description                                                                                                                                                                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supply | replenish resources from resources on the hex. They can get up to their resource_generation. subtract the resource_generation mod value (rounded to nearest multiple of ten) from the hex.                                                                        |
| Travel | Move up to half their speed                                                                                                                                                                                                                                       |
| Trade  | Trade with another group. Can trade resources for technology.                                                                                                                                                                                                     |
| Merge  | Join another faction. If a battle occurs that leaves population low, or two factions with sufficiently high agreeableness interact, this is a potential but rare outcome                                                                                          |
| Battle | Join in battle with another faction. Both make a d20 roll, add their combat_skill. Whoever wins subtracts their combat_skill from the other's population, and the winner loses half the loser's combat_skill. They can take resources equal to their combat_skill |
| Train  | roll d6, add it to their combat_skill. Occurs if resource trend is good and tech level is within 10 of their max                                                                                                                                                  |
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
