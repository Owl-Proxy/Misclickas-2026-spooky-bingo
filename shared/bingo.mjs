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
    } else if (['any', 'all'].includes(entry.completion_mode)) {
      const groups = (entry.target_drops ?? entry.target_items ?? [entry.item_name]).map(drop => ({ label: drop, quantity: entry.target_quantity, items: expand(drop) }));
      paths = entry.completion_mode === 'any' ? groups.map(group => [group]) : [groups];
    }
    const rawChoices = paths ? paths.flatMap(path => path.flatMap(group => group.items))
      : (entry.target_drops ?? entry.target_items ?? (entry.item_name ? [entry.item_name] : ['Activity progress']));
    const choices = [...new Set(rawChoices)].map(label => ({ id: slug(label), label, bonusEligible: !(entry.bonus_excluded_choices ?? []).includes(label) }));
    return {
      id: entry.tile_id ?? slug(entry.tile_name), title: entry.tile_name,
      source: entry.boss ?? entry.source ?? entry.subtitle ?? '',
      description: entry.challenge ?? entry.rule ?? entry.spooky_vibe ?? entry.spooky_lore ?? '',
      requirementsNote: entry.requirements_note ?? '',
      quantity: entry.target_quantity, paths, choices,
      bonus: entry.scoring_mode === 'bonus', pointsPerDrop: entry.points_per_drop ?? 1,
      legacyRequirements: entry.target_requirements ?? (entry.challenge || entry.rule ? [entry.challenge ?? entry.rule]
        : (entry.target_drops ?? entry.target_items ?? [entry.item_name]).map(item => `${entry.target_quantity}× ${item}`))
    };
  });
  for (const bonus of tiles.filter(tile => tile.bonus)) {
    bonus.sources = tiles.filter(tile => !tile.bonus && tile.choices.some(choice => choice.id !== 'activity-progress' && choice.bonusEligible));
    bonus.choices = bonus.sources.flatMap(source => source.choices.filter(choice => choice.id !== 'activity-progress' && choice.bonusEligible).map(choice => ({
      id: `${source.id}--${choice.id}`, label: `${source.title}: ${choice.label}`,
      sourceTileId: source.id, sourceChoiceId: choice.id, dropLabel: choice.label
    })));
  }
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
  const creditedTileIds = [], creditedSubmissionIds = [];
  if (tile.bonus) for (const submission of accepted) {
    const choice = tile.choices.find(choice => choice.id === submission.choiceId);
    const source = tile.sources?.find(source => source.id === choice?.sourceTileId);
    if (!source || submission.quantity !== 1 || creditedTileIds.includes(source.id)) continue;
    creditedTileIds.push(source.id); creditedSubmissionIds.push(submission.id);
  }
  const bonusPoints = creditedTileIds.length;
  return { complete, counts, paths, bonusPoints, creditedTileIds, creditedSubmissionIds, approved: accepted.length, pending: relevant.filter(s => s.status === 'pending').length };
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
