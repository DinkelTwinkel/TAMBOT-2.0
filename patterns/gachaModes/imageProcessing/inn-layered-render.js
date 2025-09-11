// inn-layered-render.js - Inn map generator with tile-based rendering
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const { generateThemeImages, getInnTheme } = require('./generateInnImages');

// Constants
const FLOOR_TILE_SIZE = 64;
const WALL_TILE_HEIGHT = 90; // Taller for perspective, same width as floor
const BORDER_SIZE = 5;

// Default inn dimensions (can be overridden by gameData)
const DEFAULT_INN_WIDTH = 10; // tiles
const DEFAULT_INN_HEIGHT = 7; // tiles

// Render layers
const RENDER_LAYERS = {
    FLOOR: 0,      // Bottom layer - floor tiles
    MIDGROUND: 1,  // Middle layer - walls, tables, chairs, players
    TOP: 2         // Top layer - effects, overlays
};

// Tile types for inn
const INN_TILE_TYPES = {
    WALL: 'wall',
    FLOOR: 'floor',
    TABLE: 'table',
    CHAIR: 'chair',
    DOOR: 'door',
    WINDOW: 'window',
    DECORATION: 'decoration'
};

// Fallback colors when images aren't available
const INN_TILE_COLORS = {
    [INN_TILE_TYPES.WALL]: '#8B4513',    // Brown wall
    [INN_TILE_TYPES.FLOOR]: '#8B4513',   // Dark brown wood floor
    [INN_TILE_TYPES.TABLE]: '#654321',   // Dark brown table
    [INN_TILE_TYPES.CHAIR]: '#A0522D',   // Sienna chair
    [INN_TILE_TYPES.DOOR]: '#654321',    // Dark brown door
    [INN_TILE_TYPES.WINDOW]: '#87CEEB',  // Sky blue window
    [INN_TILE_TYPES.DECORATION]: '#228B22' // Forest green decoration
};

// Image cache to avoid loading same images multiple times
const tileImageCache = new Map();

/**
 * Load inn tile image with caching and auto-generation
 */
async function loadInnTileImage(theme, tileType, variation = '', dbEntry = null) {
    const cacheKey = `inn_${theme}_${tileType}${variation}`;
    
    if (tileImageCache.has(cacheKey)) {
        return tileImageCache.get(cacheKey);
    }
    
    const fileName = variation ? `${theme}_${tileType}_${variation}.png` : `${theme}_${tileType}.png`;
    const filePath = path.join(__dirname, '../../../assets/game/inn', fileName);
    
    try {
        const image = await loadImage(filePath);
        tileImageCache.set(cacheKey, image);
        return image;
    } catch (error) {
        console.log(`Inn tile image not found: ${filePath}, attempting to generate...`);
        
        try {
            // Generate missing images for this theme
            await generateThemeImages(theme);
            console.log(`Generated inn images for theme: ${theme}`);
            
            // Try loading again after generation
            const image = await loadImage(filePath);
            tileImageCache.set(cacheKey, image);
            console.log(`Successfully loaded after generation: ${filePath}`);
            return image;
        } catch (genError) {
            console.warn(`Failed to generate or load inn tile image for theme ${theme}: ${filePath}`);
            return null;
        }
    }
}

/**
 * Seeded random function using sin() for consistent randomness
 */
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

/**
 * Populate inn with table islands, wall tables, and decorations
 * @param {Array} layout - 2D array representing the inn layout
 * @param {string} channelId - Channel ID for consistent seeding
 * @param {Object} dimensions - Inn dimensions {width, height}
 * @param {Object} tileTypes - Tile type constants
 * @returns {Object} - Updated layout with tables, chairs, decorations, and chair count
 */
