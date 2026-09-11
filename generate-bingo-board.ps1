param(
  [string]$InputPath = 'october-bingo-ideas.json',
  [string]$OutputPath = 'october-osrs-bingo.svg',
  [int]$Columns = 6,
  [int]$Rows = 9
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Escape-Xml([string]$Value) {
  return [System.Security.SecurityElement]::Escape($Value)
}

function Get-Sprite-Url([string]$ItemName) {
  $aliases = @{
    "Inquisitor armor piece" = "Inquisitor's_hauberk"
    "Virtus robes" = "Virtus_robe_top"
    "Crystal armor seed" = "Crystal_armour_seed"
    "Book of the dead" = "Book_of_the_Dead"
    "3rd age platebody" = "3rd_Age_platebody"
    "Gold key" = "Gold_key_purple"
    "Kalphite head" = "Ensouled_kalphite_head"
    "Scythe of vitur" = "Scythe_of_Vitur"
    "Tome of experience" = "Tome_of_experience_(1).png"
    "Zamorak spear" = "Zamorakian_spear"
    "Kalphite Queen head (mounted) icon" = "Kalphite_Queen_head_(mounted)_icon"
    "Masori armour" = "Masori_armour_equipped_female.png"
  }
  if ($ItemName -match '^Any ' -or $ItemName -match 'piece$' -or $ItemName -match 'robes$' -or $ItemName -match '^Any Orb$' -or $ItemName -match 'Clue scroll') {
    return $null
  }
  $isAlias = $aliases.ContainsKey($ItemName)
  $fileName = if ($isAlias) { $aliases[$ItemName] } else { $ItemName -replace ' ', '_' }
  if (-not $isAlias -and $fileName.Contains('_')) {
    $parts = $fileName -split '_', 2
    $fileName = "$($parts[0])_$($parts[1].ToLowerInvariant())"
  }
  $suffix = if ($fileName.EndsWith('.png')) { '' } else { '_detail.png' }
  return "https://oldschool.runescape.wiki/images/$([uri]::EscapeDataString($fileName + $suffix))"
}

function Get-Tile-Theme([string]$BossName) {
  if ($BossName -match 'Barrows|Mimic|Archaeologist') { return 'crypt' }
  if ($BossName -match 'Whisperer|Nightmare') { return 'spectral' }
  if ($BossName -match 'Scurrius|Mole|Kalphite|Araxxor|Zulrah|Bryophyta') { return 'swamp' }
  if ($BossName -match 'Dagannoth|Duke|Kril') { return 'frost' }
  if ($BossName -match 'Skotizo|Abyssal|Chaos Fanatic|Cerberus') { return 'infernal' }
  if ($BossName -match 'Vardorvis|Theatre') { return 'blood' }
  if ($BossName -match 'Gauntlet|Hunllef') { return 'crystal' }
  if ($BossName -match 'Chambers') { return 'relic' }
  return 'haunted'
}

function Get-Boss-Image([string]$BossName) {
  $images = @{
    'Barrows Brothers' = 'https://oldschool.runescape.wiki/images/Ahrim_the_Blighted.png?33092'
    'The Whisperer' = 'https://oldschool.runescape.wiki/images/The_Whisperer.png?aedab'
    'Scurrius & Giant Mole' = 'https://oldschool.runescape.wiki/images/Scurrius.png?e66a5'
    'Crazy Archaeologist' = 'https://oldschool.runescape.wiki/images/Crazy_archaeologist.png'
    'Obor / Bryophyta' = 'https://oldschool.runescape.wiki/images/Obor.png?08bc8'
    'Dagannoth Kings' = 'https://oldschool.runescape.wiki/images/Fighting_Dagannoth_Kings.png?7a1a7'
    'Kalphite Queen' = 'https://oldschool.runescape.wiki/images/Kalphite_Queen.png?a4955'
    'Skotizo' = 'https://oldschool.runescape.wiki/images/Skotizo.png?dc8b8'
    'Temple Trekking Vampyres' = 'https://oldschool.runescape.wiki/images/Vyrelady.png?ce470'
    'The Mimic' = 'https://oldschool.runescape.wiki/images/The_Mimic.png?b45f4'
    'Chaos Fanatic' = 'https://oldschool.runescape.wiki/images/Chaos_Fanatic.png?8871d'
    'The Nightmare of Ashihama' = 'https://oldschool.runescape.wiki/images/The_Nightmare.png?0128a'
    'Theatre of Blood (ToB)' = 'https://oldschool.runescape.wiki/images/Verzik_Vitur.png'
    'Abyssal Sire' = 'https://oldschool.runescape.wiki/images/Abyssal_Sire_%28phase_1%29.png?0db8f'
    'Cerberus' = 'https://oldschool.runescape.wiki/images/Cerberus.png?47f4c'
    'Vardorvis' = 'https://oldschool.runescape.wiki/images/Vardorvis.png?48af8'
    'Duke Sucellus' = 'https://oldschool.runescape.wiki/images/Duke_Sucellus.png?d588a'
    'Araxxor' = 'https://oldschool.runescape.wiki/images/Araxxor.png?35d2e'
    'Corrupted Gauntlet' = 'https://oldschool.runescape.wiki/images/The_Corrupted_Gauntlet.png'
    'Corrupted Hunllef' = 'https://oldschool.runescape.wiki/images/Corrupted_Hunllef.png?0cd55'
    'Chambers of Xeric (CoX)' = 'https://oldschool.runescape.wiki/images/Great_Olm.png'
    'Zulrah' = 'https://oldschool.runescape.wiki/images/Zulrah_%28serpentine%29.png?29a54'
    'Kril Tsutsaroth' = 'https://oldschool.runescape.wiki/images/K%27ril_Tsutsaroth.png'
  }
  if ($images.ContainsKey($BossName)) { return $images[$BossName] }
  return $null
}

function Get-Activity-Image([string]$Title, [string]$Subtitle, [string]$Source) {
  $images = @{
    'The Crypt Keeper' = 'https://oldschool.runescape.wiki/images/Chest_%28Barrows%29.png'
    "Ahrim's Haunted Wand" = 'https://oldschool.runescape.wiki/images/Ahrim%27s_staff_detail.png'
    'Grave Robber' = 'https://oldschool.runescape.wiki/images/Stronghold_of_Security.png?be13e'
    'Spooky Wardrobe' = 'https://oldschool.runescape.wiki/images/Ghostly_robes_equipped_male.png?bf960'
    'The Exorcist' = 'https://oldschool.runescape.wiki/images/Phantom_Muspah_%28ranged%29.png?9cf6a'
    'Arachnophobia' = 'https://oldschool.runescape.wiki/images/Sarachnis.png?8f040'
    'Revenant Hunter' = 'https://oldschool.runescape.wiki/images/Fighting_revenant_dragon.png?380e1'
    'Bone Collector' = 'https://oldschool.runescape.wiki/images/Altar_%28chaos%29.png?58458'
    'The Grim Reaper' = 'https://oldschool.runescape.wiki/images/Dying_animation.gif?30e7c'
    'Shades of Mort''ton' = 'https://oldschool.runescape.wiki/images/Ahrim_the_Blighted.png?33092'
    'The Undertaker' = 'https://oldschool.runescape.wiki/images/Ahrim_the_Blighted.png?33092'
    'The Witching Hour' = 'https://oldschool.runescape.wiki/images/The_Nightmare.png?0128a'
    'Fists of Fury' = 'https://oldschool.runescape.wiki/images/Guthan%27s_warspear_detail.png'
    'Ghostbusters' = 'https://oldschool.runescape.wiki/images/Ghostly_robes_equipped_male.png?bf960'
    'Zombie Apocalypse' = 'https://oldschool.runescape.wiki/images/Pest_Control.png?ed7bb'
    'Spooky Scary Skeletons' = 'https://oldschool.runescape.wiki/images/Skeleton_mask_detail.png'
    'The Necromancer' = 'https://oldschool.runescape.wiki/images/Fighting_revenant_dragon.png?380e1'
    'Totem of the Deep' = 'https://oldschool.runescape.wiki/images/Catacombs_of_Kourend.png?42e4e'
    'Barrows Brothers' = 'https://oldschool.runescape.wiki/images/Ahrim_the_Blighted.png?33092'
    'Chaos Fanatic / Mummies' = 'https://oldschool.runescape.wiki/images/Chaos_Fanatic.png?8871d'
    'Catacombs of Kourend' = 'https://oldschool.runescape.wiki/images/Skotizo.png?dc8b8'
    'Kril Tsutsaroth' = 'https://oldschool.runescape.wiki/images/K%27ril_Tsutsaroth.png'
    'Theatre of Blood (ToB)' = 'https://oldschool.runescape.wiki/images/Sanguinesti_staff_detail.png'
    'The Blood Drinker' = 'https://oldschool.runescape.wiki/images/Sanguinesti_staff_detail.png'
    'Abyssal Sire' = 'https://oldschool.runescape.wiki/images/Abyssal_Sire_%28phase_1%29.png?0db8f'
    'The Nightmare of Ashihama' = 'https://oldschool.runescape.wiki/images/The_Nightmare.png?0128a'
    'Vardorvis / DT2 Bosses' = 'https://oldschool.runescape.wiki/images/Vardorvis.png?48af8'
    'The Leviathan' = 'https://oldschool.runescape.wiki/images/The_Leviathan.png?d588a'
    'Cave Horrors' = 'https://oldschool.runescape.wiki/images/Black_mask_detail.png'
    'Gargoyles' = 'https://oldschool.runescape.wiki/images/Gargoyle.png'
    'General Graardor' = 'https://oldschool.runescape.wiki/images/General_Graardor.png'
    'Grotesque Guardians' = 'https://oldschool.runescape.wiki/images/Dawn.png?8b8ea'
    'Yama' = 'https://oldschool.runescape.wiki/images/Yama.png?7653a'
    'Maggot King' = 'https://oldschool.runescape.wiki/images/Maggot_King.png?a6790'
    'Mad Angel' = 'https://oldschool.runescape.wiki/images/Mad_Angel.webp?c7990'
    'Tombs of Amascut' = 'https://oldschool.runescape.wiki/images/Tombs_of_Amascut.png?f9992'
    'Akkha' = 'https://oldschool.runescape.wiki/images/Akkha.png'
  }
  if ($images.ContainsKey($Title)) { return $images[$Title] }
  if ($images.ContainsKey($Subtitle)) { return $images[$Subtitle] }
  if ($images.ContainsKey($Source)) { return $images[$Source] }
  $bossImage = Get-Boss-Image $Source
  if ($bossImage) { return $bossImage }
  return $null
}

function Get-Activity-Theme([string]$Title, [string]$Subtitle, [string]$Source) {
  if ($Title -match 'Wardrobe|Ghostbusters|Witching|Exorcist' -or $Subtitle -match 'Ghost|Phantom|Nightmare') { return 'spectral' }
  if ($Title -match 'Arachnophobia|Zombie|Shades|Bone Collector|Witch''s Face' -or $Subtitle -match 'Sarachnis|Revenant|Cave Horrors') { return 'swamp' }
  if ($Title -match 'Necromancer|Grim Reaper|Totem|Old Ones|Abyssal' -or $Subtitle -match 'Death|Catacombs|Abyss') { return 'infernal' }
  if ($Title -match 'Crypt Keeper|Undertaker|Skeleton|Haunted Wand' -or $Subtitle -match 'Barrows') { return 'crypt' }
  if ($Title -match 'General''s War Spoils|Gargoyle|Granite|Grotesque|Pact Devil|Pharaoh' -or $Source -match 'General Graardor|Gargoyles|Grotesque Guardians|Yama|Tombs of Amascut|Akkha') { return 'relic' }
  if ($Title -match 'Corpse Eater' -or $Source -match 'Maggot King') { return 'swamp' }
  if ($Title -match 'Fallen Seraph' -or $Source -match 'Mad Angel') { return 'spectral' }
  if ($Title -match 'Blood Drinker' -or $Source -match 'Theatre of Blood') { return 'blood' }
  return 'haunted'
}

function Wrap-Text([string]$Value, [int]$MaxLength, [int]$MaxLines) {
  $words = $Value -split '\s+'
  $lines = New-Object System.Collections.Generic.List[string]
  $line = ''
  foreach ($word in $words) {
    $next = if ($line) { "$line $word" } else { $word }
    if ($next.Length -gt $MaxLength -and $line) {
      $lines.Add($line)
      $line = $word
    } else {
      $line = $next
    }
  }
  if ($line) { $lines.Add($line) }
  return ,$lines.ToArray()
}

if ($Columns -lt 1 -or $Rows -lt 1) { throw 'Columns and rows must be positive integers.' }
$event = Get-Content -Raw -Path $InputPath | ConvertFrom-Json
$tiles = New-Object System.Collections.Generic.List[object]
$tierLabels = @{
  early_to_mid_game = 'EARLY / MID GAME'
  late_to_end_game = 'LATE / END GAME'
  sub_goals_and_skilling = 'SUB-GOAL'
  dynamic_challenges = 'TEAM CHALLENGE'
}

foreach ($tier in $event.tiers.psobject.Properties) {
  foreach ($entry in $tier.Value) {
    if ($entry.psobject.Properties.Name -contains 'boss') {
      $displayTitle = if ($entry.psobject.Properties.Name -contains 'tile_name') { $entry.tile_name } else { $entry.boss }
      $sprite = if ($entry.psobject.Properties.Name -contains 'sprite_item') { Get-Sprite-Url $entry.sprite_item } else { $null }
      foreach ($drop in $entry.target_drops) {
        if (-not $sprite) { $sprite = Get-Sprite-Url $drop }
        if ($sprite) { break }
      }
      $requirements = if ($entry.psobject.Properties.Name -contains 'target_requirements') { @($entry.target_requirements) } else { @($entry.target_drops | ForEach-Object { "$($entry.target_quantity)x $_" }) }
      $requirementNote = if ($entry.psobject.Properties.Name -contains 'target_requirements') { 'Complete one requirement' } else { "$($entry.target_quantity) qualifying drop(s) required" }
      $tiles.Add([pscustomobject]@{ title = $displayTitle; subtitle = $entry.boss; note = $requirementNote; requirements = $requirements; sprite = $sprite; bossImage = Get-Boss-Image $entry.boss; theme = Get-Tile-Theme $entry.boss; category = $tierLabels[$tier.Name]; free = $false })
    } else {
      $note = if ($entry.psobject.Properties.Name -contains 'challenge') { $entry.challenge } else { $entry.rule }
      $sprite = if ($entry.psobject.Properties.Name -contains 'sprite_item') { Get-Sprite-Url $entry.sprite_item } else { $null }
      $entrySubtitle = if ($entry.psobject.Properties.Name -contains 'subtitle') { $entry.subtitle } else { '' }
      $requirements = if ($entry.psobject.Properties.Name -contains 'target_requirements') { @($entry.target_requirements) } else { @($note) }
      $displayNote = if ($entry.psobject.Properties.Name -contains 'target_requirements') { 'Complete one requirement' } else { $note }
      $tiles.Add([pscustomobject]@{ title = $entry.tile_name; subtitle = $entrySubtitle; note = $displayNote; requirements = $requirements; sprite = $sprite; bossImage = Get-Activity-Image $entry.tile_name $entrySubtitle ''; theme = Get-Activity-Theme $entry.tile_name $entrySubtitle ''; category = $tierLabels[$tier.Name]; free = $false })
    }
  }
}
foreach ($item in $event.items) {
  $displayTitle = if ($item.psobject.Properties.Name -contains 'tile_name') { $item.tile_name } else { $item.item_name }
  $spriteItem = if ($item.psobject.Properties.Name -contains 'sprite_item') { $item.sprite_item } else { $item.item_name }
  $targetItems = if ($item.psobject.Properties.Name -contains 'target_items') { $item.target_items } else { @($item.item_name) }
  $itemTheme = if ($item.source -eq 'The Leviathan') { 'leviathan' } else { Get-Activity-Theme $displayTitle '' $item.source }
  $tiles.Add([pscustomobject]@{ title = $displayTitle; subtitle = $item.source; note = $item.source; requirements = @($targetItems | ForEach-Object { "$($item.target_quantity)x $_" }); sprite = Get-Sprite-Url $spriteItem; bossImage = Get-Activity-Image $displayTitle $item.source $item.source; theme = $itemTheme; category = $event.bonus_category.ToUpperInvariant(); free = $false })
}

$capacity = $Columns * $Rows
if ($tiles.Count + 1 -gt $capacity) { throw "Board has $capacity spaces, but $($tiles.Count + 1) are required including the free space." }
$freeIndex = [Math]::Floor($capacity / 2)
$freeTile = [pscustomobject]@{ title = 'FREE SPACE'; subtitle = ''; note = 'BOO!'; requirements = @(); sprite = $null; bossImage = $null; theme = 'free'; category = 'TEAM BONUS'; free = $true }
$tiles.Insert($freeIndex, $freeTile)
while ($tiles.Count -lt $capacity) {
  $tiles.Add([pscustomobject]@{ title = 'CLAN BONUS'; subtitle = ''; note = 'Add your own tile'; requirements = @(); sprite = $null; bossImage = $null; theme = 'open'; category = 'OPEN SPACE'; free = $false })
}

$width = 1600
$margin = 75
$boardTop = 245
$boardWidth = $width - ($margin * 2)
$tileGap = 8
$tileWidth = ($boardWidth - ($tileGap * ($Columns + 1))) / $Columns
$tileHeight = 220
$boardHeight = ($tileHeight * $Rows) + ($tileGap * ($Rows + 1))
$height = $boardTop + $boardHeight + 115
$smallTile = $tileWidth -lt 190
$title = Escape-Xml $event.bingo_event
$subtitle = Escape-Xml $event.theme.ToUpperInvariant()
$tileMarkup = New-Object System.Collections.Generic.List[string]

for ($index = 0; $index -lt $tiles.Count; $index++) {
  $tile = $tiles[$index]
  $column = $index % $Columns
  $row = [Math]::Floor($index / $Columns)
  $x = $margin + $tileGap + ($column * ($tileWidth + $tileGap))
  $y = $boardTop + $tileGap + ($row * ($tileHeight + $tileGap))
  $maxTitle = if ($smallTile) { 18 } else { 23 }
  $maxNote = if ($smallTile) { 24 } else { 30 }
  $titleLines = Wrap-Text $tile.title $maxTitle 3
  $noteLines = Wrap-Text $tile.note $maxNote 6
  $fill = "url(#tile-$($tile.theme))"
  $stroke = if ($tile.free) { '#dca55a' } else { '#6e4b3c' }
  $titleSize = if ($smallTile) { 17 } else { 20 }
  $noteSize = if ($smallTile) { 12 } else { 14 }
  $categoryMarkup = ''
  $hasSprite = [bool]$tile.sprite
  $titleStart = if ($hasSprite) { $y + 70 - (($titleLines.Count - 1) * 11) } else { $y + 52 - (($titleLines.Count - 1) * 11) }
  $noteStart = if ($tile.subtitle) { $y + 135 } elseif ($hasSprite) { $y + 112 } else { $y + 103 }
  $tileRequirements = @($tile.requirements)
  $centerX = $x + $tileWidth / 2
  $titleText = ''
  for ($lineIndex = 0; $lineIndex -lt $titleLines.Count; $lineIndex++) {
    $dy = if ($lineIndex -eq 0) { 0 } else { 25 }
    $titleLine = Escape-Xml $titleLines[$lineIndex]
    $titleText += "<tspan x=`"$centerX`" dy=`"$dy`">$titleLine</tspan>"
  }
  $noteText = ''
  if ($tileRequirements.Count -gt 0) {
    $outputLine = 0
    for ($requirementIndex = 0; $requirementIndex -lt [Math]::Min($tileRequirements.Count, 4); $requirementIndex++) {
      $requirementLines = Wrap-Text "- $($tileRequirements[$requirementIndex])" $maxNote 6
      foreach ($requirementLine in $requirementLines) {
        $dy = if ($outputLine -eq 0) { 0 } else { 17 }
        $noteText += "<tspan x=`"$centerX`" dy=`"$dy`">$(Escape-Xml $requirementLine)</tspan>"
        $outputLine++
      }
    }
  } else {
    for ($lineIndex = 0; $lineIndex -lt $noteLines.Count; $lineIndex++) {
      $dy = if ($lineIndex -eq 0) { 0 } else { 17 }
      $noteLine = Escape-Xml $noteLines[$lineIndex]
      $noteText += "<tspan x=`"$centerX`" dy=`"$dy`">$noteLine</tspan>"
    }
  }
  $subtitleMarkup = if ($tile.subtitle) { "<text x=`"$centerX`" y=`"$($y + 110)`" class=`"tile-boss`">$(Escape-Xml $tile.subtitle)</text>" } else { '' }
  $tooltip = Escape-Xml "$($tile.title): $($tile.note)"
  $spriteMarkup = if ($hasSprite) { '<image x="' + ($centerX - 16) + '" y="' + ($y + 6) + '" width="32" height="32" href="' + $tile.sprite + '" preserveAspectRatio="xMidYMid meet"/>' } else { '' }
  $bossImageMarkup = if ($tile.bossImage) { '<image class="tile-backdrop" x="' + $x + '" y="' + $y + '" width="' + $tileWidth + '" height="' + $tileHeight + '" href="' + $tile.bossImage + '" preserveAspectRatio="xMidYMid slice"/>' } else { '' }
  $tileMarkup.Add(@"
    <g class="tile" tabindex="0">
      <title>$tooltip</title>
      <rect x="$x" y="$y" width="$tileWidth" height="$tileHeight" rx="4" fill="$fill" stroke="$stroke" stroke-width="$(if ($tile.free) { 3 } else { 2 })"/>
      $bossImageMarkup
      $spriteMarkup
      $categoryMarkup
      <text x="$($x + $tileWidth / 2)" y="$titleStart" class="tile-label">$titleText</text>
      $subtitleMarkup
      <text x="$($x + $tileWidth / 2)" y="$noteStart" class="tile-note">$noteText</text>
    </g>
"@)
}

$tilesXml = $tileMarkup -join ''
$inputName = (Split-Path $InputPath -Leaf).ToUpperInvariant()
$svg = @"
<svg xmlns="http://www.w3.org/2000/svg" width="$width" height="$height" viewBox="0 0 $width $height" role="img" aria-labelledby="title desc">
  <title id="title">$title</title>
  <desc id="desc">A $Columns by $Rows Old School RuneScape Halloween bingo board generated from $(Escape-Xml (Split-Path $InputPath -Leaf)).</desc>
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#152b32"/><stop offset=".28" stop-color="#1a1426"/><stop offset=".62" stop-color="#111b1a"/><stop offset="1" stop-color="#32151f"/></linearGradient>
    <linearGradient id="board" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#171626"/><stop offset=".5" stop-color="#0e1719"/><stop offset="1" stop-color="#24131d"/></linearGradient>
    <linearGradient id="tile-haunted" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#30243a"/><stop offset="1" stop-color="#17151f"/></linearGradient>
    <linearGradient id="tile-crypt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#403046"/><stop offset="1" stop-color="#17151f"/></linearGradient>
    <linearGradient id="tile-spectral" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#24404a"/><stop offset="1" stop-color="#151b2a"/></linearGradient>
    <linearGradient id="tile-swamp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#33452c"/><stop offset="1" stop-color="#151c1b"/></linearGradient>
    <linearGradient id="tile-frost" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#30445d"/><stop offset="1" stop-color="#151b2a"/></linearGradient>
    <linearGradient id="tile-infernal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#54252d"/><stop offset="1" stop-color="#21151f"/></linearGradient>
    <linearGradient id="tile-blood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#61252f"/><stop offset="1" stop-color="#25131d"/></linearGradient>
    <linearGradient id="tile-crystal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#24505a"/><stop offset="1" stop-color="#182536"/></linearGradient>
    <linearGradient id="tile-relic" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#54402b"/><stop offset="1" stop-color="#211b1c"/></linearGradient>
    <linearGradient id="tile-armory" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#51243e"/><stop offset="1" stop-color="#211525"/></linearGradient>
    <linearGradient id="tile-leviathan" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#667052"/><stop offset=".52" stop-color="#4b4530"/><stop offset="1" stop-color="#211f1a"/></linearGradient>
    <linearGradient id="tile-free" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b3435"/><stop offset="1" stop-color="#421b28"/></linearGradient>
    <linearGradient id="tile-open" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#252531"/><stop offset="1" stop-color="#161720"/></linearGradient>
    <pattern id="grain" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="5" cy="8" r="1" fill="#f3c978" opacity=".08"/><circle cx="22" cy="26" r="1" fill="#f3c978" opacity=".06"/></pattern>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity=".6"/></filter>
    <filter id="spriteGlow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#e27b38" flood-opacity=".6"/></filter>
    <style>
      .display { font-family: Georgia, 'Times New Roman', serif; letter-spacing: 2px; }
      .body { font-family: 'Trebuchet MS', Arial, sans-serif; letter-spacing: 1px; }
      .tile { cursor: help; }
      .tile-backdrop { opacity: .18; pointer-events: none; }
      .category { font-family: 'Trebuchet MS', Arial, sans-serif; font-size: 11px; letter-spacing: 1px; fill: #e27b38; text-anchor: middle; }
      .tile-label { font-family: 'Trebuchet MS', Arial, sans-serif; font-size: $($(if ($smallTile) { 17 } else { 20 }))px; font-weight: 700; fill: #f7e9c6; text-anchor: middle; }
      .tile-boss { font-family: 'Trebuchet MS', Arial, sans-serif; font-size: 12px; font-style: italic; fill: #e27b38; text-anchor: middle; }
      .tile-note { font-family: 'Trebuchet MS', Arial, sans-serif; font-size: $($(if ($smallTile) { 11 } else { 13 }))px; fill: #d3b991; text-anchor: middle; }
    </style>
  </defs>
  <rect width="$width" height="$height" fill="url(#paper)"/><rect width="$width" height="$height" fill="url(#grain)"/>
  <circle cx="1390" cy="92" r="34" fill="#9e3437" opacity=".8"/><circle cx="1390" cy="92" r="50" fill="none" stroke="#d15a43" stroke-width="2" opacity=".25"/>
  <path d="M75 115 C300 45 460 90 620 55 S990 85 1160 50 S1400 70 1525 115" fill="none" stroke="#b13b35" stroke-width="5" opacity=".85"/>
  <text x="800" y="92" class="body" font-size="17" fill="#e27b38" text-anchor="middle">A CLAN EVENT FOR THE SPOOKIEST SEASON</text>
  <text x="800" y="154" class="display" font-size="54" font-weight="700" fill="#f7e9c6" text-anchor="middle">$title</text>
  <text x="800" y="193" class="body" font-size="17" fill="#d3b991" text-anchor="middle">$subtitle</text>
  <g filter="url(#shadow)"><rect x="$margin" y="$boardTop" width="$boardWidth" height="$boardHeight" rx="8" fill="url(#board)" stroke="#c89449" stroke-width="3"/>$tilesXml</g>
  <text x="800" y="$($height - 38)" class="body" font-size="15" fill="#d3b991" text-anchor="middle">GENERATED FROM $inputName  -  CHECK PROOF WITH YOUR CLAN LEAD</text>
</svg>
"@

Set-Content -Path $OutputPath -Value $svg -Encoding utf8
Write-Output "Generated $OutputPath from $InputPath`: $($tiles.Count) tiles on a ${Columns}x${Rows} board."
