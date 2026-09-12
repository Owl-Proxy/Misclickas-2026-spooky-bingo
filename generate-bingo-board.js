const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'october-bingo-ideas.json';
const outputPath = process.argv[3] || 'october-osrs-bingo.svg';
const columns = Number(process.argv[4] || 6);
const rows = Number(process.argv[5] || 9);

if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
  throw new Error('Columns and rows must be positive integers.');
}

const event = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
const tiles = [];

const getTileTheme = (bossName) => {
  if (/Barrows|Mimic|Archaeologist/.test(bossName)) return 'crypt';
  if (/Whisperer|Nightmare/.test(bossName)) return 'spectral';
  if (/Scurrius|Mole|Kalphite|Araxxor|Zulrah|Bryophyta/.test(bossName)) return 'swamp';
  if (/Dagannoth|Duke|Kril/.test(bossName)) return 'frost';
  if (/Skotizo|Abyssal|Chaos Fanatic|Cerberus/.test(bossName)) return 'infernal';
  if (/Vardorvis|Theatre/.test(bossName)) return 'blood';
  if (/Gauntlet|Hunllef/.test(bossName)) return 'crystal';
  if (/Chambers/.test(bossName)) return 'relic';
  return 'haunted';
};

const bossImages = {
  'Barrows Brothers': 'https://oldschool.runescape.wiki/images/Ahrim_the_Blighted.png?33092',
  'The Whisperer': 'https://oldschool.runescape.wiki/images/The_Whisperer.png?aedab',
  'Scurrius': 'https://oldschool.runescape.wiki/images/Scurrius.png?e66a5',
  'Crazy Archaeologist': 'https://oldschool.runescape.wiki/images/Crazy_archaeologist.png',
  'Obor / Bryophyta': 'https://oldschool.runescape.wiki/images/Obor.png?08bc8',
  'Dagannoth Kings': 'https://oldschool.runescape.wiki/images/Fighting_Dagannoth_Kings.png?7a1a7',
  'Kalphite Queen': 'https://oldschool.runescape.wiki/images/Kalphite_Queen.png?a4955',
  Skotizo: 'https://oldschool.runescape.wiki/images/Skotizo.png?dc8b8',
  'Temple Trekking Vampyres': 'https://oldschool.runescape.wiki/images/Vyrelady.png?ce470',
  'The Mimic': 'https://oldschool.runescape.wiki/images/The_Mimic.png?b45f4',
  'Chaos Fanatic': 'https://oldschool.runescape.wiki/images/Chaos_Fanatic.png?8871d',
  'The Nightmare of Ashihama': 'https://oldschool.runescape.wiki/images/The_Nightmare.png?0128a',
  'Theatre of Blood (ToB)': 'https://oldschool.runescape.wiki/images/Verzik_Vitur.png',
  'Abyssal Sire': 'https://oldschool.runescape.wiki/images/Abyssal_Sire_%28phase_1%29.png?0db8f',
  Cerberus: 'https://oldschool.runescape.wiki/images/Cerberus.png?47f4c',
  Vardorvis: 'https://oldschool.runescape.wiki/images/Vardorvis.png?48af8',
  'Duke Sucellus': 'https://oldschool.runescape.wiki/images/Duke_Sucellus.png?d588a',
  Araxxor: 'https://oldschool.runescape.wiki/images/Araxxor.png?35d2e',
  'Corrupted Gauntlet': 'https://oldschool.runescape.wiki/images/The_Corrupted_Gauntlet.png',
  'Corrupted Hunllef': 'https://oldschool.runescape.wiki/images/Corrupted_Hunllef.png?0cd55',
  'Chambers of Xeric (CoX)': 'https://oldschool.runescape.wiki/images/Great_Olm.png',
  Zulrah: 'https://oldschool.runescape.wiki/images/Zulrah_%28serpentine%29.png?29a54',
  'Kril Tsutsaroth': 'https://oldschool.runescape.wiki/images/K%27ril_Tsutsaroth.png'
};

