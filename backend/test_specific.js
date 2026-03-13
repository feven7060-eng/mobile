import pkg from 'pg';
const { Client } = pkg;

async function test() {
    const client = new Client({
        user: 'postgres',
        host: 'localhost',
        database: 'asmis_mobile',
        password: '123456',
        port: 5432,
    });
    try {
        await client.connect();
        console.log('Connected to asmis_mobile database!');
        await client.end();
    } catch (e) {
        if (e.message.includes('database "asmis_mobile" does not exist')) {
            console.log('Successfully connected but database "asmis_mobile" is missing.');
        } else {
            console.log(`Failed - ${e.message}`);
        }
    }
}
test();