function populateInn(layout, channelId, dimensions, tileTypes) {
    const INN_WIDTH = dimensions.width;
    const INN_HEIGHT = dimensions.height;
    const channelSeed = parseInt(channelId.replace(/\D/g, '').slice(-8) || '12345678', 10);
    
    const usedPositions = new Set();
    let chairCount = 0;
    
    // First, place door and protect its area
    const doorInfo = addDoor(layout, channelSeed, tileTypes, INN_WIDTH, INN_HEIGHT);
    if (doorInfo) {
        // Protect door area from furniture placement
        protectDoorArea(doorInfo.x, doorInfo.y, usedPositions, INN_WIDTH, INN_HEIGHT);
    }
    
    // Define possible table island sizes (width x height)
    const islandSizes = [
        { w: 1, h: 2 }, { w: 1, h: 3 }, { w: 2, h: 2 }, 
        { w: 2, h: 3 }, { w: 2, h: 4 }, { w: 2, h: 5 }, 
        { w: 2, h: 6 }, { w: 2, h: 7 }, { w: 2, h: 8 }
    ];
    
    // Shuffle island sizes based on channel seed to determine priority
    const shuffledSizes = [...islandSizes];
    for (let i = shuffledSizes.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(channelSeed + i) * (i + 1));
        [shuffledSizes[i], shuffledSizes[j]] = [shuffledSizes[j], shuffledSizes[i]];
    }
    
    // Phase 1: Try to place table islands with proper spacing
    console.log(`[PopulateInn] Phase 1: Placing table islands`);
    
    for (const size of shuffledSizes) {
        // Try multiple positions for this island size
        const maxAttempts = 30;
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            // Generate random position with proper margins (2 tiles from walls, 3 between islands)
            const wallMargin = 2; // Distance from walls
            const islandMargin = 3; // Distance between islands
            const x = Math.floor(seededRandom(channelSeed + attempts + size.w * 100) * (INN_WIDTH - size.w - wallMargin * 2)) + wallMargin;
            const y = Math.floor(seededRandom(channelSeed + attempts + size.h * 100) * (INN_HEIGHT - size.h - wallMargin * 2)) + wallMargin;
            
            if (canPlaceIsland(layout, x, y, size.w, size.h, usedPositions, tileTypes, islandMargin)) {
                const islandChairs = placeTableIsland(layout, x, y, size.w, size.h, usedPositions, tileTypes);
                chairCount += islandChairs;
                console.log(`[PopulateInn] Placed ${size.w}x${size.h} island at (${x},${y}) with ${islandChairs} chairs`);
                break;
            }
            attempts++;
        }
    }
    
    // Phase 2: Place individual tables against walls where space allows
    console.log(`[PopulateInn] Phase 2: Placing wall tables`);
    
    const wallPositions = [];
    
    // Top wall positions
    for (let x = 2; x < INN_WIDTH - 2; x += 2) {
        wallPositions.push({ x: x, y: 1, wall: 'top' });
    }
    
    // Bottom wall positions  
    for (let x = 2; x < INN_WIDTH - 2; x += 2) {
        wallPositions.push({ x: x, y: INN_HEIGHT - 2, wall: 'bottom' });
    }
    
    // Left wall positions
    for (let y = 2; y < INN_HEIGHT - 2; y += 2) {
        wallPositions.push({ x: 1, y: y, wall: 'left' });
    }
    
    // Right wall positions
    for (let y = 2; y < INN_HEIGHT - 2; y += 2) {
        wallPositions.push({ x: INN_WIDTH - 2, y: y, wall: 'right' });
    }
    
    // Shuffle wall positions
    for (let i = wallPositions.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(channelSeed + i + 500) * (i + 1));
        [wallPositions[i], wallPositions[j]] = [wallPositions[j], wallPositions[i]];
    }
    
    // Try to place wall tables
    for (const pos of wallPositions) {
        if (canPlaceWallTable(layout, pos.x, pos.y, usedPositions, tileTypes)) {
            const wallChairs = placeWallTable(layout, pos.x, pos.y, pos.wall, usedPositions, tileTypes);
            chairCount += wallChairs;
        }
    }
    
    // Phase 3: Add decorations
    console.log(`[PopulateInn] Phase 3: Placing decorations`);
    chairCount += placeDecorations(layout, channelId, usedPositions, tileTypes, INN_WIDTH, INN_HEIGHT);
    
    // Add windows (door was already placed at the beginning)
    addWindows(layout, channelSeed, tileTypes, INN_WIDTH, INN_HEIGHT);
    
    console.log(`[PopulateInn] Inn populated with ${chairCount} total chairs for ${INN_WIDTH}x${INN_HEIGHT} inn`);
    return { layout, chairCount };
}

/**
 * Check if a table island can be placed at the given position
 */
function canPlaceIsland(layout, x, y, width, height, usedPositions, tileTypes, spacing) {
    // Check bounds - ensure island fits within inn boundaries
    if (x < 1 || y < 1 || x + width >= layout[0].length - 1 || y + height >= layout.length - 1) return false;
    
    // Check if the island area itself is clear
    for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
            const checkX = x + dx;
            const checkY = y + dy;
            
            if (layout[checkY][checkX] !== tileTypes.FLOOR || 
                usedPositions.has(`${checkX},${checkY}`)) {
                return false;
            }
        }
    }
    
    // Check spacing around island (for chairs and spacing between islands)
    for (let dy = -spacing; dy < height + spacing; dy++) {
        for (let dx = -spacing; dx < width + spacing; dx++) {
            const checkX = x + dx;
            const checkY = y + dy;
            
            // Skip the island area itself
            if (dx >= 0 && dx < width && dy >= 0 && dy < height) continue;
            
            // Check if within bounds
            if (checkX < 1 || checkX >= layout[0].length - 1 || 
                checkY < 1 || checkY >= layout.length - 1) continue;
            
            // Check if position is already used (by other furniture or protected areas)
            if (usedPositions.has(`${checkX},${checkY}`)) {
                return false;
            }
            
            // For chair placement area (1 tile around island), ensure it's floor
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && 
                layout[checkY][checkX] !== tileTypes.FLOOR) {
                return false;
            }
        }
    }
    
    return true;
}

/**
 * Place a table island and return chair count
 */
function placeTableIsland(layout, x, y, width, height, usedPositions, tileTypes) {
    let chairCount = 0;
    
    // Place tables and mark them as used
    for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
            const tableX = x + dx;
            const tableY = y + dy;
            layout[tableY][tableX] = tileTypes.TABLE;
            usedPositions.add(`${tableX},${tableY}`);
        }
    }
    
    // Place chairs around the perimeter and mark spacing area as used
    for (let dy = -1; dy <= height; dy++) {
        for (let dx = -1; dx <= width; dx++) {
            const chairX = x + dx;
            const chairY = y + dy;
            
            // Skip positions inside the island
            if (dx >= 0 && dx < width && dy >= 0 && dy < height) continue;
            
            // Skip corners (no chairs in corners)
            if ((dx === -1 || dx === width) && (dy === -1 || dy === height)) continue;
            
            // Check bounds
            if (chairX < 1 || chairX >= layout[0].length - 1 || 
                chairY < 1 || chairY >= layout.length - 1) continue;
            
            // Place chair if possible
            if (layout[chairY][chairX] === tileTypes.FLOOR && 
                !usedPositions.has(`${chairX},${chairY}`)) {
                layout[chairY][chairX] = tileTypes.CHAIR;
                usedPositions.add(`${chairX},${chairY}`);
                chairCount++;
            }
        }
    }
    
    // Mark additional spacing area around island to maintain separation
    const spacingRadius = 2; // 2-tile spacing between islands
    for (let dy = -spacingRadius; dy < height + spacingRadius; dy++) {
        for (let dx = -spacingRadius; dx < width + spacingRadius; dx++) {
            const spaceX = x + dx;
            const spaceY = y + dy;
            
            // Skip the island and chair areas (already marked)
            if (dx >= -1 && dx <= width && dy >= -1 && dy <= height) continue;
            
            // Mark spacing area as used to prevent other islands from being too close
            if (spaceX >= 1 && spaceX < layout[0].length - 1 && 
                spaceY >= 1 && spaceY < layout.length - 1) {
                usedPositions.add(`${spaceX},${spaceY}`);
            }
        }
    }
    
    return chairCount;
}

