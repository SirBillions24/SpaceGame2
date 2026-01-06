import prisma from '../lib/prisma';
import { resolveCombat } from './combatService';
import { syncPlanetResources } from './planetService';

const CHECK_INTERVAL = 5000; // Check every 5 seconds

/**
 * Process fleets that have arrived
 */
async function processArrivedFleets() {
  try {
    const now = new Date();

    // Find all fleets that should have arrived
    const arrivedFleets = await prisma.fleet.findMany({
      where: {
        status: { in: ['enroute', 'returning'] },
        arriveAt: {
          lte: now,
        },
      },
      include: {
        toPlanet: true,
      },
    });

    for (const fleet of arrivedFleets) {
      try {
        // Handle Returning Fleets
        if (fleet.status === 'returning') {
          // Fleet returned home. Unload cargo and disband/park units.
          // 1. Unload Cargo
          if (fleet.cargoJson) {
            const loot = JSON.parse(fleet.cargoJson);
            await prisma.planet.update({
              where: { id: fleet.fromPlanetId },
              data: {
                carbon: { increment: loot.carbon || 0 },
                titanium: { increment: loot.titanium || 0 },
                food: { increment: loot.food || 0 }
              }
            });
          }

          // 2. Add units back to the home planet
          const units = JSON.parse(fleet.unitsJson);
          for (const [unitType, count] of Object.entries(units)) {
            await prisma.planetUnit.upsert({
              where: {
                planetId_unitType: {
                  planetId: fleet.fromPlanetId,
                  unitType: unitType as string,
                },
              },
              update: {
                count: {
                  increment: count as number,
                },
              },
              create: {
                planetId: fleet.fromPlanetId,
                unitType: unitType as string,
                count: count as number,
              },
            });
          }

          // 3. Mark fleet as completed
          await prisma.fleet.update({
            where: { id: fleet.id },
            data: { status: 'completed' },
          });
          continue; // Done with this fleet
        }

        // Handle Enroute Fleets (Arrival at Target)

        // Mark as arrived first (transient state, though we might process immediately)
        // If we fail mid-process, it might stay 'arrived'. Ideally we should use transactions or 'processing' state.
        // For MVP, keep as is.
        await prisma.fleet.update({
          where: { id: fleet.id },
          data: { status: 'arrived' },
        });

        // Sync resources for the target planet to ensure up-to-date state
        await syncPlanetResources(fleet.toPlanetId);

        if (fleet.type === 'attack') {
          // Resolve combat
          const combatResult = await resolveCombat(fleet.id);

          // Apply losses to defender
          for (const [unitType, lossCount] of Object.entries(combatResult.defenderTotalLosses)) {
            await prisma.planetUnit.updateMany({
              where: {
                planetId: fleet.toPlanetId,
                unitType,
              },
              data: {
                count: {
                  decrement: lossCount as number,
                },
              },
            });
          }


          // --- FIX: Remove losses from Defense Layout to prevent ghost troops ---
          const defenseLayout = await prisma.defenseLayout.findUnique({
            where: { planetId: fleet.toPlanetId }
          });

          if (defenseLayout) {
            const front = JSON.parse(defenseLayout.frontLaneJson);
            const left = JSON.parse(defenseLayout.leftLaneJson);
            const right = JSON.parse(defenseLayout.rightLaneJson);

            // Helper to apply losses to a lane
            const applyLaneLosses = (laneUnits: any, losses: any) => {
              for (const [u, loss] of Object.entries(losses)) {
                if (laneUnits[u]) {
                  laneUnits[u] = Math.max(0, laneUnits[u] - (loss as number));
                }
              }
            };

            applyLaneLosses(front, combatResult.sectorResults.center.defenderLosses);
            applyLaneLosses(left, combatResult.sectorResults.left.defenderLosses);
            applyLaneLosses(right, combatResult.sectorResults.right.defenderLosses);

            // What about Courtyard losses?
            // If we implement Courtney logic fully, we'd deduct here too. 
            // For now, lane losses are the primary source of defense depletion.
            // (Courtyard defenders are currently dynamic/unassigned in combatService, so no persistent slot to update yet)

            await prisma.defenseLayout.update({
              where: { id: defenseLayout.id },
              data: {
                frontLaneJson: JSON.stringify(front),
                leftLaneJson: JSON.stringify(left),
                rightLaneJson: JSON.stringify(right)
              }
            });
          }
          // -------------------------------------------------------------------

          // Handle Loot
          let resourcesJson = null;
          if (combatResult.resourcesJson) {
            resourcesJson = combatResult.resourcesJson;
            const loot = JSON.parse(combatResult.resourcesJson);
            // Deduct from defender
            await prisma.planet.update({
              where: { id: fleet.toPlanetId },
              data: {
                carbon: { decrement: loot.carbon },
                titanium: { decrement: loot.titanium },
                food: { decrement: loot.food }
              }
            });
          }

          // Create battle report
          await prisma.battleReport.create({
            data: {
              fleetId: fleet.id,
              attackerId: fleet.ownerId,
              defenderId: fleet.toPlanet.ownerId,
              attackerPlanetId: fleet.fromPlanetId,
              defenderPlanetId: fleet.toPlanetId,
              winner: combatResult.winner,
              laneResultsJson: JSON.stringify({
                sectors: combatResult.sectorResults,
                surface: combatResult.surfaceResult,
                admirals: {
                  attacker: combatResult.attackerAdmiral,
                  defender: combatResult.defenderAdmiral
                }
              }), // Storing extended result with admiral info
              attackerTotalLossesJson: JSON.stringify(combatResult.attackerTotalLosses),
              defenderTotalLossesJson: JSON.stringify(combatResult.defenderTotalLosses),
              resourcesJson: resourcesJson
            },
          });

          // Process Attacker Casualties & Return Trip
          const initialUnits = JSON.parse(fleet.unitsJson);
          const survivingUnits: Record<string, number> = {};
          let totalSurvivors = 0;

          for (const [u, count] of Object.entries(initialUnits)) {
            const loss = combatResult.attackerTotalLosses[u] || 0;
            const survivors = Math.max(0, (count as number) - loss);
            if (survivors > 0) {
              survivingUnits[u] = survivors;
              totalSurvivors += survivors;
            }
          }

          if (totalSurvivors > 0) {
            // Send fleet back
            // Calculate return time (same as arrival time diff?)
            // For simplicity, just use current time + (arriveAt - departAt)?
            // Or just reverse?
            const originalDuration = fleet.arriveAt.getTime() - fleet.departAt.getTime();
            const returnArrival = new Date(now.getTime() + originalDuration);

            await prisma.fleet.update({
              where: { id: fleet.id },
              data: {
                status: 'returning',
                unitsJson: JSON.stringify(survivingUnits),
                departAt: now,
                arriveAt: returnArrival,
                cargoJson: resourcesJson // Save loot
              }
            });
          } else {
            // All died
            await prisma.fleet.update({
              where: { id: fleet.id },
              data: { status: 'destroyed' } // 'resolved' or 'destroyed'
            });
          }
        } else if (fleet.type === 'support') {
          // Add units to target planet
          const units = JSON.parse(fleet.unitsJson);
          for (const [unitType, count] of Object.entries(units)) {
            await prisma.planetUnit.upsert({
              where: {
                planetId_unitType: {
                  planetId: fleet.toPlanetId,
                  unitType: unitType as string,
                },
              },
              update: {
                count: {
                  increment: count as number,
                },
              },
              create: {
                planetId: fleet.toPlanetId,
                unitType: unitType as string,
                count: count as number,
              },
            });
          }

          await prisma.fleet.update({
            where: { id: fleet.id },
            data: { status: 'completed' },
          });
        } else if (fleet.type === 'scout') {
          // Just mark as completed (scouting reports can be added later)
          await prisma.fleet.update({
            where: { id: fleet.id },
            data: { status: 'completed' },
          });
        }
      } catch (error) {
        console.error(`Error processing fleet ${fleet.id}:`, error);
        // Mark as error but don't crash the worker
        await prisma.fleet.update({
          where: { id: fleet.id },
          data: { status: 'error' }, // STOP the loop. Do not retry indefinitely.
        });
      }
    }
  } catch (error) {
    console.error('Error in timer worker:', error);
  }
}

/**
 * Start the timer worker
 */
export function startTimerWorker() {
  console.log('⏰ Timer worker started - checking for arrived fleets every', CHECK_INTERVAL, 'ms');

  // Process immediately on start
  processArrivedFleets();

  // Then process every interval
  setInterval(processArrivedFleets, CHECK_INTERVAL);
}

