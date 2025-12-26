const { MongoClient } = require("mongodb");
require("dotenv").config();

const client = new MongoClient(process.env.MONGO_URI);
let db;

async function connect() {
  if (!db) {
    await client.connect();
    db = client.db(process.env.DB);
  }
  return db;
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

module.exports = {
  connect,
  query,
  ping,
  insertOne,
  updateOne,
  deleteOne,
  deleteMany,
  findById,
};
