const bcrypt = require("bcrypt");
const loginController = {};

const getUserFromDatabase = async (username) => {
  // Aquí deberías implementar la lógica para obtener el usuario de tu base de datos
  // Por ejemplo, usando un ORM como Sequelize o Mongoose
  // Este es un ejemplo ficticio:
  const users = [
    {
      id: 1,
      user: "testUser",
      password: "$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36Zf4a2B2e1Z9b1Z9b1Z9b1",
    }, // Contraseña: 'password'
  ];
  return users.find((u) => u.user === username);
};
loginController.loginUser = async (req, res) => {
  const { user, password } = req.body;
  console.log(user, password);

  // Obtener el usuario de la base de datos
  const storedUser = await getUserFromDatabase(user);
  if (!storedUser) {
    return res.status(401).json({ message: "Usuario no encontrado" });
  }

  const isMatch = await bcrypt.compare(password, storedUser.password);
  if (!isMatch) {
    console.log("Contraseña incorrecta");
    return res.status(401).json({ message: "Contraseña incorrecta" });
  }

  // Aquí iría la lógica para generar el token JWT (lo haremos en el siguiente paso)

  return res.status(200).json({ message: "Autenticación exitosa" });
};
module.exports = loginController;
