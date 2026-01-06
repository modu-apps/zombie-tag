# Zombie Tag (Brains) - Migrated to New ECS API

## Migration Status: ✅ COMPLETE

This game has been fully migrated from the old Entity2D API to the new ECS API (2025-01-05).

## How to Run

1. **Start the server** (from the network root directory):
   ```bash
   cd path/to/network
   npm run dev
   # or use your preferred local server
   ```

2. **Open the game:**
   - Navigate to: `http://localhost:PORT/games/zombie-tag/brains.html`
   - Replace PORT with your server's port

3. **Test multiplayer:**
   - Open multiple browser tabs/windows
   - Game starts automatically when 2+ players join

## Game Controls

- **WASD** - Move your character
- **Mouse** - Aim direction

## Game Phases

1. **Waiting** - Waiting for 2+ players
2. **Pre-outbreak (60s)** - All players are human
   - At 45s: 30% of players become sick (yellow)
   - At 60s: Sick players become zombies (red)
3. **Post-outbreak** - Zombies hunt humans
   - Zombies infect humans on contact
   - Game ends when all humans or all zombies eliminated

## Migration Details

See `brains.html.backup` for the original version.

### Key Changes:
- ✅ `createGame()` instead of `Modu.init()`
- ✅ Plugin-based architecture (Physics2DSystem, Simple2DRenderer, InputPlugin)
- ✅ ECS entity definitions with components
- ✅ Custom components (TeamComponent, TileData, FurnitureData)
- ✅ Systems instead of onTick callbacks
- ✅ `game.query()` instead of `getEntitiesByType()`
- ✅ `game.spawn()` instead of `new EntityClass()`
- ✅ Fixed sprite paths in brains.json

## Troubleshooting

If you see 404 errors:
- Verify server is running
- Check that you're accessing from correct path
- Ensure engine submodule is initialized: `git submodule update --init`

If sprites don't load:
- Check browser console for specific errors
- Verify .png files exist in zombie-tag folder
- Check CORS settings if using different server
