# Admiral System Setup Guide

## Requirements

To use the Admiral system, you need:

1. **Naval Academy Building**: Build a Naval Academy on your planet
   - Cost: 500 Carbon, 500 Titanium
   - Size: 3x3 tiles
   - Must be active (not constructing/upgrading)

## How to Use

### Step 1: Build Naval Academy
1. Open your planet (click on your planet on the map)
2. Click "Build" and select "Naval Academy"
3. Place it on your planet grid
4. Wait for construction to complete

### Step 2: Access Admiral Command
1. Once Naval Academy is built and active
2. Click "Admiral Command" button in the Military Operations section
3. Your admiral will be automatically created if it doesn't exist

### Step 3: Customize Your Admiral
- **Name**: Click "Edit" next to the admiral name to change it
- **Gear**: Gear management will be available in future updates
- **Bonuses**: Attack and Defense bonuses are calculated from equipped gear

## Troubleshooting

### "Failed to load admiral" Error

If you see this error, check:

1. **Server is running**: Make sure the backend server is running
2. **You're logged in**: Ensure you have a valid authentication token
3. **Database connection**: The server needs to connect to PostgreSQL
4. **Naval Academy exists**: You should have at least one active Naval Academy

### Admiral Not Created

The admiral should be auto-created when you first access the Admiral Command panel. If it's not working:

1. Check server logs for errors
2. Verify database connection
3. Try refreshing the page and clicking "Admiral Command" again

## Using Admirals in Combat

### Assigning Admiral to Fleet

1. **Attack Fleets**: 
   - Open Fleet Ops on a target planet
   - Select "ATTACK" mode
   - Use the Admiral dropdown in the Attack Planner header
   - Select your admiral (or "None" to remove)

2. **Support Fleets**:
   - Open Fleet Ops on a target planet
   - Select "SUPPORT" mode
   - Use the Admiral selector below the fleet type buttons
   - Your admiral's bonuses will apply to the supported planet

### Combat Bonuses

- **Attack Bonus**: Increases your fleet's attack power by the percentage shown
- **Defense Bonus**: Increases your fleet's defense power by the percentage shown
- Bonuses are applied to all combat phases (lane battles and surface invasion)

## Notes

- Each user has one admiral (shared across all planets)
- Admirals can be assigned to multiple fleets simultaneously
- Bonuses stack with other combat modifiers (tools, buildings, etc.)
- Gear system will be expanded in future updates





