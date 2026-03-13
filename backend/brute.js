import pkg from 'pg';
const { Client } = pkg;

const ports = [5432, 5434];
const passwords = ['postgres', '', 'root', 'admin', '123456', '1234', 'password'];

async function test_all() {
    for (const port of ports) {
        for (const pass of passwords) {
            const client = new Client({
                user: 'postgres',
                host: 'localhost',
                database: 'postgres',
                password: pass === '' ? undefined : pass,
                port: port,
                connectionTimeoutMillis: 1000,
            });
            try {
                await client.connect();
                console.log(`Port ${port}, Password '${pass}': SUCCESS`);
                await client.end();
                return;
            } catch (e) {
                // Ignore failure
            }
        }
    }
    console.log('Final: All common password/port combinations failed.');
}

test_all();