/**
 * Check if a wall table can be placed
 */
function canPlaceWallTable(layout, x, y, usedPositions, tileTypes) {
    // Check if table position is clear
    if (layout[y][x] !== tileTypes.FLOOR || usedPositions.has(`${x},${y}`)) return false;
    
    // Check if there's space for at least one chair
    const chairPositions = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
    ];
    
    for (const [cx, cy] of chairPositions) {
        if (cx >= 1 && cx < layout[0].length - 1 && 
            cy >= 1 && cy < layout.length - 1 &&
            layout[cy][cx] === tileTypes.FLOOR && 
            !usedPositions.has(`${cx},${cy}`)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Place a wall table and return chair count
 */
function placeWallTable(layout, x, y, wall, usedPositions, tileTypes) {
    layout[y][x] = tileTypes.TABLE;
    usedPositions.add(`${x},${y}`);
    
    let chairCount = 0;
    let chairPositions = [];
    
    // Determine chair positions based on wall
    switch (wall) {
        case 'top':
            chairPositions = [[x - 1, y], [x + 1, y], [x, y + 1]];
            break;
        case 'bottom':
            chairPositions = [[x - 1, y], [x + 1, y], [x, y - 1]];
            break;
        case 'left':
            chairPositions = [[x + 1, y], [x, y - 1], [x, y + 1]];
            break;
        case 'right':
            chairPositions = [[x - 1, y], [x, y - 1], [x, y + 1]];
            break;
    }
    
    // Place chairs where possible
    for (const [cx, cy] of chairPositions) {
        if (cx >= 1 && cx < layout[0].length - 1 && 
            cy >= 1 && cy < layout.length - 1 &&
            layout[cy][cx] === tileTypes.FLOOR && 
            !usedPositions.has(`${cx},${cy}`)) {
            layout[cy][cx] = tileTypes.CHAIR;
            usedPositions.add(`${cx},${cy}`);
            chairCount++;
        }
    }
    
    return chairCount;
}

/**
 * Place decorations and return any additional "chair equivalent" count
 */
function placeDecorations(layout, channelId, usedPositions, tileTypes, INN_WIDTH, INN_HEIGHT) {
    const channelSeed = parseInt(channelId.replace(/\D/g, '').slice(-8) || '12345678', 10);
    
    // Determine decoration type based on channel ID
    const decorationType = Math.floor(Math.abs(Math.sin(channelSeed)) * 3);
    const decorationTypes = ['PLANT', 'BARREL', 'BOOKSHELF'];
    const selectedDecoration = decorationTypes[decorationType];
    
    console.log(`[PopulateInn] Selected decoration type: ${selectedDecoration}`);
    
    // Add decoration tile type if not exists (for rendering)
    if (!tileTypes.DECORATION) {
        tileTypes.DECORATION = 'decoration';
    }
    
    let decorationsPlaced = 0;
    const maxDecorations = Math.floor((INN_WIDTH * INN_HEIGHT) / 20); // Limit decorations
    
    // Try to place decorations in available spaces
    for (let attempts = 0; attempts < maxDecorations * 10 && decorationsPlaced < maxDecorations; attempts++) {
        const x = Math.floor(seededRandom(channelSeed + attempts + 1000) * (INN_WIDTH - 2)) + 1;
        const y = Math.floor(seededRandom(channelSeed + attempts + 2000) * (INN_HEIGHT - 2)) + 1;
        
        // Check if position is available and has floor around it
        if (layout[y][x] === tileTypes.FLOOR && !usedPositions.has(`${x},${y}`)) {
            // Check if it's either against a wall or isolated (surrounded by floor)
            const isAgainstWall = (x === 1 || x === INN_WIDTH - 2 || y === 1 || y === INN_HEIGHT - 2);
            const isIsolated = !isAgainstWall && isPositionIsolated(layout, x, y, tileTypes);
            
            if (isAgainstWall || isIsolated) {
                layout[y][x] = tileTypes.DECORATION;
                usedPositions.add(`${x},${y}`);
                decorationsPlaced++;
            }
        }
    }
    
    console.log(`[PopulateInn] Placed ${decorationsPlaced} ${selectedDecoration} decorations`);
    return 0; // Decorations don't add to chair count
}

/**
 * Check if a position is isolated (surrounded by floor tiles)
 */
function isPositionIsolated(layout, x, y, tileTypes) {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const checkX = x + dx;
            const checkY = y + dy;
            if (layout[checkY][checkX] !== tileTypes.FLOOR) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Add door to the inn and return door position
 */
function addDoor(layout, channelSeed, tileTypes, INN_WIDTH, INN_HEIGHT) {
    const bottomWallPositions = [];
    for (let x = 1; x < INN_WIDTH - 1; x++) {
        if (layout[INN_HEIGHT - 2][x] === tileTypes.FLOOR) {
            bottomWallPositions.push(x);
        }
    }
    
    if (bottomWallPositions.length > 0) {
        const randomIndex = Math.floor(seededRandom(channelSeed + 1000) * bottomWallPositions.length);
        const randomX = bottomWallPositions[randomIndex];
        layout[INN_HEIGHT - 1][randomX] = tileTypes.DOOR;
        return { x: randomX, y: INN_HEIGHT - 1 };
    }
    
    return null;
}

/**
 * Protect the area around the door from furniture placement
 */
function protectDoorArea(doorX, doorY, usedPositions, INN_WIDTH, INN_HEIGHT) {
    // Protect the floor tile directly in front of the door
    const floorTileX = doorX;
    const floorTileY = doorY - 1;
    
    // Protect a 3x2 area in front of the door (door approach area)
    for (let dy = 0; dy >= -1; dy--) {
        for (let dx = -1; dx <= 1; dx++) {
            const protectX = floorTileX + dx;
            const protectY = floorTileY + dy;
            
            if (protectX >= 1 && protectX < INN_WIDTH - 1 && 
                protectY >= 1 && protectY < INN_HEIGHT - 1) {
                usedPositions.add(`${protectX},${protectY}`);
            }
        }
    }
    
    console.log(`[PopulateInn] Protected door area around (${doorX}, ${doorY})`);
}

/**
 * Add windows to the inn
 */
function addWindows(layout, channelSeed, tileTypes, INN_WIDTH, INN_HEIGHT) {
    const wallPositions = [];
    for (let y = 0; y < INN_HEIGHT; y++) {
        for (let x = 0; x < INN_WIDTH; x++) {
            if (layout[y][x] === tileTypes.WALL && 
                !(x === 0 && y === 0) && !(x === 0 && y === INN_HEIGHT - 1) && 
                !(x === INN_WIDTH - 1 && y === 0) && !(x === INN_WIDTH - 1 && y === INN_HEIGHT - 1) &&
                layout[y][x] !== tileTypes.DOOR) {
                wallPositions.push({ x, y });
            }
        }
    }
    
    const windowCount = Math.floor(wallPositions.length * 0.3);
    for (let i = 0; i < windowCount; i++) {
        const randomIndex = Math.floor(seededRandom(channelSeed + 2000 + i) * wallPositions.length);
        const pos = wallPositions.splice(randomIndex, 1)[0];
        if (pos) layout[pos.y][pos.x] = tileTypes.WINDOW;
    }
}

/**
 * Generate inn layout with tables and chairs
 * Returns an object with layout and chair count
 * @param {string} channelId - Channel ID for consistent seeding
 * @param {Object} dimensions - Inn dimensions {width, height}
 */
function generateInnLayout(channelId = 'default', dimensions = null) {
    const INN_WIDTH = dimensions?.width || DEFAULT_INN_WIDTH;
    const INN_HEIGHT = dimensions?.height || DEFAULT_INN_HEIGHT;
    
    // Initialize with all walls
    const layout = Array(INN_HEIGHT).fill().map(() => Array(INN_WIDTH).fill(INN_TILE_TYPES.WALL));
    
    // Create interior floor space (1 tile border of walls)
    for (let y = 1; y < INN_HEIGHT - 1; y++) {
        for (let x = 1; x < INN_WIDTH - 1; x++) {
            layout[y][x] = INN_TILE_TYPES.FLOOR;
        }
    }
    
    // Populate with tables, chairs, and decorations
    return populateInn(layout, channelId, { width: INN_WIDTH, height: INN_HEIGHT }, INN_TILE_TYPES);
}

/**
 * Draw floor tile
 */
async function drawFloorTile(ctx, x, y, tileSize, theme, dbEntry = null) {
    const pixelX = x * tileSize;
    const pixelY = y * tileSize;
    
    // Try to load floor image
    const floorImage = await loadInnTileImage(theme, 'floor', '', dbEntry);
    
    if (floorImage) {
        ctx.drawImage(floorImage, pixelX, pixelY, tileSize, tileSize);
    } else {
        // Programmatic wood floor rendering
        // Base wood color
        ctx.fillStyle = '#8B4513'; // Dark brown wood
        ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
        
        // Wood planks - horizontal planks
        ctx.fillStyle = '#A0522D'; // Lighter brown for planks
        const plankHeight = tileSize / 3;
        for (let i = 0; i < 3; i++) {
            const plankY = pixelY + i * plankHeight;
            ctx.fillRect(pixelX + 2, plankY + 1, tileSize - 4, plankHeight - 2);
        }
        
        // Wood grain lines
        ctx.strokeStyle = '#654321'; // Darker brown for grain
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const plankY = pixelY + i * plankHeight;
            // Horizontal grain lines
            for (let j = 0; j < 2; j++) {
                const grainY = plankY + (j + 1) * plankHeight / 3;
                ctx.beginPath();
                ctx.moveTo(pixelX + 4, grainY);
                ctx.lineTo(pixelX + tileSize - 4, grainY);
                ctx.stroke();
            }
        }
        
        // Plank separation lines
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 2;
        for (let i = 1; i < 3; i++) {
            const separatorY = pixelY + i * plankHeight;
            ctx.beginPath();
            ctx.moveTo(pixelX, separatorY);
            ctx.lineTo(pixelX + tileSize, separatorY);
            ctx.stroke();
        }
    }
}

/**
 * Draw wall tile
 */
async function drawWallTile(ctx, x, y, floorTileSize, wallTileHeight, theme, dbEntry = null) {
    const pixelX = x * floorTileSize;
    const wallPixelY = y * floorTileSize - (wallTileHeight - floorTileSize);
    
    // Try to load wall image
    const wallImage = await loadInnTileImage(theme, 'wall', '', dbEntry);
    
    if (wallImage) {
        ctx.drawImage(wallImage, pixelX, wallPixelY, floorTileSize, wallTileHeight);
    } else {
        // Programmatic wall rendering
        ctx.fillStyle = INN_TILE_COLORS[INN_TILE_TYPES.WALL];
        ctx.fillRect(pixelX, wallPixelY, floorTileSize, wallTileHeight);
        
        // Add stone texture
        ctx.fillStyle = '#A0522D';
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 2; j++) {
                const stoneX = pixelX + i * floorTileSize / 3 + 5;
                const stoneY = wallPixelY + j * wallTileHeight / 2 + 5;
                ctx.fillRect(stoneX, stoneY, floorTileSize / 3 - 10, wallTileHeight / 2 - 10);
            }
        }
    }
}

