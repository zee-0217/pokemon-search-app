import { pokemon, habitats } from './pokemon.js';
import { landmarks } from './locations.js';

const normalize = name => name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const aliases = { '니드런암컷': 29, '니드런수컷': 32, '니드런(암컷)': 29, '니드런(수컷)': 32 };
export function findPokemon(name) {
  const key = normalize(name);
  return pokemon.find(p => normalize(p.name) === key || (p.englishName && normalize(p.englishName) === key) || p.id === aliases[key]);
}
export function destinationsFor(p) {
  return {
    pokemon: { id: p.id, name: p.name, ecology: p.ecology, types: p.types },
    habitats: p.homes.map(h => habitats[h]),
    locations: landmarks.filter(place => p.homes.includes(place.habitat)).map(place => ({
      name: place.name, admin1: place.admin1, country: place.country,
      latitude: place.latitude, longitude: place.longitude,
      habitat: place.habitat, habitatName: habitats[place.habitat],
      reason: `${habitats[place.habitat]} 환경이 ${p.name}의 서식 특성과 어울려요.`,
    })),
  };
}
