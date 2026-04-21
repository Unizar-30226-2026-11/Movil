import swaggerJSDoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Multiplayer Game API',
      version: '1.0.0',
      description: 'API para gestión de partidas, amigos y tienda del juego.',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Servidor de desarrollo',
      },
    ],
    tags: [
      { name: 'Auth', description: 'Registro e inicio de sesión' },
      {
        name: 'Users',
        description: 'Perfil, economía, cartas y mazos del usuario autenticado',
      },
      {
        name: 'Friends',
        description: 'Gestión de amigos y solicitudes de amistad',
      },
      { name: 'Lobbies', description: 'Creación y búsqueda de salas de juego' },
      { name: 'Shop', description: 'Catálogo de artículos y compras' },
      { name: 'Collections', description: 'Colecciones de cartas del juego' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Mensaje de error descriptivo.',
            },
          },
        },
      },
    },
  },
  apis: ['./src/api/routes/*.ts'], // Aquí es donde Swagger buscará los comentarios para documentar
};

export const swaggerSpec = swaggerJSDoc(options);
