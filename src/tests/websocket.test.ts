import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const rootDir = path.resolve(__dirname, '../../..');
console.log('Root directory:', rootDir);

function getTsNodeBin(backendDir: string) {
    // Windows: .cmd extension, Unix: no extension
    const binName = process.platform === 'win32' ? 'ts-node.cmd' : 'ts-node';
    const binPath = path.join(rootDir, backendDir, 'node_modules', '.bin', binName);
    if (!fs.existsSync(binPath)) {
        throw new Error(`ts-node binary not found at ${binPath}`);
    }
    return binPath;
}

async function runTest(type: 'driver' | 'rider') {
    const backendDir = type === 'driver' ? 'driver_backend' : 'transit_backend-1';
    const testFile = path.join(rootDir, backendDir, 'src/tests/websocket.test.ts');
    const tsConfigPath = path.join(rootDir, backendDir, 'tsconfig.json');
    const tsNodeBin = getTsNodeBin(backendDir);
    
    console.log(`Starting ${type} test...`);
    console.log('TSConfig path:', tsConfigPath);
    console.log('ts-node path:', tsNodeBin);

    // Build the command as a string for Windows compatibility
    const command = `"${tsNodeBin}" --project "${tsConfigPath}" "${testFile}"`;

    const testProcess = spawn(command, {
        stdio: 'inherit',
        env: {
            ...process.env,
            TS_NODE_PROJECT: tsConfigPath
        },
        cwd: path.join(rootDir, backendDir),
        shell: true // Required for Windows
    });

    return new Promise<void>((resolve, reject) => {
        testProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`${type} test completed successfully`);
                resolve();
            } else {
                console.error(`${type} test exited with code ${code}`);
                reject(new Error(`${type} test failed with code ${code}`));
            }
        });
    });
}

async function runTests() {
    console.log('Starting WebSocket integration tests...');
    
    try {
        await Promise.all([
            runTest('driver'),
            runTest('rider')
        ]);
        console.log('All tests completed successfully');
    } catch (error) {
        console.error('Tests failed:', error);
        process.exit(1);
    }
}

runTests(); 