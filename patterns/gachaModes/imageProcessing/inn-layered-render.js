// inn-layered-render.js - Inn map generator with tile-based rendering
const { createCanvas, loadImage } = require('canvas');
const path = require('path');

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
    DOOR: 'door'
};

// Fallback colors when images aren't available
const INN_TILE_COLORS = {
    [INN_TILE_TYPES.WALL]: '#8B4513',    // Brown wall
    [INN_TILE_TYPES.FLOOR]: '#8B4513',   // Dark brown wood floor
    [INN_TILE_TYPES.TABLE]: '#654321',   // Dark brown table
    [INN_TILE_TYPES.CHAIR]: '#A0522D',   // Sienna chair
    [INN_TILE_TYPES.DOOR]: '#654321'     // Dark brown door
};

// Image cache to avoid loading same images multiple times
const tileImageCache = new Map();

/**
 * Load tile image with caching
 */
async function loadTileImage(theme, tileType, variation = '') {
    const cacheKey = `${theme}_${tileType}${variation}`;
    
    if (tileImageCache.has(cacheKey)) {
        return tileImageCache.get(cacheKey);
    }
    
    // Try to load themed tile first
    const themedPath = path.join(__dirname, '../../../assets/game/tiles', `${theme}_${tileType}${variation}.png`);
    
    try {
        const image = await loadImage(themedPath);
        tileImageCache.set(cacheKey, image);
        return image;
    } catch (error) {
        // Try generic tile as fallback
        const genericPath = path.join(__dirname, '../../../assets/game/tiles', `generic_${tileType}${variation}.png`);
        
        try {
            const image = await loadImage(genericPath);
            tileImageCache.set(cacheKey, image);
            return image;
        } catch (genericError) {
            // No image available, will use programmatic rendering
            console.log(`No tile image found for ${tileType}, using programmatic rendering`);
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
 * Check if position is too close to existing positions
 */
function isPositionTooClose(x, y, usedPositions, minSpacing) {
    for (let dy = -minSpacing; dy <= minSpacing; dy++) {
        for (let dx = -minSpacing; dx <= minSpacing; dx++) {
            if (usedPositions.has(`${x + dx},${y + dy}`)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Generate inn layout with tables and chairs
 * Returns a 2D array representing the inn layout
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
    
    // Generate table and chair islands based on inn size
    // Each island is a table surrounded by chairs
    // Ensure at least 1 floor space between islands
    
    const channelSeed = parseInt(channelId.replace(/\D/g, '').slice(-8) || '12345678', 10);
    const tableIslands = [];
    const interiorWidth = INN_WIDTH - 2; // Exclude walls
    const interiorHeight = INN_HEIGHT - 2; // Exclude walls
    
    // Generate maximum number of table islands with proper spacing
    const minSpacing = 2; // Minimum 2 tiles between table centers (1 tile gap + table + 1 tile gap = 3 total)
    const usedPositions = new Set();
    
    // Calculate grid positions for optimal table placement
    // Each table needs a 3x3 area (table + 4 chairs), with 1 tile spacing between islands
    const tableSpacing = 4; // 3 for table area + 1 for spacing
    const maxTablesX = Math.floor((interiorWidth - 1) / tableSpacing); // -1 for edge spacing
    const maxTablesY = Math.floor((interiorHeight - 1) / tableSpacing);
    
    // Generate all possible table positions in a grid pattern
    const possiblePositions = [];
    for (let gridY = 0; gridY < maxTablesY; gridY++) {
        for (let gridX = 0; gridX < maxTablesX; gridX++) {
            const tableX = 2 + (gridX * tableSpacing) + Math.floor(tableSpacing / 2); // Center in grid cell
            const tableY = 2 + (gridY * tableSpacing) + Math.floor(tableSpacing / 2);
            
            // Ensure position is within bounds
            if (tableX >= 2 && tableX < INN_WIDTH - 2 && tableY >= 2 && tableY < INN_HEIGHT - 2) {
                possiblePositions.push({ x: tableX, y: tableY, gridX, gridY });
            }
        }
    }
    
    // Shuffle positions with seeded randomness for variety
    for (let i = possiblePositions.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(channelSeed + i + 100) * (i + 1));
        [possiblePositions[i], possiblePositions[j]] = [possiblePositions[j], possiblePositions[i]];
    }
    
    // Place as many tables as possible
    for (const pos of possiblePositions) {
        const tableX = pos.x;
        const tableY = pos.y;
        
        // Check if this position conflicts with already placed tables
        let canPlace = true;
        for (let dy = -minSpacing; dy <= minSpacing; dy++) {
            for (let dx = -minSpacing; dx <= minSpacing; dx++) {
                if (usedPositions.has(`${tableX + dx},${tableY + dy}`)) {
                    canPlace = false;
                    break;
                }
            }
            if (!canPlace) break;
        }
        
        if (canPlace) {
            // Mark area as used (3x3 area around table)
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    usedPositions.add(`${tableX + dx},${tableY + dy}`);
                }
            }
            
            // Create chair positions around table
            const chairPositions = [
                [tableX - 1, tableY], // Left
                [tableX + 1, tableY], // Right
                [tableX, tableY - 1], // Top
                [tableX, tableY + 1]  // Bottom
            ];
            
            tableIslands.push({ tableX, tableY, chairPositions });
        }
    }
    
    console.log(`Generated ${tableIslands.length} table islands for ${INN_WIDTH}x${INN_HEIGHT} inn`);
    
    // Place tables and chairs
    for (const island of tableIslands) {
        const { tableX, tableY, chairPositions } = island;
        
        // Check if positions are valid and on floor
        if (tableY >= 1 && tableY < INN_HEIGHT - 1 && 
            tableX >= 1 && tableX < INN_WIDTH - 1 && 
            layout[tableY][tableX] === INN_TILE_TYPES.FLOOR) {
            
            // Place table
            layout[tableY][tableX] = INN_TILE_TYPES.TABLE;
            
            // Place chairs around table
            for (const [chairX, chairY] of chairPositions) {
                if (chairY >= 1 && chairY < INN_HEIGHT - 1 && 
                    chairX >= 1 && chairX < INN_WIDTH - 1 && 
                    layout[chairY][chairX] === INN_TILE_TYPES.FLOOR) {
                    layout[chairY][chairX] = INN_TILE_TYPES.CHAIR;
                }
            }
        }
    }
    
    // Add a random door at the bottom wall connected to an empty floor tile
    // Use channel ID for consistent door placement (channelSeed already defined above)
    
    const bottomWallPositions = [];
    for (let x = 1; x < INN_WIDTH - 1; x++) {
        // Check if this bottom wall position has an empty floor tile above it
        if (layout[INN_HEIGHT - 2][x] === INN_TILE_TYPES.FLOOR) {
            bottomWallPositions.push(x);
        }
    }
    
    if (bottomWallPositions.length > 0) {
        const randomIndex = Math.floor(seededRandom(channelSeed + 1000) * bottomWallPositions.length);
        const randomX = bottomWallPositions[randomIndex];
        layout[INN_HEIGHT - 1][randomX] = INN_TILE_TYPES.DOOR;
    }
    
    return layout;
}

/**
 * Draw floor tile
 */
async function drawFloorTile(ctx, x, y, tileSize, theme) {
    const pixelX = x * tileSize;
    const pixelY = y * tileSize;
    
    // Try to load floor image
    const floorImage = await loadTileImage(theme, 'floor');
    
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
async function drawWallTile(ctx, x, y, floorTileSize, wallTileHeight, theme) {
    const pixelX = x * floorTileSize;
    const wallPixelY = y * floorTileSize - (wallTileHeight - floorTileSize);
    
    // Try to load wall image
    const wallImage = await loadTileImage(theme, 'wall');
    
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
function drawTable(ctx, x, y, tileSize) {
    const pixelX = x * tileSize;
    const pixelY = y * tileSize;
    
    // Table surface
    ctx.fillStyle = INN_TILE_COLORS[INN_TILE_TYPES.TABLE];
    ctx.fillRect(pixelX + 8, pixelY + 8, tileSize - 16, tileSize - 16);
    
    // Table legs (corners)
    ctx.fillStyle = '#4A4A4A';
    const legSize = 6;
    // Top-left leg
    ctx.fillRect(pixelX + 10, pixelY + 10, legSize, legSize);
    // Top-right leg
    ctx.fillRect(pixelX + tileSize - 16, pixelY + 10, legSize, legSize);
    // Bottom-left leg
    ctx.fillRect(pixelX + 10, pixelY + tileSize - 16, legSize, legSize);
    // Bottom-right leg
    ctx.fillRect(pixelX + tileSize - 16, pixelY + tileSize - 16, legSize, legSize);
    
    // Table edge highlight
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.strokeRect(pixelX + 8, pixelY + 8, tileSize - 16, tileSize - 16);
}

/**
 * Draw door
 */
async function drawDoor(ctx, x, y, floorTileSize, wallTileHeight, theme) {
    const pixelX = x * floorTileSize;
    const wallPixelY = y * floorTileSize - (wallTileHeight - floorTileSize);
    
    // Try to load door image
    const doorImage = await loadTileImage(theme, 'door');
    
    if (doorImage) {
        ctx.drawImage(doorImage, pixelX, wallPixelY, floorTileSize, wallTileHeight);
    } else {
        // Programmatic door rendering
        // Door frame
        ctx.fillStyle = '#654321'; // Dark brown frame
        ctx.fillRect(pixelX, wallPixelY, floorTileSize, wallTileHeight);
        
        // Door panels
        ctx.fillStyle = '#8B4513'; // Medium brown door
        const panelWidth = floorTileSize - 8;
        const panelHeight = wallTileHeight - 8;
        ctx.fillRect(pixelX + 4, wallPixelY + 4, panelWidth, panelHeight);
        
        // Door handle
        ctx.fillStyle = '#FFD700'; // Gold handle
        const handleSize = 4;
        const handleX = pixelX + floorTileSize - 12;
        const handleY = wallPixelY + wallTileHeight / 2;
        ctx.fillRect(handleX, handleY, handleSize, handleSize);
        
        // Door panels detail
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 2;
        const upperPanelHeight = panelHeight / 2 - 4;
        const lowerPanelHeight = panelHeight / 2 - 4;
        
        // Upper panel
        ctx.strokeRect(pixelX + 8, wallPixelY + 8, panelWidth - 8, upperPanelHeight);
        // Lower panel
        ctx.strokeRect(pixelX + 8, wallPixelY + 8 + upperPanelHeight + 8, panelWidth - 8, lowerPanelHeight);
    }
}

/**
 * Draw chair
 */
function drawChair(ctx, x, y, tileSize) {
    const pixelX = x * tileSize;
    const pixelY = y * tileSize;
    
    const chairSize = tileSize * 0.6;
    const chairX = pixelX + (tileSize - chairSize) / 2;
    const chairY = pixelY + (tileSize - chairSize) / 2;
    
    // Chair seat
    ctx.fillStyle = INN_TILE_COLORS[INN_TILE_TYPES.CHAIR];
    ctx.fillRect(chairX, chairY, chairSize, chairSize * 0.6);
    
    // Chair back
    ctx.fillRect(chairX, chairY - chairSize * 0.3, chairSize, chairSize * 0.3);
    
    // Chair legs
    ctx.fillStyle = '#654321';
    const legSize = 4;
    // Front legs
    ctx.fillRect(chairX + 2, chairY + chairSize * 0.6, legSize, chairSize * 0.4);
    ctx.fillRect(chairX + chairSize - 6, chairY + chairSize * 0.6, legSize, chairSize * 0.4);
    // Back legs
    ctx.fillRect(chairX + 2, chairY - chairSize * 0.1, legSize, chairSize * 0.7);
    ctx.fillRect(chairX + chairSize - 6, chairY - chairSize * 0.1, legSize, chairSize * 0.7);
}

/**
 * Draw floor layer
 */
async function drawFloorLayer(ctx, layout, tileSize, theme) {
    const INN_HEIGHT = layout.length;
    const INN_WIDTH = layout[0] ? layout[0].length : 0;
    
    for (let y = 0; y < INN_HEIGHT; y++) {
        for (let x = 0; x < INN_WIDTH; x++) {
            const tileType = layout[y][x];
            
            // Draw floor under everything except walls
            if (tileType !== INN_TILE_TYPES.WALL) {
                await drawFloorTile(ctx, x, y, tileSize, theme);
            }
        }
    }
}

/**
 * Draw midground layer (walls, furniture, players)
 */
async function drawMidgroundLayer(ctx, layout, floorTileSize, wallTileHeight, theme, members = [], playerPositions = {}) {
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
            } else if (tileType === INN_TILE_TYPES.DOOR) {
                midgroundObjects.push({ type: 'door', x, y, renderY });
            } else if (tileType === INN_TILE_TYPES.TABLE) {
                midgroundObjects.push({ type: 'table', x, y, renderY });
            } else if (tileType === INN_TILE_TYPES.CHAIR) {
                midgroundObjects.push({ type: 'chair', x, y, renderY });
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
                await drawWallTile(ctx, obj.x, obj.y, floorTileSize, wallTileHeight, theme);
                break;
            case 'door':
                await drawDoor(ctx, obj.x, obj.y, floorTileSize, wallTileHeight, theme);
                break;
            case 'table':
                drawTable(ctx, obj.x, obj.y, floorTileSize);
                break;
            case 'chair':
                drawChair(ctx, obj.x, obj.y, floorTileSize);
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
async function generateInnMapImage(channel, members = [], playerPositions = {}, innDimensions = null) {
    const startTime = Date.now();
    
    // Input validation
    if (!channel?.id) {
        throw new Error('Channel ID is required');
    }
    
    // Use provided dimensions or defaults
    const INN_WIDTH = innDimensions?.width || DEFAULT_INN_WIDTH;
    const INN_HEIGHT = innDimensions?.height || DEFAULT_INN_HEIGHT;
    
    // Generate inn layout with channel ID and dimensions for consistency
    const layout = generateInnLayout(channel.id, { width: INN_WIDTH, height: INN_HEIGHT });
    
    // Use a warm, tavern-like theme - we'll use generic/coalMine as base
    const theme = 'coalMine'; // Warm brown tones suitable for inn
    
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
        await drawFloorLayer(ctx, layout, FLOOR_TILE_SIZE, theme);
        
        // === LAYER 2: MIDGROUND LAYER ===
        await drawMidgroundLayer(ctx, layout, FLOOR_TILE_SIZE, WALL_TILE_HEIGHT, theme, members, playerPositions);
        
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
    console.log(`[INN_RENDER] Generated inn map in ${totalTime}ms`);
    
    return canvas.toBuffer('image/png', { compressionLevel: 9 });
}

module.exports = {
    generateInnMapImage,
    generateInnLayout,
    DEFAULT_INN_WIDTH,
    DEFAULT_INN_HEIGHT,
    INN_TILE_TYPES
};
