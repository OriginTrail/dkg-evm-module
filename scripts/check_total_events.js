const { Client } = require('pg');
require('dotenv').config();

async function checkTotalEvents() {
  const dbConfig = {
    host: process.env.DB_HOST_INDEXER,
    port: 5432,
    user: process.env.DB_USER_INDEXER,
    password: process.env.DB_PASSWORD_INDEXER,
    database: 'postgres'
  };
  
  const networks = [
    { name: 'Gnosis', db: 'gnosis-mainnet-db' },
    { name: 'Base', db: 'base-mainnet-db' },
    { name: 'Neuroweb', db: 'nw-mainnet-db' }
  ];
  
  for (const network of networks) {
    const client = new Client({ ...dbConfig, database: network.db });
    
    try {
      await client.connect();
      
      const result = await client.query(`
        SELECT COUNT(*) as total_events
        FROM delegator_base_stake_updated
      `);
      
      const totalEvents = parseInt(result.rows[0].total_events);
      console.log(`${network.name}: ${totalEvents.toLocaleString()} total events`);
      
    } catch (error) {
      console.error(`Error checking ${network.name}:`, error.message);
    } finally {
      await client.end();
    }
  }
}

checkTotalEvents(); 