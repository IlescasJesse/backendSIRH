const { MongoClient } = require("mongodb");
const { AsyncLocalStorage } = require("async_hooks");
require("dotenv").config();

const client = new MongoClient(process.env.MONGO_URI);
const dbCache = new Map();
let connectPromise = null;

// Permite que un request (ej. reporte retroactivo) fuerce temporalmente
// la base de datos que deben usar query()/insertOne()/etc. sin tocar
// los controladores que ya las usan.
const dbContext = new AsyncLocalStorage();

function withDatabase(dbName, fn) {
  return dbContext.run({ dbName }, fn);
}

async function ensureConnected() {
  if (!connectPromise) {
    connectPromise = client.connect();
  }
  return connectPromise;
}

async function connect() {
  await ensureConnected();
  const dbName = dbContext.getStore()?.dbName || process.env.DB;
  if (!dbCache.has(dbName)) {
    dbCache.set(dbName, client.db(dbName));
  }
  return dbCache.get(dbName);
}

async function query(collectionName, query) {
  const database = await connect();
  const collection = database.collection(collectionName);
  const results = await collection.find(query).toArray();
  return results;
}

async function insertOne(collectionName, document) {
  const database = await connect();
  const collection = database.collection(collectionName);
  const result = await collection.insertOne(document);
  return result;
}

async function updateOne(collectionName, filter, update) {
  const database = await connect();
  const collection = database.collection(collectionName);
  const result = await collection.updateOne(filter, update);
  return result;
}

async function updateMany(collectionName, filter, update, options = {}) {
  const database = await connect();
  const collection = database.collection(collectionName);
  const result = await collection.updateMany(filter, update, options);
  return result;
}

async function deleteOne(collectionName, filter) {
  const database = await connect();
  const collection = database.collection(collectionName);
  const result = await collection.deleteOne(filter);
  return result;
}

async function deleteMany(collectionName, filter) {
  const database = await connect();
  const collection = database.collection(collectionName);
  const result = await collection.deleteMany(filter);
  return result;
}

async function ping() {
  const database = await connect();
  await database.admin().ping();
  const uri = new URL(process.env.MONGO_URI);
  console.log("MongoDB server is active ON " + uri.host);
}
async function findById(collectionName, id) {
  const database = await connect();
  const collection = database.collection(collectionName);
  const result = await collection.findOne({ _id: id });
  return result;
}

async function dropDatabase(dbName) {
  await ensureConnected();
  await client.db(dbName).dropDatabase();
  dbCache.delete(dbName);
}

module.exports = {
  connect,
  query,
  ping,
  insertOne,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
  findById,
  withDatabase,
  dropDatabase,
};