const activityImages = {
  'Perilous Moons': `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'blood-moon.png')).toString('base64')}`,
  'The Crypt Keeper': 'https://oldschool.runescape.wiki/images/Chest_%28Barrows%29.png',
  "Ahrim's Haunted Wand": 'https://oldschool.runescape.wiki/images/Ahrim%27s_staff_detail.png',
  'Grave Robber': 'https://oldschool.runescape.wiki/images/Stronghold_of_Security.png?be13e',
  'Spooky Wardrobe': 'https://oldschool.runescape.wiki/images/Ghostly_robes_equipped_male.png?bf960',
  'The Exorcist': 'https://oldschool.runescape.wiki/images/Phantom_Muspah_%28ranged%29.png?9cf6a',
  Arachnophobia: 'https://oldschool.runescape.wiki/images/Sarachnis.png?8f040',
  'Revenant Hunter': 'https://oldschool.runescape.wiki/images/Fighting_revenant_dragon.png?380e1',
  'Bone Collector': 'https://oldschool.runescape.wiki/images/Altar_%28chaos%29.png?58458',
  'The Grim Reaper': 'https://oldschool.runescape.wiki/images/Dying_animation.gif?30e7c',
  "Shades of Mort'ton": 'https://oldschool.runescape.wiki/images/Ahrim_the_Blighted.png?33092',
  'The Undertaker': 'https://oldschool.runescape.wiki/images/Ahrim_the_Blighted.png?33092',
  'The Witching Hour': 'https://oldschool.runescape.wiki/images/The_Nightmare.png?0128a',
  'Fists of Fury': 'https://oldschool.runescape.wiki/images/Guthan%27s_warspear_detail.png',
  Ghostbusters: 'https://oldschool.runescape.wiki/images/Ghostly_robes_equipped_male.png?bf960',
  'Zombie Apocalypse': 'https://oldschool.runescape.wiki/images/Pest_Control.png?ed7bb',
  'Spooky Scary Skeletons': 'https://oldschool.runescape.wiki/images/Skeleton_mask_detail.png',
  'The Necromancer': 'https://oldschool.runescape.wiki/images/Fighting_revenant_dragon.png?380e1',
  'Doom of Mokhaiotl': 'https://oldschool.runescape.wiki/images/Doom_of_Mokhaiotl.png',
  'Royal Titans': `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'royal-titans.png')).toString('base64')}`,
  'Barrows Brothers': 'https://oldschool.runescape.wiki/images/Ahrim_the_Blighted.png?33092',
  'Chaos Fanatic / Mummies': 'https://oldschool.runescape.wiki/images/Chaos_Fanatic.png?8871d',
  'Catacombs of Kourend': 'https://oldschool.runescape.wiki/images/Skotizo.png?dc8b8',
  'Kril Tsutsaroth': 'https://oldschool.runescape.wiki/images/K%27ril_Tsutsaroth.png',
  'Theatre of Blood (ToB)': 'https://oldschool.runescape.wiki/images/Sanguinesti_staff_detail.png',
  Vorkath: `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'vorkath.png')).toString('base64')}`,
  'Abyssal Sire': 'https://oldschool.runescape.wiki/images/Abyssal_Sire_%28phase_1%29.png?0db8f',
  'The Nightmare of Ashihama': 'https://oldschool.runescape.wiki/images/The_Nightmare.png?0128a',
  'Vardorvis / DT2 Bosses': 'https://oldschool.runescape.wiki/images/Vardorvis.png?48af8',
  'The Leviathan': 'https://oldschool.runescape.wiki/images/The_Leviathan.png?d588a',
  'Cave Horrors': 'https://oldschool.runescape.wiki/images/Black_mask_detail.png',
  Gargoyles: 'https://oldschool.runescape.wiki/images/Gargoyle.png',
  'General Graardor': 'https://oldschool.runescape.wiki/images/General_Graardor.png',
  'Barrows Brothers': 'https://oldschool.runescape.wiki/images/Barrows_Brothers_icon.png',
  'Grotesque Guardians': 'https://oldschool.runescape.wiki/images/Dawn.png?8b8ea',
  Yama: 'https://oldschool.runescape.wiki/images/Yama.png?7653a',
  'Maggot King': 'https://oldschool.runescape.wiki/images/Maggot_King.png?a6790',
  'Mad Angel': 'https://oldschool.runescape.wiki/images/Mad_Angel.webp?c7990',
  'Tombs of Amascut': 'https://oldschool.runescape.wiki/images/Tombs_of_Amascut.png?f9992',
  Akkha: 'https://oldschool.runescape.wiki/images/Akkha.png'
};

