import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const tests = [
    { name: 'Defense Turrets', file: 'verifyDefenseTurrets.ts' },
    { name: 'Planet Expansion', file: 'verifyPlanetExpansion.ts' },
    { name: 'Defense Capacity', file: 'verifyDefenseCapacity.ts' },
    { name: 'Regression Tests', file: 'verifyRegression.ts' },
    { name: 'Economy (Existing)', file: 'verifyEconomy.ts' },
    { name: 'Tools (Existing)', file: 'verifyTools.ts' }
];

async function runTest(testName: string, testFile: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${testName}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
        const { stdout, stderr } = await execAsync(
            `npx tsx src/scripts/${testFile}`,
            { cwd: process.cwd() }
        );
        
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
        
        console.log(`\n✅ ${testName} PASSED\n`);
        return true;
    } catch (error: any) {
        console.error(`\n❌ ${testName} FAILED\n`);
        if (error.stdout) console.error(error.stdout);
        if (error.stderr) console.error(error.stderr);
        return false;
    }
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     Galactic Conquest - Comprehensive Test Suite       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    const results: { name: string; passed: boolean }[] = [];

    for (const test of tests) {
        const passed = await runTest(test.name, test.file);
        results.push({ name: test.name, passed });
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60) + '\n');

    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    results.forEach(result => {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`${status} - ${result.name}`);
    });

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Total: ${passed}/${total} tests passed`);
    
    if (passed === total) {
        console.log('🎉 All tests passed!');
        process.exit(0);
    } else {
        console.log('⚠️  Some tests failed');
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});




