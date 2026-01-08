/**
 * Brains Game Constants
 *
 * All game constants extracted for easy tuning and reuse across modules.
 */

// Tile and map dimensions (will be loaded from config)
export const DEFAULT_TILE_SIZE = 64;

// Team types - MUST match across all files
export const TEAM_HUMAN = 0;
export const TEAM_ZOMBIE = 1;
export const TEAM_SICK = 2;

// Game phase types
export const PHASE_WAITING = 0;
export const PHASE_PREOUTBREAK = 1;
export const PHASE_POSTOUTBREAK = 2;
export const PHASE_ENDED = 3;

// Timing (in ticks at 20 tick rate)
export const TICK_RATE = 20;
export const TIME_PREOUTBREAK = 60 * TICK_RATE;  // 60 seconds
export const TIME_SICK = 15 * TICK_RATE;         // 15 seconds before outbreak
export const OUTBREAK_RATIO = 0.3;               // 30% of players become sick

// Player speeds (from config, these are defaults)
export const DEFAULT_HUMAN_SPEED = 6.5;
export const DEFAULT_ZOMBIE_SPEED = 6;
export const DEFAULT_SICK_SPEED = 2;

// Physics
export const INFECTION_DISTANCE_TILES = 1.2;  // In tile units

// Player colors (for fallback)
export const HUMAN_COLOR = '#4ecdc4';
export const ZOMBIE_COLOR = '#e94560';
export const SICK_COLOR = '#ff9f43';
