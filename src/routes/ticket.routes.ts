import { FastifyInstance } from "fastify";
import {
  verifyToken,
  requireLocalPermission,
} from "../middlewares/auth.middleware";
import {
  getGroupTickets,
  getMyTickets,
  getTicketDetail,
  getTicketStats,
  GetTicketsQuery,
  createTicket,
  updateTicket,
  deleteTicket,
  patchTicketStatus,
  addTicketComment,
} from "../controllers/ticket.controller";

export default async function ticketRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", verifyToken);

  fastify.get("/me", getMyTickets);

  fastify.get<{ Querystring: { groupId?: string } }>(
    "/stats",
    {
      preHandler: async (request, reply) => {
        if (request.query.groupId) {
          await requireLocalPermission(["ticket:view"])(request, reply);
        }
      },
    },
    getTicketStats,
  );

  fastify.get<{ Querystring: GetTicketsQuery }>(
    "/",
    {
      preHandler: [requireLocalPermission(["ticket:view"])],
    },
    getGroupTickets,
  );

  fastify.get<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: [requireLocalPermission(["ticket:view"])],
    },
    getTicketDetail,
  );

  fastify.post(
    "/",
    {
      preHandler: [requireLocalPermission(["ticket:add"])],
    },
    createTicket,
  );

  fastify.put<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: [requireLocalPermission(["ticket:edit", "ticket:view"])],
    },
    updateTicket,
  );

  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: [requireLocalPermission(["ticket:delete"])],
    },
    deleteTicket,
  );

  fastify.patch<{ Params: { id: string } }>(
    "/:id/status",
    {
      preHandler: [requireLocalPermission(["ticket:edit", "ticket:view"])],
    },
    patchTicketStatus,
  );

  fastify.post<{ Params: { id: string } }>(
    "/:id/comments",
    {
      preHandler: [requireLocalPermission(["ticket:edit"])],
    },
    addTicketComment,
  );
}
