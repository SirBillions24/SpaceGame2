# Espionage System Implementation Guide

This document outlines the architecture and mechanics of the Reconnaissance Probe system in OldSchoolEmpire.

## 1. Core Architecture

The system follows a modular Service-Route-Prisma pattern:
- **Prisma Schema**: `ReconProbe` model tracks location, status, accuracy, and discovery risk.
- **Service**: `server/src/services/espionageService.ts` contains the heavy lifting (accuracy math, discovery rolls, retreat logic).
- **Constants**: `server/src/constants/espionageData.ts` defines probe types and their modular stats.
- **Worker**: `server/src/services/timerWorker.ts` polls `updateProbes()` every minute to process real-time events.

## 2. Capacity & Scaling
The number of probes a player can control is **modular and scales with building progression**:
- **Formula**: `Total Probe Capacity = Sum of all Intelligence Hub levels`.
- **Slot Locking**: Probes in `traveling`, `active`, `returning`, and `cooldown` states all occupy a slot.
- **Implementation**: Handled in `launchProbe` via a dynamic query of the player's active `tavern` buildings.

## 3. Mission Phases

### Phase A: Deployment
- **Launch**: Initiated from the Global HUD (bottom-right).
- **Travel**: Calculated using Euclidean distance. Status is `traveling` until `arrivalTime`.

### Phase B: Information Relay (Active)
- **Signal Integrity (Accuracy)**: Increases linearly every minute (`accuracyGainPerMinute`).
- **Data Fuzzing**: Information displayed to the player is "fuzzed" based on accuracy.
    - *Low Accuracy*: Large ranges (e.g., "Rangers: 0 - 100").
    - *High Accuracy*: Precise counts (at 100%, exact numbers are revealed).
- **Empty Colonies**: A colony with 0 units still shows a range at low accuracy to maintain uncertainty.

### Phase C: Discovery Risk
- **Accumulation**: `discoveryChance` increases every minute while `active`.
- **Detection Roll**: A background RNG roll is performed every minute against the current `discoveryChance`.

## 4. Compromised Missions (Discovery)
When a probe is discovered, the following happens automatically:
1. **Forced Retreat**: Status flips to `returning`.
2. **Speed Penalty**: Return speed is reduced by 50% (2x travel time).
3. **Victim Alert**: All players within the scan radius receive an `InboxMessage` naming the spy.
4. **Maintenance Cooldown**: Upon arrival at the home colony, the probe enters a **30-minute cooldown** before the slot is freed.

## 5. Intelligence Persistence
- **Live Feed**: Active probes provide a live data stream in the Intelligence Hub panel.
- **Permanent Reports**: Players can click "Generate Permanent Report" to save a snapshot of the current intel to their **Mailbox** for future reference.

## 6. Modular Expansion
To add new probe types, simply add an entry to `ESPIONAGE_DATA` in `server/src/constants/espionageData.ts`. The system will automatically handle the new stats without further code changes.

