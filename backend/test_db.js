import pkg from 'pg';
const { Client } = pkg;

async function test(port) {
    const client = new Client({
        user: 'postgres',
        host: 'localhost',
        database: 'postgres',
        password: 'postgres',
        port: port,
    });
    try {
        await client.connect();
        console.log(`Port ${port}: Connected successfully`);
        await client.end();
    } catch (e) {
        console.log(`Port ${port}: Failed - ${e.message}`);
    }
}

test(5432);
test(5434);
test(54345);
test(54346);
