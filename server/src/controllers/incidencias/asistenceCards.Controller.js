const router = require("express").Router();
const asistenceCardsController = {};

asistenceCardsController.printAsistenceCards = async (req, res) => {
  res.send("OK");
};
module.exports = asistenceCardsController;
