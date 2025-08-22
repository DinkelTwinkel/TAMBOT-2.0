// Test file for the rail building event
// This file can be used to test the rail building functionality

const { startRailBuildingEvent } = require('../patterns/gachaModes/mining/miningEvents');

// Mock objects for testing
const mockChannel = {
    isVoiceBased: () => true,
    id: 'test-channel-123',
    members: new Map([
        ['player1', { id: 'player1', user: { bot: false }, displayName: 'Player1' }],
        ['player2', { id: 'player2', user: { bot: false }, displayName: 'Player2' }],
        ['player3', { id: 'player3', user: { bot: false }, displayName: 'Player3' }]
    ]),
    send: async (message) => {
        console.log('Channel message:', message);
        return { id: 'message-id' };
    }
};

const mockDbEntry = {
    channelId: 'test-channel-123',
    gameData: {
        map: {
            width: 20,
            height: 20,
            entranceX: 10,
            entranceY: 10,
            tiles: generateMockTiles(20, 20),
            playerPositions: {
                'player1': { x: 15, y: 15 },  // Far from entrance
                'player2': { x: 8, y: 8 },     // Close to entrance
                'player3': { x: 18, y: 12 }    // Medium distance
            }
        }
    }
};

// Helper function to generate mock tiles
function generateMockTiles(width, height) {
    const tiles = [];
    for (let y = 0; y < height; y++) {
        tiles[y] = [];
        for (let x = 0; x < width; x++) {
            // Entrance at (10, 10)
            if (x === 10 && y === 10) {
                tiles[y][x] = { type: 'entrance', discovered: true };
            } else {
                // Random floor/wall tiles
                tiles[y][x] = { 
                    type: Math.random() > 0.3 ? 'floor' : 'wall', 
                    discovered: Math.random() > 0.5 
                };
            }
        }
    }
    return tiles;
}

// Mock the logEvent function
global.logEvent = async (channel, message) => {
    console.log('[LOG EVENT]', message);
};

// Run the test
async function testRailBuildingEvent() {
    console.log('Testing Rail Building Event...\n');
    console.log('Mock setup:');
    console.log('- 3 players in channel');
    console.log('- Map size: 20x20');
    console.log('- Entrance at (10, 10)');
    console.log('- Player positions:', mockDbEntry.gameData.map.playerPositions);
    console.log('\n');
    
    try {
        const result = await startRailBuildingEvent(mockChannel, mockDbEntry);
        console.log('\nResult:', result);
        console.log('\nTest completed successfully!');
    } catch (error) {
        console.error('\nTest failed:', error);
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    testRailBuildingEvent();
}

module.exports = { testRailBuildingEvent };