const getActivityTheme = (title, subtitle, source) => {
  if (source === 'Vorkath') return 'frost';
  if (source === 'Perilous Moons') return 'blood';
  if (source === 'Doom of Mokhaiotl') return 'infernal';
  if (source === 'Royal Titans') return 'frost';
  if (/Wardrobe|Ghostbusters|Witching|Exorcist/.test(title) || /Ghost|Phantom|Nightmare/.test(subtitle)) return 'spectral';
  if (/Arachnophobia|Zombie|Shades|Bone Collector|Witch's Face/.test(title) || /Sarachnis|Revenant|Cave Horrors/.test(subtitle)) return 'swamp';
  if (/Necromancer|Grim Reaper|Totem|Old Ones|Abyssal/.test(title) || /Death|Catacombs|Abyss/.test(subtitle)) return 'infernal';
  if (/Crypt Keeper|Undertaker|Skeleton|Haunted Wand/.test(title) || /Barrows/.test(subtitle)) return 'crypt';
  if (/General's War Spoils|Gargoyle|Granite|Grotesque|Pact Devil|Pharaoh/.test(title) || /General Graardor|Gargoyles|Grotesque Guardians|Yama|Tombs of Amascut|Akkha/.test(source)) return 'relic';
  if (/Corpse Eater/.test(title) || /Maggot King/.test(source)) return 'swamp';
  if (/Fallen Seraph/.test(title) || /Mad Angel/.test(source)) return 'spectral';
  if (/Theatre of Blood/.test(source)) return 'blood';
  return 'haunted';
};

const spriteAliases = {
  'Inquisitor armor piece': "Inquisitor's_hauberk",
  'Virtus robes': 'Virtus_robe_top',
  'Crystal armor seed': 'Crystal_armour_seed',
  'Book of the dead': 'Book_of_the_Dead',
  '3rd age platebody': '3rd_Age_platebody',
  'Gold key': 'Gold_key_purple',
  'Kalphite head': 'Ensouled_kalphite_head',
  'Scythe of vitur': 'Scythe_of_Vitur',
  'Tome of experience': 'Tome_of_experience_(1).png',
  'Zamorak spear': 'Zamorakian_spear',
  'Kalphite Queen head (mounted) icon': 'Kalphite_Queen_head_(mounted)_icon',
  'Masori armour': 'Masori_armour_equipped_female.png'
};

const getSpriteUrl = (itemName) => {
  if (itemName === 'Crystal armour seed') return `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'crystal-armour-seed.png')).toString('base64')}`;
  if (itemName === "Vorkath's head") return `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'vorkaths-head.png')).toString('base64')}`;
  if (itemName === 'Dual macuahuitl') return `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'dual-macuahuitl.png')).toString('base64')}`;
  if (/^Any |piece$|robes$|^Any Orb$|Clue scroll/.test(itemName)) return null;
  const isAlias = Object.prototype.hasOwnProperty.call(spriteAliases, itemName);
  const fileName = isAlias ? spriteAliases[itemName] : itemName.replace(/ /g, '_');
  const separator = fileName.indexOf('_');
  const normalizedFileName = isAlias ? fileName : separator === -1
    ? fileName
    : `${fileName.slice(0, separator)}_${fileName.slice(separator + 1).toLowerCase()}`;
  const suffix = normalizedFileName.endsWith('.png') ? '' : '_detail.png';
  return `https://oldschool.runescape.wiki/images/${encodeURIComponent(`${normalizedFileName}${suffix}`)}`;
};

const tierLabels = {
  early_to_mid_game: 'EARLY / MID GAME',
  late_to_end_game: 'LATE / END GAME',
  sub_goals_and_skilling: 'SUB-GOAL',
  dynamic_challenges: 'TEAM CHALLENGE'
};

const completionPathsFor = (entry, detailed = false) => entry.completion_paths?.map((completionPath) => completionPath.all_of.map((drop) => {
  const name = typeof drop === 'string' ? drop : detailed && drop.any_of ? `any of (${drop.any_of.join(' OR ')})` : `${drop.label}${!detailed && drop.display_options ? ` (${drop.display_options})` : ''}`;
  const quantity = typeof drop === 'string' ? entry.target_quantity : drop.quantity ?? entry.target_quantity;
  return `${quantity}x ${name}`;
}));

for (const [tier, entries] of Object.entries(event.tiers)) {
  for (const entry of entries) {
    if (entry.boss) {
      tiles.push({
        title: entry.tile_name || entry.boss,
        subtitle: entry.boss,
        note: entry.completion_mode === 'any' ? `Obtain any one listed drop from this boss.${entry.target_drops.includes('Any Virtus armour piece') ? ' Virtus: mask, robe top, or robe bottom.' : ''}` : entry.target_requirements ? 'Complete one requirement' : `${entry.target_quantity} qualifying drop(s) required`,
        requirementsHeading: entry.completion_mode === 'any' ? 'Any one of the following:' : '',
        requirements: entry.target_requirements || entry.target_drops.map((drop) => `${entry.target_quantity}x ${drop}`),
        completionPaths: completionPathsFor(entry),
        completionDetails: completionPathsFor(entry, true),
        sprite: (entry.sprite_item ? getSpriteUrl(entry.sprite_item) : null) || entry.target_drops.map(getSpriteUrl).find(Boolean) || null,
        bossImage: entry.background_asset ? `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'assets', entry.background_asset)).toString('base64')}` : bossImages[entry.boss] || null,
        theme: entry.tile_theme || getTileTheme(entry.boss),
        category: tierLabels[tier]
      });
    } else {
      tiles.push({
        title: entry.tile_name,
        subtitle: entry.subtitle || '',
        note: entry.target_requirements ? 'Complete one requirement' : entry.challenge || entry.rule,
        requirements: entry.target_requirements || [entry.challenge || entry.rule],
        sprite: entry.sprite_item ? getSpriteUrl(entry.sprite_item) : null,
        bossImage: activityImages[entry.tile_name] || activityImages[entry.subtitle] || null,
        theme: getActivityTheme(entry.tile_name, entry.subtitle || '', ''),
        category: tierLabels[tier]
      });
    }
  }
}

for (const item of event.items) {
  tiles.push({
    title: item.tile_name || item.item_name,
    subtitle: item.source,
    note: item.completion_mode === 'any' ? `${item.source}: Obtain any one listed drop from this boss.${(item.target_items || []).includes('Any Virtus armour piece') ? ' Virtus: mask, robe top, or robe bottom.' : ''}` : item.source,
    requirementsHeading: item.completion_mode === 'any' ? 'Any one of the following:' : '',
    requirements: (item.target_items || [item.item_name]).map((targetItem) => `${item.target_quantity}x ${targetItem}`),
    completionPaths: completionPathsFor(item),
    completionDetails: completionPathsFor(item, true),
    sprite: getSpriteUrl(item.sprite_item || item.item_name),
    theme: item.source === 'The Leviathan' ? 'leviathan' : getActivityTheme(item.tile_name || item.item_name, '', item.source),
    bossImage: activityImages[item.tile_name] || activityImages[item.source] || bossImages[item.source] || null,
    category: event.bonus_category.toUpperCase()
  });
}

const capacity = columns * rows;
if (tiles.length + 1 > capacity) {
  throw new Error(`Board has ${capacity} spaces, but ${tiles.length + 1} are required including the free space.`);
}

const freeIndex = Math.floor(capacity / 2);
tiles.splice(freeIndex, 0, {
  title: 'FREE SPACE',
  subtitle: '',
  note: 'BOO!',
  requirements: [],
  sprite: null,
  category: 'TEAM BONUS',
  theme: 'free',
  free: true
});
while (tiles.length < capacity) {
  tiles.push({ title: 'CLAN BONUS', subtitle: '', note: 'Add your own tile', requirements: [], sprite: null, theme: 'open', category: 'OPEN SPACE' });
}

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const wrap = (value, maxLength, maxLines = 3) => {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const width = 1600;
const margin = 75;
const boardTop = 245;
const boardWidth = width - margin * 2;
const tileGap = 8;
const tileWidth = (boardWidth - tileGap * (columns + 1)) / columns;
const tileHeight = 220;
const boardHeight = tileHeight * rows + tileGap * (rows + 1);
const height = boardTop + boardHeight + 115;
const title = escapeXml(event.bingo_event);
const subtitle = escapeXml(event.theme.toUpperCase());

const tileMarkup = tiles.map((tile, index) => {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = margin + tileGap + column * (tileWidth + tileGap);
  const y = boardTop + tileGap + row * (tileHeight + tileGap);
  const titleLines = wrap(tile.title, tileWidth < 190 ? 18 : 23, 3);
  const noteLines = wrap(tile.note, tileWidth < 190 ? 24 : 30, 6);
  const fill = `url(#tile-${tile.theme})`;
  const stroke = tile.free ? '#dca55a' : '#6e4b3c';
  const categoryMarkup = '';
  const hasSprite = Boolean(tile.sprite);
  const titleStart = (hasSprite ? y + 70 : y + 52) - (titleLines.length - 1) * 11;
  const noteStart = tile.subtitle ? y + 135 : hasSprite ? y + 112 : y + 103;
  const titleText = titleLines.map((line, lineIndex) => `<tspan x="${x + tileWidth / 2}" dy="${lineIndex === 0 ? 0 : 25}">${escapeXml(line)}</tspan>`).join('');
  const visibleNotes = tile.requirements.length
    ? tile.requirements.slice(0, 4).flatMap((requirement) => wrap(`- ${requirement}`, tileWidth < 190 ? 24 : 30, 6))
    : noteLines;
  const headingMarkup = tile.requirementsHeading ? `<tspan x="${x + tileWidth / 2}" dy="0" font-weight="700" fill="#f7e9c6">${escapeXml(tile.requirementsHeading)}</tspan>` : '';
  let noteText = headingMarkup + visibleNotes.map((line, lineIndex) => `<tspan x="${x + tileWidth / 2}" dy="${lineIndex === 0 && !tile.requirementsHeading ? 0 : 17}">${escapeXml(line)}</tspan>`).join('');
  if (tile.completionPaths) {
    const pathLines = tile.completionPaths.flatMap((drops, pathIndex) => [
      ...(pathIndex > 0 || (tile.completionPaths.length > 1 && drops.length > 1) ? [{ text: `${pathIndex > 0 ? 'OR ' : ''}${drops.length > 1 ? (pathIndex > 0 ? 'all of the following:' : 'All of the following:') : ''}`.trim(), heading: true }] : []),
      ...drops.flatMap((drop) => wrap(`- ${drop}`, tileWidth < 190 ? 24 : 30, 6).map((text) => ({ text, heading: false })))
    ]);
    const lineStep = Math.min(17, Math.floor((y + tileHeight - 12 - noteStart) / Math.max(1, pathLines.length - 1)));
    const compactFont = lineStep < 17 ? ` font-size="${Math.min(12, lineStep - 1)}"` : '';
    noteText = pathLines.map((line, lineIndex) => `<tspan x="${x + tileWidth / 2}" dy="${lineIndex === 0 ? 0 : lineStep}"${compactFont}${line.heading ? ' font-weight="700" fill="#f7e9c6"' : ''}>${escapeXml(line.text)}</tspan>`).join('');
  }
  const subtitleMarkup = tile.subtitle ? `<text x="${x + tileWidth / 2}" y="${y + 110}" class="tile-boss">${escapeXml(tile.subtitle)}</text>` : '';
  const tooltip = escapeXml(`${tile.title}: ${tile.completionPaths ? tile.completionDetails.map((drops) => `(${drops.join(' AND ')})`).join(' OR ') : tile.note}`);
  const spriteMarkup = hasSprite ? `<image x="${x + tileWidth / 2 - 16}" y="${y + 6}" width="32" height="32" href="${tile.sprite}" preserveAspectRatio="xMidYMid meet"/>` : '';
  const bossImageAlignment = tile.subtitle === 'Vorkath' ? 'xMinYMid' : 'xMidYMid';
  const bossImageMarkup = tile.bossImage ? `<image class="tile-backdrop" x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" href="${tile.bossImage}" preserveAspectRatio="${bossImageAlignment} slice"/>` : '';
  return `
    <g class="tile" tabindex="0">
      <title>${tooltip}</title>
      <rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${tile.free ? 3 : 2}"/>
      ${bossImageMarkup}
      ${spriteMarkup}
      ${categoryMarkup}
      <text x="${x + tileWidth / 2}" y="${titleStart}" class="tile-label">${titleText}</text>
      ${subtitleMarkup}
      <text x="${x + tileWidth / 2}" y="${noteStart}" class="tile-note">${noteText}</text>
    </g>`;
}).join('');

const frameTokens = {
  LANTERN: `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'spooky-pumpkin-lantern.png')).toString('base64')}`,
  PUMPKIN: `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'pumpkin.png')).toString('base64')}`,
  WEB: `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'cobweb.png')).toString('base64')}`,
  MID_Y: height / 2, LOW_WEB_Y: height - 720, LOW_LANTERN_Y: height - 600, FOOTER_Y: height - 108
};
const halloweenFrame = fs.readFileSync(path.join(__dirname, 'assets', 'halloween-frame.svg'), 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => frameTokens[key]);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title>
  <desc id="desc">A ${columns} by ${rows} Old School RuneScape Halloween bingo board generated from ${escapeXml(path.basename(inputPath))}.</desc>
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#57230c"/><stop offset=".28" stop-color="#170c09"/><stop offset=".62" stop-color="#090708"/><stop offset="1" stop-color="#4b1114"/>
    </linearGradient>
    <linearGradient id="board" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b170e"/><stop offset=".5" stop-color="#100a09"/><stop offset="1" stop-color="#2c1013"/></linearGradient>
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
    <pattern id="grain" width="32" height="32" patternUnits="userSpaceOnUse">
      <circle cx="5" cy="8" r="1" fill="#f3c978" opacity=".08"/><circle cx="22" cy="26" r="1" fill="#f3c978" opacity=".06"/>
    </pattern>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity=".6"/></filter>
    <filter id="spriteGlow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#e27b38" flood-opacity=".6"/></filter>
    <style>
      .display { font-family: Georgia, 'Times New Roman', serif; letter-spacing: 2px; }
      .body { font-family: 'Trebuchet MS', Arial, sans-serif; letter-spacing: 1px; }
      .tile { cursor: help; }
      .tile-backdrop { opacity: .18; pointer-events: none; }
      .category { font-family: 'Trebuchet MS', Arial, sans-serif; font-size: 11px; letter-spacing: 1px; fill: #e27b38; text-anchor: middle; }
      .tile-label { font-family: 'Trebuchet MS', Arial, sans-serif; font-size: ${tileWidth < 190 ? 17 : 20}px; font-weight: 700; fill: #f7e9c6; text-anchor: middle; }
      .tile-boss { font-family: 'Trebuchet MS', Arial, sans-serif; font-size: 12px; font-style: italic; fill: #e27b38; text-anchor: middle; }
      .tile-note { font-family: 'Trebuchet MS', Arial, sans-serif; font-size: ${tileWidth < 190 ? 11 : 13}px; fill: #d3b991; text-anchor: middle; }
    </style>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#paper)"/><rect width="${width}" height="${height}" fill="url(#grain)"/>
  ${halloweenFrame}
  <circle cx="1390" cy="92" r="34" fill="#9e3437" opacity=".8"/><circle cx="1390" cy="92" r="50" fill="none" stroke="#d15a43" stroke-width="2" opacity=".25"/>
  <path d="M75 115 C300 45 460 90 620 55 S990 85 1160 50 S1400 70 1525 115" fill="none" stroke="#b13b35" stroke-width="5" opacity=".85"/>
  <text x="800" y="92" class="body" font-size="17" fill="#e27b38" text-anchor="middle">A CLAN EVENT FOR THE SPOOKIEST SEASON</text>
  <text x="800" y="154" class="display" font-size="54" font-weight="700" fill="#f7e9c6" text-anchor="middle">${title}</text>
  <text x="800" y="193" class="body" font-size="17" fill="#d3b991" text-anchor="middle">${subtitle}</text>
  <g filter="url(#shadow)"><rect x="${margin}" y="${boardTop}" width="${boardWidth}" height="${boardHeight}" rx="8" fill="url(#board)" stroke="#c89449" stroke-width="3"/>${tileMarkup}</g>
</svg>
`;

fs.writeFileSync(path.resolve(outputPath), svg);
console.log(`Generated ${outputPath} from ${inputPath}: ${tiles.length} tiles on a ${columns}x${rows} board.`);