/**
 * Draw table
 */
async function drawTable(ctx, x, y, tileSize, theme, dbEntry = null) {
    const pixelX = x * tileSize;
    const pixelY = y * tileSize;
    
    // Try to load table image
    const tableImage = await loadInnTileImage(theme, 'table', '', dbEntry);
    
    if (tableImage) {
        ctx.drawImage(tableImage, pixelX, pixelY, tileSize, tileSize);
    } else {
        // Fallback programmatic rendering
    ctx.fillStyle = INN_TILE_COLORS[INN_TILE_TYPES.TABLE];
    ctx.fillRect(pixelX + 8, pixelY + 8, tileSize - 16, tileSize - 16);
    
    ctx.fillStyle = '#4A4A4A';
    const legSize = 6;
    ctx.fillRect(pixelX + 10, pixelY + 10, legSize, legSize);
    ctx.fillRect(pixelX + tileSize - 16, pixelY + 10, legSize, legSize);
    ctx.fillRect(pixelX + 10, pixelY + tileSize - 16, legSize, legSize);
    ctx.fillRect(pixelX + tileSize - 16, pixelY + tileSize - 16, legSize, legSize);
    
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.strokeRect(pixelX + 8, pixelY + 8, tileSize - 16, tileSize - 16);
    }
}

