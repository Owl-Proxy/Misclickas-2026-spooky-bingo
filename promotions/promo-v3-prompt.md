# Boss placement revision (v3)

## Final duplicate removal

Built-in edit of the restoration result; removes the old bottom-center Rex that the restoration pass brought back.

```text
Use case: precise-object-edit.
Make ONE tiny localized removal in this finished poster. Remove ONLY the plain gray hunched creature at the BOTTOM CENTER, centered at x=41%, y=76%, directly LEFT of the orange-pink Leviathan's face, directly RIGHT of the upright red-and-cream maggot, and directly BELOW the green Kalphite Queen. This gray creature is an unwanted duplicate Dagannoth Rex. Replace ONLY its occupied shape with low gray mist, black volcanic ground and subtle embers matching the immediate bottom foreground.
The gray Rex at the LOWER LEFT at x=15%, y=65%, immediately above the purple-mouth Mimic treasure chest, MUST STAY unchanged. That lower-left Rex is the correct one. Keep Prime and Supreme next to him unchanged.
Do not remove or change ANYTHING else. In particular preserve the green Kalphite Queen directly ABOVE the removed duplicate, red Corrupted Hunllef above her, all creatures everywhere else, the orange-backlit cobwebbed stone arch above Muspah on the right, the left-facing arrangement with Yama and Sire looking inward, empty castle above Cerberus, all text, teams, title, footer, pumpkins, lighting and composition. No new creatures, no new text. Only erase the bottom-center gray duplicate and fill its silhouette with ground/mist; change no other pixels if possible.
```

## Restoration and background detail pass

Built-in edit. Restores two unintended removals from the first pass and adds the user's requested detail above Muspah.

```text
Use case: precise-object-edit / compositing.
Image 1 is the EDIT TARGET, latest poster. Image 2 is the PREVIOUS poster, use ONLY to restore the two accidentally removed creatures. Image 3 is Kalphite Queen exact appearance. Image 4 is Corrupted Hunllef exact appearance.
Keep everything in image 1 unchanged except these THREE specific local insertions:
A. Restore CORRUPTED HUNLLEF to exactly its original place from image 2: x=36%, y=57%, beneath the green Bryophyta, left of Duke Sucellus, behind Kalphite Queen. The angular bright crimson crystal quadruped with crystal antlers, from image 4. Match its size and position in image 2.
B. Restore KALPHITE QUEEN to exactly her original place from image 2: x=36%, y=66%, immediately right of the three Dagannoth Kings, above the maggot and left of the gold-armored humanoid. Green armored insect queen with angular plated carapace and multiple legs, from image 3. Match her size and position in image 2. These two bosses were accidentally removed; they must return, without covering or changing the existing Dagannoth Kings.
C. Fill the small dark gap directly ABOVE the dark blue Phantom Muspah on the RIGHT, centered at x=85%, y=56%, below the green Zulrah head and left of the purple vampyre. Add a clearly visible ruined Gothic STONE ARCH with pale cobwebs across its upper corner and restrained warm orange backlighting through the arch. Frame the gap without covering Zulrah, Muspah, nearby creatures or any text. It is background scenery, no creature, no face, no loot.

Keep the THREE Dagannoth Kings grouped at lower left exactly as in image 1, including plain gray Rex immediately above the Mimic. Preserve Yama and Abyssal Sire as in image 1 on the left facing inward; preserve empty castle scenery directly above Cerberus. Do NOT bring back the duplicate demon above Cerberus or any extra Dagannoths from image 2. Image 2 is reference ONLY for Kalphite Queen and Corrupted Hunllef restoration.
Preserve every other existing boss, typography, color, atmosphere, date, title, teams, logos, pumpkins and frame of image 1. No new text, no drops, no loot, no tile requirements. Same finished high detail angular OSRS Halloween poster style.
```

## Initial placement pass

Mode: built-in image generator, edit. Target: `misclickas-spooky-bingo-promo-v2.png`. Supporting references: Dagannoth Rex, Yama, and Abyssal Sire from the [source list](promo-v2-sources.json).

```text
Use case: precise-object-edit / compositing.
Edit image 1, the finished Misclickas Halloween poster, with ONLY the localized changes below. Image 2 is the exact Dagannoth Rex appearance reference; image 3 is Yama; image 4 is Abyssal Sire. Preserve poster size, composition, angular OSRS style, Halloween atmosphere, all text and all other bosses.

1. Correct the Dagannoth Kings group at lower left, just above/behind the purple-mouth treasure chest (Mimic). There are two repeated gray creatures with red fins, at about (x=8%, y=60%) and (x=16%, y=65%). Keep the upper/back red-finned one as Prime. Replace the LOWER/FRONT duplicate at (16%,65%) with DAGANNOTH REX from image 2: plain gray-brown, broad smooth rounded wedge head without fins or horns, hunched biped, large clawed hands and thick tail. Keep the green Supreme at (25%,60%) unchanged. Move the existing plain gray Rex at (41%,76%) into this replacement location, leaving his old bottom-center spot as atmospheric fog and dark ground. There must be precisely THREE Dagannoth Kings in the whole poster: one red-finned Prime, one green-finned Supreme, one plain gray Rex together at lower left. Do not make another Rex or extra dog-like creatures.

2. Remove the small orange-red winged demon at (41%,29%) DIRECTLY ABOVE the red three-headed Cerberus and just left of the yellow Moon figure. Remove this small demon entirely; fill that small space naturally with the existing dark ruined castle and haze. Do not replace it with any creature. Preserve Cerberus itself at (49%,37%) unchanged.

3. Repose the ONE remaining YAMA on the LEFT, at about (21%,48%), behind the bald pale giant Obor and above the green-hatted Crazy Archaeologist. Use image 3 to preserve his red face, pale curling horns, black-and-red wings, dark body and double-ended axe. Keep him within this left-side space but rotate his head and torso to a three-quarter view facing RIGHT toward the middle of the poster and slightly toward the viewer. His face should be visible and look inward. Exactly ONE Yama in the image.

4. Repose ABYSSAL SIRE on the far LEFT at about (11%,40%), above Obor and below the gray winged gargoyles. Match image 4: red-and-black bulky segmented body, yellow-green open maw, two long slender striped antennae. Turn the head/maw and torso RIGHT toward the center and slightly toward the viewer, remaining in the same left-side space. Do not add wings or horns to Sire; keep its antennae recognizable. Exactly one Sire.

Preserve all other existing creatures, pumpkins, ruins, cobwebs, lighting, colors, title, date, team crests, team names and footer exactly. No additional bosses, no generated filler creatures. No drop names, loot icons, board or completion requirements. Text remains exactly MISCLICKAS / SPOOKY BINGO / OCTOBER 2026 / TEAM VAMPIRE VS TEAM WEREWOLF / OLD SCHOOL RUNESCAPE CLAN EVENT.
```
