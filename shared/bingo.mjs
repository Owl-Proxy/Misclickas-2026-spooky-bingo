export const slug = value => String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const virtus = ['Virtus mask', 'Virtus robe top', 'Virtus robe bottom'];
const expand = item => item === 'Any Virtus armour piece' ? virtus : [item];

export function buildTiles(event) {
  const entries = [...Object.values(event.tiers).flat(), ...event.items];
  const tiles = entries.map(entry => {
    let paths = null;
    if (entry.completion_paths) {
      paths = entry.completion_paths.map(path => path.all_of.map(drop => ({
        label: typeof drop === 'string' ? drop : drop.label,
        quantity: typeof drop === 'string' ? entry.target_quantity : (drop.quantity ?? entry.target_quantity),
        items: typeof drop === 'string' ? expand(drop) : (drop.any_of ?? [drop.label])
      })));
    } else if (entry.completion_mode === 'any') {
      paths = (entry.target_drops ?? entry.target_items).map(drop => [{ label: drop, quantity: entry.target_quantity, items: expand(drop) }]);
    }
    const rawChoices = paths ? paths.flatMap(path => path.flatMap(group => group.items))
      : (entry.target_drops ?? entry.target_items ?? (entry.item_name ? [entry.item_name] : ['Activity progress']));
    const choices = [...new Set(rawChoices)].map(label => ({ id: slug(label), label }));
    return {
      id: entry.tile_id ?? slug(entry.tile_name), title: entry.tile_name,
      source: entry.boss ?? entry.source ?? entry.subtitle ?? '',
      description: entry.challenge ?? entry.rule ?? entry.spooky_vibe ?? entry.spooky_lore ?? '',
      quantity: entry.target_quantity, paths, choices,
      bonus: entry.scoring_mode === 'bonus', pointsPerDrop: entry.points_per_drop ?? 1,
      legacyRequirements: entry.target_requirements ?? (entry.challenge || entry.rule ? [entry.challenge ?? entry.rule]
        : (entry.target_drops ?? entry.target_items ?? [entry.item_name]).map(item => `${entry.target_quantity}× ${item}`))
    };
  });
  tiles.splice(27, 0, { id: 'free-space', title: 'FREE SPACE', free: true, choices: [], paths: null });
  return tiles;
}

export function tileProgress(tile, submissions) {
  if (tile.free) return { complete: true, approved: 0, pending: 0, counts: {}, paths: [], bonusPoints: 0 };
  const relevant = submissions.filter(s => s.tileId === tile.id);
  const accepted = relevant.filter(s => s.status === 'approved');
  const counts = {};
  for (const submission of accepted) counts[submission.choiceId] = (counts[submission.choiceId] ?? 0) + submission.quantity;
  const paths = (tile.paths ?? []).map(path => path.map(group => ({ ...group,
    current: group.items.reduce((total, item) => total + (counts[slug(item)] ?? 0), 0)
  })));
  const complete = !tile.bonus && (tile.paths ? paths.some(path => path.every(group => group.current >= group.quantity))
    : accepted.some(s => s.completesTile === true));
  const bonusPoints = tile.bonus ? accepted.reduce((total, s) => total + s.quantity * tile.pointsPerDrop, 0) : 0;
  return { complete, counts, paths, bonusPoints, approved: accepted.length, pending: relevant.filter(s => s.status === 'pending').length };
}

export function summary(tiles, submissions) {
  const actual = tiles.filter(tile => !tile.free && !tile.bonus);
  return {
    complete: actual.filter(tile => tileProgress(tile, submissions).complete).length,
    total: actual.length,
    bonusPoints: tiles.filter(tile => tile.bonus).reduce((total, tile) => total + tileProgress(tile, submissions).bonusPoints, 0),
    pending: submissions.filter(s => s.status === 'pending').length
  };
}
