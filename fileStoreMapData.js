const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

/**
 * Recursively scans ./assets folder for image files containing 'map' in the name
 * and finds all magenta pixels (r255, g0, b255), storing results in JSON
 */
async function scanMagentaPixels() {
    const assetsDir = './assets';
    const outputFile = './data/mapData.json';
    
    try {
        // Check if assets directory exists
        await fs.access(assetsDir);
    } catch (error) {
        console.error('❌ ./assets directory not found');
        return;
    }

    console.log('🔍 Starting magenta pixel scan...');
    
    let existingData = {};
    
    // Load existing JSON data if it exists
    try {
        const existingJson = await fs.readFile(outputFile, 'utf8');
        existingData = JSON.parse(existingJson);
        console.log('📁 Loaded existing magenta-pixels.json');
    } catch (error) {
        console.log('📁 Creating new magenta-pixels.json');
    }

    // Find all image files ending with '_map' before extension
    const imageFiles = await findMapImages(assetsDir);
    console.log(`📸 Found ${imageFiles.length} image files ending with '_map'`);

    // Process each image
    for (const imagePath of imageFiles) {
        try {
            console.log(`🔎 Scanning: ${imagePath}`);
            const magentaPixels = await findMagentaPixels(imagePath);
            
            // Store results using just the filename as key
            const fileName = path.basename(imagePath);
            existingData[fileName] = {
                lastScanned: new Date().toISOString(),
                pixelCount: magentaPixels.length,
                coordinates: magentaPixels
            };
            
            console.log(`✅ Found ${magentaPixels.length} magenta pixels in ${path.basename(imagePath)}`);
            
        } catch (error) {
            console.error(`❌ Error processing ${imagePath}:`, error.message);
            existingData[fileName] = {
                lastScanned: new Date().toISOString(),
                error: error.message,
                pixelCount: 0,
                coordinates: []
            };
        }
    }

    // Save updated data to JSON file
    try {
        await fs.writeFile(outputFile, JSON.stringify(existingData, null, 2));
        console.log(`💾 Results saved to ${outputFile}`);
        
        // Print summary
        const totalPixels = Object.values(existingData)
            .reduce((sum, data) => sum + (data.pixelCount || 0), 0);
        console.log(`📊 Summary: ${imageFiles.length} images processed, ${totalPixels} total magenta pixels found`);
        
    } catch (error) {
        console.error('❌ Failed to save JSON file:', error);
    }
}

/**
 * Recursively finds all image files ending with '_map' before the extension
 */
async function findMapImages(dir) {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff'];
    const imageFiles = [];

    async function scanDirectory(currentDir) {
        try {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                
                if (entry.isDirectory()) {
                    // Recursively scan subdirectories
                    await scanDirectory(fullPath);
                } else if (entry.isFile()) {
                    // Check if file is an image and ends with '_map' before extension
                    const ext = path.extname(entry.name).toLowerCase();
                    const nameWithoutExt = path.basename(entry.name, ext).toLowerCase();
                    
                    if (imageExtensions.includes(ext) && nameWithoutExt.endsWith('_map')) {
                        imageFiles.push(fullPath);
                    }
                }
            }
        } catch (error) {
            console.warn(`⚠️ Could not scan directory ${currentDir}: ${error.message}`);
        }
    }

    await scanDirectory(dir);
    return imageFiles;
}

/**
 * Finds all magenta pixels (r255, g0, b255) in an image
 */
async function findMagentaPixels(imagePath) {
    const image = sharp(imagePath);
    const { data, info } = await image
        .ensureAlpha() // Ensure we have alpha channel
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const magentaPixels = [];

    // Scan through all pixels
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixelIndex = (y * width + x) * channels;
            const r = data[pixelIndex];
            const g = data[pixelIndex + 1];
            const b = data[pixelIndex + 2];
            
            // Check if pixel is magenta (r255, g0, b255)
            if (r === 255 && g === 0 && b === 255) {
                magentaPixels.push({ x, y });
            }
        }
    }

    return magentaPixels;
}

module.exports = scanMagentaPixels;

/**
 * Helper function to retrieve magenta pixel coordinates for a specific file
 * @param {string} fileName - The image file name (e.g., 'world_map.png')
 * @returns {Array} Array of coordinate objects {x, y} or empty array if not found
 */
async function getMagentaCoordinates(fileName) {
    const outputFile = './data/mapData.json';
    
    try {
        const jsonData = await fs.readFile(outputFile, 'utf8');
        const data = JSON.parse(jsonData);
        
        if (data[fileName] && data[fileName].coordinates) {
            return data[fileName].coordinates;
        } else {
            console.log(`No magenta pixel data found for ${fileName}`);
            return [];
        }
    } catch (error) {
        console.error('Error reading magenta pixel data:', error.message);
        return [];
    }
}

// Export both functions
module.exports = {
    scanMagentaPixels,
    getMagentaCoordinates
};

// Example usage:
// const { scanMagentaPixels, getMagentaCoordinates } = require('./path/to/this/file');
// 
// // Scan for magenta pixels
// await scanMagentaPixels();
// 
// // Retrieve coordinates for a specific file
// const coordinates = await getMagentaCoordinates('world_map.png');
// console.log(coordinates); // [{x: 100, y: 200}, {x: 150, y: 250}, ...]