/**
 * Draw door
 */
async function drawDoor(ctx, x, y, floorTileSize, wallTileHeight, theme, dbEntry = null) {
    const pixelX = x * floorTileSize;
    const wallPixelY = y * floorTileSize - (wallTileHeight - floorTileSize);
    
    // Door is half the height of wall
    const doorHeight = wallTileHeight / 2;
    const doorY = wallPixelY + (wallTileHeight - doorHeight) / 2;
    
    // Try to load door image
    const doorImage = await loadInnTileImage(theme, 'door', '', dbEntry);
    
    if (doorImage) {
        ctx.drawImage(doorImage, pixelX, doorY, floorTileSize, doorHeight);
    } else {
        // Programmatic door rendering
        // Door frame
        ctx.fillStyle = '#654321'; // Dark brown frame
        ctx.fillRect(pixelX, doorY, floorTileSize, doorHeight);
        
        // Door panels
        ctx.fillStyle = '#8B4513'; // Medium brown door
        const panelWidth = floorTileSize - 8;
        const panelHeight = doorHeight - 8;
        ctx.fillRect(pixelX + 4, doorY + 4, panelWidth, panelHeight);
        
        // Door handle
        ctx.fillStyle = '#FFD700'; // Gold handle
        const handleSize = 4;
        const handleX = pixelX + floorTileSize - 12;
        const handleY = doorY + doorHeight / 2;
        ctx.fillRect(handleX, handleY, handleSize, handleSize);
        
        // Door panels detail
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 2;
        const upperPanelHeight = panelHeight / 2 - 4;
        const lowerPanelHeight = panelHeight / 2 - 4;
        
        // Upper panel
        ctx.strokeRect(pixelX + 8, doorY + 8, panelWidth - 8, upperPanelHeight);
        // Lower panel
        ctx.strokeRect(pixelX + 8, doorY + 8 + upperPanelHeight + 8, panelWidth - 8, lowerPanelHeight);
    }
}

/**
 * Draw window
 */
async function drawWindow(ctx, x, y, floorTileSize, wallTileHeight, theme, layout, dbEntry = null) {
    const pixelX = x * floorTileSize;
    const wallPixelY = y * floorTileSize - (wallTileHeight - floorTileSize);
    
    // Determine if this is a side window (left or right wall)
    const INN_WIDTH = layout[0] ? layout[0].length : 0;
    const isSideWindow = (x === 0 || x === INN_WIDTH - 1);
    
    // Try to load window image
    const windowImage = isSideWindow ? 
        await loadInnTileImage(theme, 'windowSide', '', dbEntry) : 
        await loadInnTileImage(theme, 'window', '', dbEntry);
    
    if (windowImage) {
        if (isSideWindow) {
            // Side window - use full height
            ctx.drawImage(windowImage, pixelX, wallPixelY, floorTileSize, wallTileHeight);
        } else {
            // Regular window - half height
            const windowHeight = wallTileHeight / 2;
            const windowY = wallPixelY + (wallTileHeight - windowHeight) / 2;
            ctx.drawImage(windowImage, pixelX, windowY, floorTileSize, windowHeight);
        }
    } else {
        // Programmatic window rendering
        if (isSideWindow) {
            // Side window: thick line from top center to bottom center
            ctx.strokeStyle = '#654321'; // Dark brown frame
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(pixelX + floorTileSize / 2, wallPixelY);
            ctx.lineTo(pixelX + floorTileSize / 2, wallPixelY + wallTileHeight);
            ctx.stroke();
        } else {
            // Top/bottom window: half height of wall
            const windowHeight = wallTileHeight / 2;
            const windowY = wallPixelY + (wallTileHeight - windowHeight) / 2;
            
            // Window frame only (no glass fill - see-through)
            ctx.strokeStyle = '#654321'; // Dark brown frame
            ctx.lineWidth = 4;
            ctx.strokeRect(pixelX, windowY, floorTileSize, windowHeight);
            
            // Window cross pattern (frame details)
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 2;
        // Horizontal cross
        ctx.beginPath();
            ctx.moveTo(pixelX + 4, windowY + windowHeight / 2);
            ctx.lineTo(pixelX + floorTileSize - 4, windowY + windowHeight / 2);
        ctx.stroke();
        // Vertical cross
        ctx.beginPath();
            ctx.moveTo(pixelX + floorTileSize / 2, windowY + 4);
            ctx.lineTo(pixelX + floorTileSize / 2, windowY + windowHeight - 4);
        ctx.stroke();
        }
    }
}

/**
 * Draw chair
 */
