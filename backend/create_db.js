import pkg from 'pg';
const { Client } = pkg;

async function createDb() {
    const client = new Client({
        user: 'postgres',
        host: 'localhost',
        database: 'postgres',
        password: '123456',
        port: 5432,
    });
    try {
        await client.connect();
        await client.query('CREATE DATABASE asmis_mobile');
        console.log('Database asmis_mobile created.');
    } catch (e) {
        if (e.message.includes('already exists')) {
            console.log('Database already exists.');
        } else {
            console.log(`Error creating DB: ${e.message}`);
        }
    } finally {
        await client.end();
    }
}
createDb();
