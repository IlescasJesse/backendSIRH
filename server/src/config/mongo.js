const { MongoClient } = require("mongodb");
require("dotenv").config();

async function query(collectionName, query) {
  const client = new MongoClient(process.env.MONGO_URI);

  try {
    await client.connect();
    const database = client.db(process.env.DB);
    const collection = database.collection(collectionName);
    const results = await collection.find(query).toArray();
    return results;
  } finally {
    await client.close();
  }
}
async function insertOne(collectionName, document) {
  const client = new MongoClient(process.env.MONGO_URI);

  try {
    await client.connect();
    const database = client.db(process.env.DB);
    const collection = database.collection(collectionName);
    const result = await collection.insertOne(document);
    return result;
  } finally {
    await client.close();
  }
}
async function updateOne(collectionName, filter, update) {
  const client = new MongoClient(process.env.MONGO_URI);

  try {
    await client.connect();
    const database = client.db(process.env.DB);
    const collection = database.collection(collectionName);
    const result = await collection.updateOne(filter, update);
    return result;
  } finally {
    await client.close();
  }
}

async function ping() {
  const client = new MongoClient(process.env.MONGO_URI);

  try {
    await client.connect();
    await client.db().admin().ping();
    const uri = new URL(process.env.MONGO_URI);
    console.log("MongoDB server is active ON " + uri.host);
  } finally {
    await client.close();
  }
}

module.exports = { query, ping, insertOne, updateOne };