async function drawChair(ctx, x, y, tileSize, theme, dbEntry = null) {
    const pixelX = x * tileSize;
    const pixelY = y * tileSize;
    
    // Try to load chair image
    const chairImage = await loadInnTileImage(theme, 'chair', '', dbEntry);
    
    if (chairImage) {
        ctx.drawImage(chairImage, pixelX, pixelY, tileSize, tileSize);
    } else {
        // Fallback programmatic rendering
    const chairSize = tileSize * 0.6;
    const chairX = pixelX + (tileSize - chairSize) / 2;
    const chairY = pixelY + (tileSize - chairSize) / 2;
    
    ctx.fillStyle = INN_TILE_COLORS[INN_TILE_TYPES.CHAIR];
    ctx.fillRect(chairX, chairY, chairSize, chairSize * 0.6);
    ctx.fillRect(chairX, chairY - chairSize * 0.3, chairSize, chairSize * 0.3);
    
    ctx.fillStyle = '#654321';
    const legSize = 4;
    ctx.fillRect(chairX + 2, chairY + chairSize * 0.6, legSize, chairSize * 0.4);
    ctx.fillRect(chairX + chairSize - 6, chairY + chairSize * 0.6, legSize, chairSize * 0.4);
    }
}

/**
 * Draw decoration (plant, barrel, or bookshelf)
 */
async function drawDecoration(ctx, x, y, tileSize, theme, dbEntry = null) {
    const pixelX = x * tileSize;
    const pixelY = y * tileSize;
    
    // Try to load decoration image
    const decorationImage = await loadInnTileImage(theme, 'decoration', '', dbEntry);
    
    if (decorationImage) {
        ctx.drawImage(decorationImage, pixelX, pixelY, tileSize, tileSize);
    } else {
        // Fallback programmatic rendering
        ctx.fillStyle = INN_TILE_COLORS[INN_TILE_TYPES.DECORATION];
        ctx.beginPath();
        ctx.arc(pixelX + tileSize / 2, pixelY + tileSize / 2, tileSize / 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#8B4513';
        const baseSize = tileSize / 4;
        ctx.fillRect(pixelX + tileSize / 2 - baseSize / 2, pixelY + tileSize - baseSize, baseSize, baseSize);
        
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pixelX + tileSize / 2, pixelY + tileSize / 2, tileSize / 3, 0, Math.PI * 2);
        ctx.stroke();
    }
}

/**
 * Check if a tile is a wall type
 */
function isInnWallType(tileType) {
    return tileType === INN_TILE_TYPES.WALL || 
           tileType === INN_TILE_TYPES.WINDOW || 
           tileType === INN_TILE_TYPES.DOOR;
}

/**
 * Draw shadow gradients on floor tiles adjacent to walls (like mining system)
 */
