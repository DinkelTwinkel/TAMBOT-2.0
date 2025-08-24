# Hazard Scanner System Documentation

## Overview
The Hazard Scanner is a geological anomaly detection system that replaces the mystical hazard detection with a more technical, industrial approach while maintaining an element of cryptic mystery.

## Features

### 1. **Geological Profiles**
Each server from `gachaServers.json` has a unique geological profile including:
- **Rock Hardness**: Percentage of reinforced walls (15% - 75%)
- **Ore Richness**: Description of mineral density
- **Geological Type**: Rock formation types
- **Seismic Activity**: Structural stability indicators
- **Gas Presence**: Specific gas concentrations with percentages
- **Depth Indicator**: Visual representation using ◈ and ◇ symbols

### 2. **Technical Hazard Codes**
Hazards are categorized with industrial codes:

#### Structural Hazards
- `RKF-XX`: Rock Fall hazards
- `COL-XX`: Collapse zones
- `FSR-XX`: Fissure networks
- `TEC-XX`: Tectonic activity
- `MAG-XX`: Magnetic anomalies
- `DIM-XX`: Dimensional rifts
- `GRV-XX`: Gravitational anomalies
- `VOL-XX`: Volcanic activity
- `APO-XX`: Apocalyptic structural failures
- `BLK-XX`: Black hole formations
- `OBL-XX`: Matter dissolution

#### Environmental Hazards
- `GAS-XX`: Gas accumulations
- `TMP-XX`: Temperature variances
- `EXP-XX`: Explosive zones
- `ANM-XX`: Anomalies
- `BIO-XX`: Biological hazards
- `RAD-XX`: Radiation zones
- `PSY-XX`: Psychological hazards
- `CHR-XX`: Chronological distortions
- `VOI-XX`: Void zones
- `WTR-XX`: Water hazards
- `END-XX`: Entropic cascades
- `NUC-XX`: Nuclear decay
- `COS-XX`: Cosmic horrors
- `REA-XX`: Reality failures

#### Resource Indicators
- `RES-XX`: Resource bonuses (marked as BONUS severity)

### 3. **Severity Levels**
- `LOW`: Minor inconvenience
- `MED`: Moderate danger
- `HIGH`: Significant threat
- `SEVERE`: Major danger
- `CRITICAL`: Extreme threat
- `EXTREME`: Near-catastrophic
- `APOCALYPTIC`: Reality-ending danger
- `BONUS`: Positive resource indicator

### 4. **Power Level Scaling**

| Power Level | Rock Hardness | Hazard Frequency | Threat Color |
|------------|---------------|------------------|--------------|
| 1 | 15% | Minimal | Green |
| 2 | 22% | Low | Yellow-Green |
| 3 | 28-30% | Moderate | Yellow |
| 4 | 35-42% | Moderate-High | Gold |
| 5 | 45-50% | High | Dark Orange |
| 6 | 60-65% | Extreme (3x) | Orange-Red |
| 7 | 75% | Apocalyptic (5x) | Red |

### 5. **Scan Report Format**
The scan generates a technical report including:
- Scan ID with timestamp
- Rock analysis with hardness percentage
- Ore detection and distribution
- Environmental conditions
- Anomaly frequency statistics
- Categorized hazard listings
- Threat assessment with warnings

## Usage

### Import the Scanner
```javascript
const { performGeologicalScan } = require('./mining/hazards/hazardScanner');
```

### Perform a Scan
```javascript
// In your mining event handler
await performGeologicalScan(channel, dbEntry, powerLevel, serverName);
```

### Parameters
- `channel`: Discord voice channel object
- `dbEntry`: Database entry for the channel
- `powerLevel`: Server power level (1-7)
- `serverName`: Name of the server from gachaServers.json

### Return Value
Returns an object containing:
- `embed`: The Discord embed with the scan report
- `scanId`: Unique scan identifier
- `hazardSeed`: Random seed for hazard generation
- `geologicalProfile`: Server's geological data

## Integration with Main Mining System

The hazard scanner integrates seamlessly with the existing mining system:

1. **One-time Scan**: Performed once per mining session
2. **Data Storage**: Saves scan results to database
3. **Visual Feedback**: Sends formatted embed to channel
4. **Power Scaling**: Automatically adjusts based on server power
5. **Server Recognition**: Maps server names to geological profiles

## Example Output

```
⚡ GEOLOGICAL SCAN REPORT - Diamond Mines
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scan ID: SCAN-1234567890-5678
Depth Level: 4
Timestamp: 2024-01-15T10:30:00.000Z

🪨 ROCK ANALYSIS
Hardness: 45% reinforced
Type: Kimberlite pipes detected
Integrity: 55% standard

💎 ORE DETECTION
High-pressure carbon deposits
Distribution: 6-10 tiles
Quality: Level 4 materials

🌡️ ENVIRONMENTAL
Hydrogen sulfide: 11.3%
Significant tectonic stress
Depth: ◈◈◈◈◇◇◇

⚠️ ANOMALY FREQUENCY
Probability: 20%
Density: MODERATE - Periodic encounters
Expected: 6-10 tiles between events

🏗️ STRUCTURAL HAZARDS
[COL-02] Cascading collapse zones (SEVERE)
[TEC-01] Tectonic shift activity (SEVERE)

☢️ ENVIRONMENTAL HAZARDS
[EXP-02] Chain reaction volatiles (SEVERE)
[BIO-01] Hostile organisms detected (SEVERE)

📦 RESOURCE OPPORTUNITIES
[RES-04] Ancient cache located

📊 THREAT ASSESSMENT
⚠️ CAUTION: Unstable conditions detected. Standard safety measures advised.
```

## Migration from Old System

The old mystical hazard system functions have been deprecated:
- `performInitialHazardRoll()` → `performGeologicalScan()`
- `getAllPossibleHazards()` → Deprecated
- `getCrypticHazardDescriptions()` → Replaced with `getTechnicalHazards()`

## Testing

Run the test suite to verify functionality:
```javascript
node testHazardScanner.js
```

## Future Enhancements

Potential improvements:
1. Dynamic hazard generation based on mining progress
2. Player equipment affecting hazard resistance
3. Hazard mitigation strategies
4. Real-time hazard warnings during mining
5. Integration with unique item bonuses for hazard detection
