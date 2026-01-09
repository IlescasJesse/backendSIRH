# 📱 SIRH Mobile App - Backend Setup

## Archivos Creados

### Middleware

- ✅ `src/middleware/ipWhitelist.js` - Control de acceso por IP

### Rutas

- ✅ `src/routes/monitor/mobile.routes.js` - API endpoints para app móvil

### Actualizado

- ✅ `src/app.js` - Agregada ruta móvil

## 🔧 Configuración del Backend

### 1. Agregar al archivo `.env`

```env
# IPs permitidas para la app móvil (separadas por comas)
ALLOWED_IPS=192.168.1.100,10.0.0.50

# Para desarrollo (permitir todas):
# ALLOWED_IPS=*

# JWT Secret para tokens
JWT_SECRET=your-super-secret-jwt-key-change-this
```

### 2. Instalar dependencias (si no están instaladas)

```bash
npm install jsonwebtoken bcrypt
```

### 3. Crear colección de usuarios en MongoDB

Si no tienes usuarios en MongoDB, crea uno de prueba:

```javascript
// En MongoDB Compass o similar:
db.USERS.insertOne({
  username: "admin",
  password: "$2b$10$xyz...", // Hash bcrypt de la contraseña
  email: "admin@sirh.com",
  role: "admin",
  fullName: "Administrador SIRH",
  createdAt: new Date(),
});
```

### 4. Reiniciar el servidor

```bash
npm run dev
# o
node src/index.js
```

## 📡 Endpoints Disponibles

### Públicos (sin autenticación)

- `POST /api/mobile/monitor/login` - Login móvil

### Protegidos (requieren JWT token)

- `GET /api/mobile/monitor/dashboard` - Dashboard general
- `GET /api/mobile/monitor/agenda/logs` - Logs de agenda
- `GET /api/mobile/monitor/agenda/stats` - Estadísticas
- `POST /api/mobile/monitor/agenda/run/:taskName` - Ejecutar tarea
- `GET /api/mobile/monitor/server/health` - Estado del servidor
- `GET /api/mobile/monitor/logs/recent` - Logs recientes

## 🔐 Seguridad

### IP Whitelist

- En producción: Agregar solo las IPs necesarias
- En desarrollo local: Usar `ALLOWED_IPS=*` o la IP de tu dispositivo
- Sin configurar: Todas las IPs son permitidas (modo dev)

### Obtener tu IP

```powershell
# Windows
ipconfig

# Buscar "Dirección IPv4" de tu adaptador de red
```

### Ejemplo de IPs

```env
# Tu máquina de desarrollo
ALLOWED_IPS=192.168.1.100

# Múltiples dispositivos
ALLOWED_IPS=192.168.1.100,192.168.1.101,10.0.0.50

# Oficina + VPN
ALLOWED_IPS=192.168.1.0/24,10.0.0.0/16
```

## 🧪 Probar la API

### Con cURL (PowerShell)

```powershell
# Login
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/mobile/monitor/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"username":"admin","password":"123456","deviceId":"test"}'

$token = $response.token

# Dashboard (con token)
Invoke-RestMethod -Uri "http://localhost:3000/api/mobile/monitor/dashboard" `
  -Headers @{Authorization = "Bearer $token"}
```

### Con Postman

1. **Login**

   - Method: POST
   - URL: `http://localhost:3000/api/mobile/monitor/login`
   - Body (JSON):

   ```json
   {
     "username": "admin",
     "password": "tu_contraseña",
     "deviceId": "postman-test"
   }
   ```

2. **Copiar el token** de la respuesta

3. **Dashboard**
   - Method: GET
   - URL: `http://localhost:3000/api/mobile/monitor/dashboard`
   - Headers:
     - Key: `Authorization`
     - Value: `Bearer TU_TOKEN_AQUI`

## 🐛 Troubleshooting

### Error: "IP no autorizada"

```env
# Solución: Agregar tu IP al .env
ALLOWED_IPS=*
```

### Error: "Credenciales inválidas"

- Verificar que el usuario existe en MongoDB
- Verificar que la contraseña está hasheada con bcrypt

### Error: "Token inválido"

- Verificar que JWT_SECRET esté configurado
- El token expira en 7 días

### Logs del servidor

El middleware muestra en consola:

- 🔒 IP Request: X.X.X.X
- ✅ IP autorizada: X.X.X.X
- ❌ IP bloqueada: X.X.X.X

## 📋 Checklist

- [ ] Variables de entorno configuradas (.env)
- [ ] Usuario de prueba creado en MongoDB
- [ ] Servidor reiniciado
- [ ] IP de tu dispositivo agregada a ALLOWED_IPS
- [ ] Prueba de login exitosa
- [ ] App móvil configurada con URL correcta

## 🚀 Siguiente Paso

Ahora puedes ejecutar la aplicación Flutter y conectarte al servidor!

Ver: `C:\SIRH-IOS-ANDROID-APP\README.md`
