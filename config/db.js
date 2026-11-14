const dns = require('dns');
const mongoose = require('mongoose');

// Utiliser des serveurs DNS publics fiables (Google & Cloudflare) pour contourner les échecs SRV sous Windows / FAI locaux
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {
  console.warn('Configuration DNS :', e.message);
}

const FALLBACK_DIRECT_URI =
  'mongodb://aliou_sow:aliou221@ac-w7mghnb-shard-00-00.r9nnnvz.mongodb.net:27017,ac-w7mghnb-shard-00-01.r9nnnvz.mongodb.net:27017,ac-w7mghnb-shard-00-02.r9nnnvz.mongodb.net:27017/elearning_sow?ssl=true&replicaSet=atlas-3zzw5i-shard-0&authSource=admin';

const connectDB = async (retryCount = 0) => {
  const primaryUri = process.env.MONGO_URI || FALLBACK_DIRECT_URI;
  try {
    const conn = await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 15000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Erreur connexion MongoDB (URI primaire): ${error.message}`);
    // Si l'erreur est liée au DNS SRV (ECONNREFUSED / ENOTFOUND) et qu'on utilise un URI +srv
    if (
      primaryUri.includes('+srv') &&
      (error.message.includes('querySrv') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('MongoServerSelectionError'))
    ) {
      console.log("Bascule automatique sur l'URI direct ReplicaSet Atlas (contournement DNS SRV)...");
      try {
        const connFallback = await mongoose.connect(FALLBACK_DIRECT_URI, {
          serverSelectionTimeoutMS: 10000,
          connectTimeoutMS: 15000,
        });
        console.log(`MongoDB Connected (via fallback direct): ${connFallback.connection.host}`);
        return;
      } catch (fallbackError) {
        console.error(`Erreur connexion fallback MongoDB: ${fallbackError.message}`);
      }
    }

    if (retryCount < 5) {
      const waitTime = Math.min(2000 * Math.pow(1.5, retryCount), 10000);
      console.log(
        `Nouvelle tentative de connexion dans ${Math.round(waitTime / 1000)}s... (Tentative ${retryCount + 1}/5)`
      );
      setTimeout(() => connectDB(retryCount + 1), waitTime);
    } else {
      console.error('Échec de connexion à MongoDB après plusieurs tentatives.');
    }
  }
};

module.exports = connectDB;