function drawInnFloorShadowGradients(ctx, layout, x, y, pixelX, pixelY, tileSize) {
    const INN_HEIGHT = layout.length;
    const INN_WIDTH = layout[0] ? layout[0].length : 0;
    
    // Check adjacent tiles for walls (but not walls below)
    const wallNorth = y > 0 && isInnWallType(layout[y - 1][x]);
    const wallSouth = false; // Never draw shadow from below
    const wallEast = x < INN_WIDTH - 1 && isInnWallType(layout[y][x + 1]);
    const wallWest = x > 0 && isInnWallType(layout[y][x - 1]);
    
    // Also check diagonal walls for corner shadows
    const wallNorthEast = y > 0 && x < INN_WIDTH - 1 && isInnWallType(layout[y - 1][x + 1]);
    const wallNorthWest = y > 0 && x > 0 && isInnWallType(layout[y - 1][x - 1]);
    
    const shadowIntensity = 0.15;
    const gradientSize = tileSize * 0.4; // How far the gradient extends into the tile
    
    ctx.save();
    
    // North wall shadow (strongest, as walls are above)
    if (wallNorth) {
        const gradient = ctx.createLinearGradient(
            pixelX + tileSize / 2, pixelY,
            pixelX + tileSize / 2, pixelY + gradientSize
        );
        gradient.addColorStop(0, `rgba(0, 0, 0, ${shadowIntensity * 1.5})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(pixelX, pixelY, tileSize, gradientSize);
    }
    
    // East wall shadow
    if (wallEast) {
        const gradient = ctx.createLinearGradient(
            pixelX + tileSize, pixelY + tileSize / 2,
            pixelX + tileSize - gradientSize, pixelY + tileSize / 2
        );
        gradient.addColorStop(0, `rgba(0, 0, 0, ${shadowIntensity})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(pixelX + tileSize - gradientSize, pixelY, gradientSize, tileSize);
    }
    
    // West wall shadow
    if (wallWest) {
        const gradient = ctx.createLinearGradient(
            pixelX, pixelY + tileSize / 2,
            pixelX + gradientSize, pixelY + tileSize / 2
        );
        gradient.addColorStop(0, `rgba(0, 0, 0, ${shadowIntensity})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(pixelX, pixelY, gradientSize, tileSize);
    }
    
    // Corner shadows (diagonal walls create subtle corner darkening)
    const cornerSize = tileSize * 0.3;
    const cornerIntensity = shadowIntensity * 0.7;
    
    // Northeast corner
    if (wallNorthEast && !wallNorth && !wallEast) {
        const gradient = ctx.createRadialGradient(
            pixelX + tileSize, pixelY,
            0,
            pixelX + tileSize, pixelY,
            cornerSize
        );
        gradient.addColorStop(0, `rgba(0, 0, 0, ${cornerIntensity})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(pixelX + tileSize - cornerSize, pixelY, cornerSize, cornerSize);
    }
    
    // Northwest corner
    if (wallNorthWest && !wallNorth && !wallWest) {
        const gradient = ctx.createRadialGradient(
            pixelX, pixelY,
            0,
            pixelX, pixelY,
            cornerSize
        );
        gradient.addColorStop(0, `rgba(0, 0, 0, ${cornerIntensity})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(pixelX, pixelY, cornerSize, cornerSize);
    }
    
    ctx.restore();
}

/**
 * Draw floor layer
 */
async function drawFloorLayer(ctx, layout, tileSize, theme, dbEntry = null) {
    const INN_HEIGHT = layout.length;
    const INN_WIDTH = layout[0] ? layout[0].length : 0;
    
    for (let y = 0; y < INN_HEIGHT; y++) {
        for (let x = 0; x < INN_WIDTH; x++) {
            const tileType = layout[y][x];
            
            // Draw floor under everything except walls
            if (tileType !== INN_TILE_TYPES.WALL) {
                const pixelX = x * tileSize;
                const pixelY = y * tileSize;
                
                await drawFloorTile(ctx, x, y, tileSize, theme, dbEntry);
                
                // Draw shadow gradients from adjacent walls (like mining system)
                drawInnFloorShadowGradients(ctx, layout, x, y, pixelX, pixelY, tileSize);
            }
        }
    }
}

/**
 * Draw midground layer (walls, furniture, players)
 */
async function drawMidgroundLayer(ctx, layout, floorTileSize, wallTileHeight, theme, members = [], playerPositions = {}, dbEntry = null) {
    // Collect all midground objects for Y-sorting
    const midgroundObjects = [];
    const INN_HEIGHT = layout.length;
    const INN_WIDTH = layout[0] ? layout[0].length : 0;
    
    for (let y = 0; y < INN_HEIGHT; y++) {
        for (let x = 0; x < INN_WIDTH; x++) {
            const tileType = layout[y][x];
            const renderY = y * floorTileSize + (tileType === INN_TILE_TYPES.WALL ? -wallTileHeight + floorTileSize : 0);
            
            if (tileType === INN_TILE_TYPES.WALL) {
                midgroundObjects.push({ type: 'wall', x, y, renderY });
            } else if (tileType === INN_TILE_TYPES.WINDOW) {
                midgroundObjects.push({ type: 'window', x, y, renderY });
            } else if (tileType === INN_TILE_TYPES.DOOR) {
                midgroundObjects.push({ type: 'door', x, y, renderY });
            } else if (tileType === INN_TILE_TYPES.TABLE) {
                midgroundObjects.push({ type: 'table', x, y, renderY });
            } else if (tileType === INN_TILE_TYPES.CHAIR) {
                midgroundObjects.push({ type: 'chair', x, y, renderY });
            } else if (tileType === INN_TILE_TYPES.DECORATION) {
                midgroundObjects.push({ type: 'decoration', x, y, renderY });
            }
        }
    }
    
    // Add players to midground objects
    if (members && playerPositions) {
        for (const member of members) {
            const position = playerPositions[member.id];
            if (position) {
                const renderY = position.y * floorTileSize;
                midgroundObjects.push({ 
                    type: 'player', 
                    member, 
                    position, 
                    renderY 
                });
            }
        }
    }
    
    // Sort by Y position for proper depth ordering
    midgroundObjects.sort((a, b) => a.renderY - b.renderY);
    
    // Render all objects in sorted order
    for (const obj of midgroundObjects) {
        switch (obj.type) {
            case 'wall':
                await drawWallTile(ctx, obj.x, obj.y, floorTileSize, wallTileHeight, theme, dbEntry);
                break;
            case 'window':
                await drawWindow(ctx, obj.x, obj.y, floorTileSize, wallTileHeight, theme, layout, dbEntry);
                break;
            case 'door':
                await drawDoor(ctx, obj.x, obj.y, floorTileSize, wallTileHeight, theme, dbEntry);
                break;
            case 'table':
                await drawTable(ctx, obj.x, obj.y, floorTileSize, theme, dbEntry);
                break;
            case 'chair':
                await drawChair(ctx, obj.x, obj.y, floorTileSize, theme, dbEntry);
                break;
            case 'decoration':
                await drawDecoration(ctx, obj.x, obj.y, floorTileSize, theme, dbEntry);
                break;
            case 'player':
                await drawPlayer(ctx, obj.member, obj.position, floorTileSize);
                break;
        }
    }
}

/**
 * Draw player avatar (enhanced version based on mining system)
 */
async function drawPlayer(ctx, member, position, tileSize) {
    const centerX = position.x * tileSize + tileSize / 2;
    const centerY = position.y * tileSize + tileSize / 2;
    const size = Math.min(tileSize * 0.8, 50);
    const radius = size / 2;
    
    try {
        // Load player avatar using the same method as mining system
        const avatarSize = size > 30 ? 128 : 64;
        const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: avatarSize });
        const avatar = await loadImage(avatarURL);
        
        // Draw shadow effect (matching mining system)
        if (size > 20) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.beginPath();
            ctx.arc(centerX + 1, centerY + 1, radius + 1, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw avatar with circular clipping (matching mining system)
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        
        ctx.drawImage(avatar, centerX - radius, centerY - radius, size, size);
        ctx.restore();
        
        // Avatar border with role color (matching mining system)
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
        ctx.strokeStyle = getUserRoleColor(member);
        ctx.lineWidth = Math.max(1, Math.floor(size * 0.05));
        ctx.stroke();
        
        // Draw player name for larger sizes OR customer happiness
        if (tileSize >= 40) {
            const roleColor = getUserRoleColor(member);
            ctx.fillStyle = roleColor;
            ctx.strokeStyle = '#000000';
            ctx.font = `${Math.max(8, Math.floor(tileSize * 0.17))}px Arial`;
            ctx.textAlign = 'center';
            ctx.lineWidth = Math.max(1, Math.floor(tileSize * 0.03));
            const nameY = centerY + radius + Math.max(8, tileSize * 0.2);
            ctx.strokeText(member.displayName || member.user.username, centerX, nameY);
            ctx.fillText(member.displayName || member.user.username, centerX, nameY);
        }
        
        // Draw happiness above customer avatars
        if (member.isCustomer && member.customerData) {
            const happiness = member.customerData.happiness;
            ctx.fillStyle = happiness >= 70 ? '#00FF00' : happiness >= 40 ? '#FFFF00' : '#FF0000';
            ctx.strokeStyle = '#000000';
            ctx.font = `${Math.max(10, Math.floor(tileSize * 0.2))}px Arial`;
            ctx.textAlign = 'center';
            ctx.lineWidth = 2;
            const happinessY = centerY - radius - Math.max(5, tileSize * 0.1);
            ctx.strokeText(happiness.toString(), centerX, happinessY);
            ctx.fillText(happiness.toString(), centerX, happinessY);
        }
        
        // Draw customer wealth under their name in gold
        if (member.isCustomer && member.customerData && tileSize >= 40) {
            const wealth = member.customerData.wealth;
            ctx.fillStyle = '#FFD700'; // Gold color
            ctx.strokeStyle = '#000000';
            ctx.font = `${Math.max(8, Math.floor(tileSize * 0.15))}px Arial`;
            ctx.textAlign = 'center';
            ctx.lineWidth = Math.max(1, Math.floor(tileSize * 0.02));
            const wealthY = centerY + radius + Math.max(8, tileSize * 0.2) + Math.max(10, tileSize * 0.15);
            const wealthText = `${wealth}c`;
            ctx.strokeText(wealthText, centerX, wealthY);
            ctx.fillText(wealthText, centerX, wealthY);
        }
        
        return true;
    } catch (error) {
        console.error(`Error loading avatar for ${member.user.username}:`, error);
        
        // Fallback rendering
        const radius = size / 2;
        ctx.fillStyle = '#4A90E2';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw border
        ctx.strokeStyle = getUserRoleColor(member);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw initial
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${Math.floor(size * 0.4)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((member.displayName || member.user.username).charAt(0).toUpperCase(), centerX, centerY);
        
        return false;
    }
}

/**
 * Get user role color (from mining system)
 */
function getUserRoleColor(member) {
    try {
        // Check for highest role color
        const roles = member.roles?.cache;
        if (roles && roles.size > 0) {
            const sortedRoles = Array.from(roles.values()).sort((a, b) => b.position - a.position);
            for (const role of sortedRoles) {
                if (role.color !== 0) {
                    return `#${role.color.toString(16).padStart(6, '0')}`;
                }
            }
        }
    } catch (error) {
        console.warn('Error getting user role color:', error);
    }
    
    // Default colors
    return '#FFD700'; // Gold default
}

