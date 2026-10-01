// Render layers (THREE.Layers bits). Passes pick what they need.
export const LAYERS = {
  WORLD: 0,      // architecture, props, creatures, chains: rendered everywhere, cast shadows
  VIEWMODEL: 1,  // held lantern + hand: main + reflection, NOT shadow casters
  CAGE: 2,       // lantern cage posts: shadow casters only (stripes on the walls)
  WATER: 3,      // the water plane: main pass only
  FX: 4,         // embers, drips, flame: main + reflection, never shadow
};
