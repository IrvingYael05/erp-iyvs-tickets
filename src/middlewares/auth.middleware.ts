import { FastifyRequest, FastifyReply } from "fastify";
import { supabase } from "../config/supabase";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
    };
  }
}

export const verifyToken = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({
      statusCode: 401,
      intOpCode: 1,
      data: [{ message: "No se proporcionó un token de autenticación." }],
    });
  }

  const token = authHeader.split(" ")[1];

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return reply.status(401).send({
      statusCode: 401,
      intOpCode: 2,
      data: [{ message: "Token inválido o expirado." }],
    });
  }

  request.user = {
    id: data.user.id,
    email: data.user.email as string,
  };
};

export const requireLocalPermission = (requiredPermissions: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user!.id;
      let groupId: number | null = null;

      const params = request.params as any;
      const query = request.query as any;
      const body = request.body as any;

      if (query.groupId) {
        groupId = parseInt(query.groupId);
      } else if (body && body.grupoId) {
        groupId = parseInt(body.grupoId);
      } else if (params.id) {
        const ticketId = parseInt(params.id);
        const { data: ticketData, error: ticketError } = await supabase
          .from("tickets")
          .select("grupo_id")
          .eq("id", ticketId)
          .single();

        if (ticketError || !ticketData) {
          return reply.status(404).send({
            statusCode: 404,
            intOpCode: 1,
            data: [{ message: "El ticket no existe o fue eliminado." }],
          });
        }
        groupId = ticketData.grupo_id;
      }

      if (!groupId) {
        return reply.status(400).send({
          statusCode: 400,
          intOpCode: 1,
          data: [
            {
              message:
                "No se pudo determinar el grupo para validar los permisos.",
            },
          ],
        });
      }

      const { data: memberData, error: memberError } = await supabase
        .from("grupo_miembros")
        .select("permisos_locales")
        .eq("grupo_id", groupId)
        .eq("usuario_id", userId)
        .single();

      if (memberError || !memberData) {
        return reply.status(403).send({
          statusCode: 403,
          intOpCode: 1,
          data: [
            { message: "No perteneces a este grupo o el acceso fue denegado." },
          ],
        });
      }

      const hasPermission = requiredPermissions.some((perm) =>
        memberData.permisos_locales.includes(perm),
      );

      if (!hasPermission) {
        return reply.status(403).send({
          statusCode: 403,
          intOpCode: 2,
          data: [
            {
              message:
                "Acceso denegado. No tienes permisos para realizar esta acción.",
            },
          ],
        });
      }
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        statusCode: 500,
        intOpCode: 99,
        data: [{ message: "Error interno al verificar los permisos locales." }],
      });
    }
  };
};
