import { z } from 'zod';

// ============================================
// Fleet Dispatch Schemas
// ============================================

const UnitCountsSchema = z.record(z.string(), z.number().int().nonnegative());

const WaveSchema = z.object({
    units: UnitCountsSchema,
    tools: z.record(z.string(), z.number().int().nonnegative()).optional()
});

const LaneAssignmentsSchema = z.object({
    front: z.array(WaveSchema).optional(),
    left: z.array(WaveSchema).optional(),
    right: z.array(WaveSchema).optional()
}).optional();

export const FleetDispatchSchema = z.object({
    fromPlanetId: z.string().uuid(),
    toPlanetId: z.string().uuid(),
    type: z.enum(['attack', 'support', 'scout']),
    units: UnitCountsSchema,
    laneAssignments: LaneAssignmentsSchema,
    admiralId: z.string().uuid().optional()
});

export type FleetDispatchInput = z.infer<typeof FleetDispatchSchema>;

// ============================================
// Build Schemas
// ============================================

export const BuildSchema = z.object({
    planetId: z.string().uuid(),
    buildingType: z.string().min(1),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative()
});

export type BuildInput = z.infer<typeof BuildSchema>;

// ============================================
// Recruit Schemas
// ============================================

export const RecruitSchema = z.object({
    planetId: z.string().uuid(),
    unitType: z.string().min(1),
    count: z.number().int().positive()
});

export type RecruitInput = z.infer<typeof RecruitSchema>;

// ============================================
// Manufacture Schemas
// ============================================

export const ManufactureSchema = z.object({
    planetId: z.string().uuid(),
    toolType: z.string().min(1),
    count: z.number().int().positive()
});

export type ManufactureInput = z.infer<typeof ManufactureSchema>;

// ============================================
// Expand Schemas
// ============================================

export const ExpandSchema = z.object({
    planetId: z.string().uuid(),
    direction: z.enum(['x', 'y'])
});

export type ExpandInput = z.infer<typeof ExpandSchema>;

// ============================================
// Defense Turret Schemas
// ============================================

export const DefenseTurretSchema = z.object({
    planetId: z.string().uuid(),
    level: z.number().int().min(1).max(4)
});

export type DefenseTurretInput = z.infer<typeof DefenseTurretSchema>;

// ============================================
// Tax Rate Schemas
// ============================================

export const TaxRateSchema = z.object({
    planetId: z.string().uuid(),
    taxRate: z.number().int().min(0).max(100)
});

export type TaxRateInput = z.infer<typeof TaxRateSchema>;

// ============================================
// Move Building Schemas
// ============================================

export const MoveBuildingSchema = z.object({
    planetId: z.string().uuid(),
    buildingId: z.string().uuid(),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative()
});

export type MoveBuildingInput = z.infer<typeof MoveBuildingSchema>;

// ============================================
// Demolish Schemas
// ============================================

export const DemolishSchema = z.object({
    planetId: z.string().uuid(),
    buildingId: z.string().uuid()
});

export type DemolishInput = z.infer<typeof DemolishSchema>;
