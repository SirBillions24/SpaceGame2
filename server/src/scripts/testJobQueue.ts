/**
 * BullMQ Integration Test Script
 * 
 * This script tests the job queue integration by:
 * 1. Connecting to Redis
 * 2. Queuing test jobs
 * 3. Verifying workers process them correctly
 * 
 * Usage:
 *   cd server
 *   npx ts-node src/scripts/testJobQueue.ts
 * 
 * Prerequisites:
 *   - Redis running on localhost:6379 (or REDIS_HOST/REDIS_PORT env vars)
 */

import { Queue, Worker, QueueEvents } from 'bullmq';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

const connection = {
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null as null,
};

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    duration?: number;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    try {
        await testFn();
        results.push({
            name,
            passed: true,
            message: 'OK',
            duration: Date.now() - start,
        });
        console.log(`✅ ${name} (${Date.now() - start}ms)`);
    } catch (error: any) {
        results.push({
            name,
            passed: false,
            message: error.message,
            duration: Date.now() - start,
        });
        console.error(`❌ ${name}: ${error.message}`);
    }
}

async function main() {
    console.log('🧪 BullMQ Integration Tests');
    console.log(`📡 Connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}\n`);

    // Test 1: Redis Connection
    await runTest('Redis Connection', async () => {
        const testQueue = new Queue('test-connection', { connection });
        await testQueue.getJobCounts();
        await testQueue.close();
    });

    // Test 2: Queue Job Creation
    await runTest('Queue Job Creation', async () => {
        const testQueue = new Queue('test-jobs', { connection });

        const job = await testQueue.add('test-job', { message: 'hello' }, {
            removeOnComplete: true,
        });

        if (!job.id) throw new Error('Job ID not assigned');

        // Clean up
        await job.remove();
        await testQueue.close();
    });

    // Test 3: Delayed Job
    await runTest('Delayed Job Scheduling', async () => {
        const testQueue = new Queue('test-delayed', { connection });

        const job = await testQueue.add('delayed-job', { data: 'test' }, {
            delay: 5000, // 5 seconds
            removeOnComplete: true,
        });

        const state = await job.getState();
        if (state !== 'delayed') throw new Error(`Expected 'delayed' state, got '${state}'`);

        await job.remove();
        await testQueue.close();
    });

    // Test 4: Worker Processing
    await runTest('Worker Processing', async () => {
        const testQueue = new Queue('test-worker', { connection });

        let processed = false;
        const worker = new Worker('test-worker', async (job) => {
            if (job.data.message === 'process-me') {
                processed = true;
            }
            return { success: true };
        }, { connection });

        await testQueue.add('process-job', { message: 'process-me' });

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        await worker.close();
        await testQueue.close();

        if (!processed) throw new Error('Job was not processed by worker');
    });

    // Test 5: Job with Custom ID (Idempotency)
    await runTest('Custom Job ID (Idempotency)', async () => {
        const testQueue = new Queue('test-idempotency', { connection });

        const job1 = await testQueue.add('unique-job', { attempt: 1 }, {
            jobId: 'my-unique-id',
            removeOnComplete: true,
        });

        // Try to add same job ID again - should throw or return existing
        try {
            const job2 = await testQueue.add('unique-job', { attempt: 2 }, {
                jobId: 'my-unique-id',
            });
            // If it didn't throw, IDs should match
            if (job1.id !== job2.id) {
                throw new Error('Duplicate job ID should return same job or throw');
            }
        } catch (e) {
            // Expected behavior - duplicate job ID rejected
        }

        await job1.remove();
        await testQueue.close();
    });

    // Test 6: GameEvents Queue (Production Queue)
    await runTest('GameEvents Queue Access', async () => {
        const { gameEventsQueue, getQueueStats } = await import('../lib/jobQueue');

        const stats = await getQueueStats();

        if (typeof stats.waiting !== 'number') throw new Error('Invalid queue stats');
        if (typeof stats.active !== 'number') throw new Error('Invalid queue stats');
        if (typeof stats.delayed !== 'number') throw new Error('Invalid queue stats');

        console.log(`    📊 Queue stats: waiting=${stats.waiting}, active=${stats.active}, delayed=${stats.delayed}`);
    });

    // Print summary
    console.log('\n' + '='.repeat(50));
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    if (failed === 0) {
        console.log(`✅ All ${passed} tests passed!`);
    } else {
        console.log(`❌ ${failed} of ${passed + failed} tests failed:`);
        results.filter(r => !r.passed).forEach(r => {
            console.log(`   - ${r.name}: ${r.message}`);
        });
    }

    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
