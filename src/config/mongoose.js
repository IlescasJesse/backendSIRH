const mongoose = require("mongoose");

async function connectMongoose() {
    try {
        await mongoose.connect(`${process.env.MONGO_URI}/${process.env.DB}`, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log("🟢 Mongoose conectado correctamente");
    } catch (error) {
        console.error("🔴 Error conectando Mongoose:", error);
        process.exit(1);
    }
}

module.exports = { connectMongoose };
