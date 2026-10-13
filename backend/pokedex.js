import { pokemon } from './pokemon.js';

export function createPokedex(fetchJson) {
  const cache = new Map();
  const resourceCache = new Map();
  function resource(path) {
    if (!resourceCache.has(path)) {
      const request = fetchJson(new URL(`https://pokeapi.co/api/v2/${path}`));
      resourceCache.set(path, request);
      request.catch(() => resourceCache.delete(path));
    }
    return resourceCache.get(path);
  }
  const speciesId = node => Number(node.species?.url?.match(/\/pokemon-species\/(\d+)\/?$/)?.[1]);
  function findStage(node, id) {
    if (!node) return null;
    if (speciesId(node) === id) return node;
    for (const next of node.evolves_to || []) { const found = findStage(next, id); if (found) return found; }
    return null;
  }
  async function evolution(species, id) {
    try {
      const chainId = species.evolution_chain?.url?.match(/\/evolution-chain\/(\d+)\/?$/)?.[1];
      if (!chainId) throw new Error('Missing evolution chain');
      const chain = await resource(`evolution-chain/${chainId}/`);
      const stage = findStage(chain.chain, id);
      if (!stage || !Array.isArray(stage.evolves_to)) throw new Error('Missing evolution stage');
      const next = await Promise.all(stage.evolves_to.map(async node => {
        const nextId = speciesId(node);
        if (!Number.isInteger(nextId) || nextId < 1) throw new Error('Invalid species');
        const target = await resource(`pokemon-species/${nextId}/`);
        return { id: nextId, name: target.names?.find(n => n.language?.name === 'ko')?.name || node.species.name };
      }));
      return { available: true, next };
    } catch { return { available: false, next: [] }; }
  }
  return async id => {
    const local = pokemon.find(p => p.id === id);
    if (!local) return null;
    if (cache.has(id)) return cache.get(id);
    // Cache in-flight requests too, so repeated clicks do not duplicate API calls.
    const request = (async () => {
      const [details, species] = await Promise.all([
        resource(`pokemon/${id}/`),
        resource(`pokemon-species/${id}/`),
      ]);
      if (details.id !== id || species.id !== id || !Number.isFinite(details.height) || !Number.isFinite(details.weight) || !Array.isArray(details.stats)) throw new Error('Incomplete Pokédex data');
      const entries = species.flavor_text_entries || [];
      const entry = entries.findLast(e => e.language?.name === 'ko') || entries.findLast(e => e.language?.name === 'en');
      const evolutions = await evolution(species, id);
      return {
        id, name: species.names?.find(n => n.language?.name === 'ko')?.name || local.name,
        types: local.types,
        genus: species.genera?.find(g => g.language?.name === 'ko')?.genus || species.genera?.find(g => g.language?.name === 'en')?.genus || '분류 정보 없음',
        height: details.height / 10, weight: details.weight / 10,
        description: entry?.flavor_text?.replace(/[\n\r\f]+/g, ' ').trim() || '도감 설명이 제공되지 않습니다.',
        descriptionLanguage: entry?.language?.name || null, version: entry?.version?.name || null,
        abilities: (details.abilities || []).map(a => ({ name: a.ability.name.replaceAll('-', ' '), hidden: a.is_hidden })),
        stats: details.stats.map(s => ({ name: s.stat.name, value: s.base_stat })),
        evolution: evolutions,
        source: 'https://pokeapi.co/',
      };
    })();
    cache.set(id, request);
    try {
      const result = await request;
      if (!result.evolution.available) cache.delete(id); // Allow a later click to retry just the missing evolution resources.
      return result;
    }
    catch (error) { cache.delete(id); throw error; }
  };
}
