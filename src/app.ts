import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import ticketRoutes from './routes/ticket.routes';

dotenv.config();

const app = Fastify({
  logger: true,
});

app.register(cors, {
  origin: "*", // Cambiar a getway
});

app.register(ticketRoutes, { prefix: '/api/tickets' });

app.get("/health", async (request, reply) => {
  return { status: "ok", service: "tickets-service" };
});

const start = async () => {
  try {
    const PORT = parseInt(process.env.PORT || "3003", 10);
    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