/**
 * Draw top layer (effects, overlays)
 */
async function drawTopLayer(ctx, width, height, tileSize, theme) {
    // Add ambient lighting effect
    const gradient = ctx.createRadialGradient(
        width * tileSize / 2, height * tileSize / 2, 0,
        width * tileSize / 2, height * tileSize / 2, Math.max(width, height) * tileSize / 2
    );
    gradient.addColorStop(0, 'rgba(255, 248, 220, 0.1)'); // Warm center light
    gradient.addColorStop(1, 'rgba(139, 69, 19, 0.1)');   // Darker edges
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width * tileSize, height * tileSize);
}

/**
 * Main function to generate inn map image
 */
async function generateInnMapImage(channel, members = [], playerPositions = {}, innDimensions = null, dbEntry = null) {
    const startTime = Date.now();
    
    // Input validation
    if (!channel?.id) {
        throw new Error('Channel ID is required');
    }
    
    // Use provided dimensions or defaults
    const INN_WIDTH = innDimensions?.width || DEFAULT_INN_WIDTH;
    const INN_HEIGHT = innDimensions?.height || DEFAULT_INN_HEIGHT;
    
    // Generate inn layout with channel ID and dimensions for consistency
    const layoutResult = generateInnLayout(channel.id, { width: INN_WIDTH, height: INN_HEIGHT });
    const layout = layoutResult.layout;
    const chairCount = layoutResult.chairCount;
    
    // Get inn theme from database entry
    const theme = dbEntry ? getInnTheme(dbEntry) : 'generic';
    
    // Calculate image dimensions
    const outputWidth = INN_WIDTH * FLOOR_TILE_SIZE + (BORDER_SIZE * 2);
    const outputHeight = INN_HEIGHT * FLOOR_TILE_SIZE + (BORDER_SIZE * 2);
    
    // Create canvas
    const canvas = createCanvas(outputWidth, outputHeight);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    
    // Fill background
    ctx.fillStyle = '#2F1B14'; // Dark brown background
    ctx.fillRect(0, 0, outputWidth, outputHeight);
    
    // Apply border offset
    ctx.save();
    ctx.translate(BORDER_SIZE, BORDER_SIZE);
    
    try {
        // === LAYER 1: FLOOR LAYER ===
        await drawFloorLayer(ctx, layout, FLOOR_TILE_SIZE, theme, dbEntry);
        
        // === LAYER 2: MIDGROUND LAYER ===
        await drawMidgroundLayer(ctx, layout, FLOOR_TILE_SIZE, WALL_TILE_HEIGHT, theme, members, playerPositions, dbEntry);
        
        // === LAYER 3: TOP LAYER ===
        await drawTopLayer(ctx, INN_WIDTH, INN_HEIGHT, FLOOR_TILE_SIZE, theme);
        
    } catch (error) {
        console.error('[INN_RENDER] Error during rendering:', error);
        throw error;
    }
    
    // Restore translation
    ctx.restore();
    
    // === BORDER ===
    ctx.save();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#8B4513'; // Brown border
    ctx.strokeRect(0, 0, outputWidth, outputHeight);
    ctx.restore();
    
    const totalTime = Date.now() - startTime;
    console.log(`[INN_RENDER] Generated inn map in ${totalTime}ms with ${chairCount} chairs`);
    
    return {
        buffer: canvas.toBuffer('image/png', { compressionLevel: 9 }),
        chairCount: chairCount
    };
}

module.exports = {
    generateInnMapImage,
    generateInnLayout,
    DEFAULT_INN_WIDTH,
    DEFAULT_INN_HEIGHT,
    INN_TILE_TYPES
};
