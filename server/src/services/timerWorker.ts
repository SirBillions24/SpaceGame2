import prisma from '../lib/prisma';
import { resolveCombat } from './combatService';
import { syncPlanetResources } from './planetService';
import { updateProbes } from './espionageService';
import { relocateNpc } from './pveService';

const CHECK_INTERVAL = 5000; // Check every 5 seconds

/**
 * Process fleets that have arrived
 */
async function processArrivedFleets() {
  try {
    const now = new Date();

    // 0. Update Espionage Probes
    await updateProbes();

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
          await prisma.$transaction(async (tx) => {
            // ATOMIC CHECK: Ensure fleet is still in 'returning' status
            // Use updateMany with where to ensure we only process once
            const updated = await tx.fleet.updateMany({
              where: { id: fleet.id, status: 'returning' },
              data: { status: 'completed' }
            });

            // If updated.count is 0, someone else processed it already
            if (updated.count === 0) return;

            const loot = typeof fleet.cargoJson === 'string' ? JSON.parse(fleet.cargoJson) : fleet.cargoJson;
            if (loot) {
              await tx.planet.update({
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
              await tx.planetUnit.upsert({
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
          // Resolve combat (This function now handles losses and tool deduction internally)
          const combatResult = await resolveCombat(fleet.id);

          // Handle NPC attack count and relocation
          const targetPlanet = await prisma.planet.findUnique({ where: { id: fleet.toPlanetId } });
          if (targetPlanet && targetPlanet.isNpc) {
            const updatedNpc = await prisma.planet.update({
              where: { id: targetPlanet.id },
              data: { attackCount: { increment: 1 } }
            });

            if (updatedNpc.attackCount >= (updatedNpc.maxAttacks || 15)) {
              await relocateNpc(updatedNpc.id);
            }
          }

          // Handle Loot - use transaction for atomic check + deduction
          let resourcesJson = null;
          if (combatResult.resourcesJson) {
            const requestedLoot = JSON.parse(combatResult.resourcesJson);

            // Atomic loot deduction to prevent over-looting from parallel fleet arrivals
            const actualLoot = await prisma.$transaction(async (tx) => {
              const targetPlanet = await tx.planet.findUnique({ where: { id: fleet.toPlanetId } });
              if (!targetPlanet) return { carbon: 0, titanium: 0, food: 0 };

              // Cap loot to what's actually available
              const loot = {
                carbon: Math.min(Math.max(0, requestedLoot.carbon), targetPlanet.carbon),
                titanium: Math.min(Math.max(0, requestedLoot.titanium), targetPlanet.titanium),
                food: Math.min(Math.max(0, requestedLoot.food), targetPlanet.food),
              };

              // Atomic deduction
              await tx.planet.update({
                where: { id: fleet.toPlanetId },
                data: {
                  carbon: { decrement: loot.carbon },
                  titanium: { decrement: loot.titanium },
                  food: { decrement: loot.food }
                }
              });

              return loot;
            });

            resourcesJson = JSON.stringify(actualLoot);
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
      } catch (error: any) {
        console.error(`CRITICAL: Error processing fleet ${fleet.id} (Type: ${fleet.type}, Status: ${fleet.status}):`, error);
        // Mark as error but don't crash the worker
        await prisma.fleet.update({
          where: { id: fleet.id },
          data: { status: 'error' },
        }).catch(err => console.error(`Failed to update fleet ${fleet.id} to error state:`, err));
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

