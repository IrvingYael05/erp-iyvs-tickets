import { FastifyRequest, FastifyReply } from "fastify";
import { supabase } from "../config/supabase";

const ESTADOS_PERMITIDOS = [
  "Pendiente",
  "En Progreso",
  "Revisión",
  "Finalizado",
];
const PRIORIDADES_PERMITIDAS = ["Baja", "Media", "Alta"];

export interface GetTicketsQuery {
  groupId?: string;
  filter?: "mis_tickets" | "sin_asignar" | "prioridad_alta" | "todos";
}

// ----- Obtener Tickets de un Grupo (Con Filtros) -----
export const getGroupTickets = async (
  request: FastifyRequest<{ Querystring: GetTicketsQuery }>,
  reply: FastifyReply,
) => {
  try {
    const { groupId, filter } = request.query;
    const userId = request.user!.id;

    if (!groupId) {
      return reply.status(400).send({
        statusCode: 400,
        intOpCode: 1,
        data: [{ message: "El ID del grupo es obligatorio." }],
      });
    }

    let query = supabase
      .from("tickets")
      .select(
        `
        id, titulo, descripcion, estado, prioridad, fecha_limite, creado_en, grupo_id,
        autor:usuarios!tickets_autor_id_fkey(email, nombre_completo),
        asignado:usuarios!tickets_asignado_id_fkey(email, nombre_completo)
      `,
        { count: "exact" },
      )
      .eq("grupo_id", groupId)
      .order("creado_en", { ascending: false });

    if (filter === "mis_tickets") {
      query = query.eq("asignado_id", userId);
    } else if (filter === "sin_asignar") {
      query = query.is("asignado_id", null);
    } else if (filter === "prioridad_alta") {
      query = query.eq("prioridad", "Alta");
    }

    const { data, error, count } = await query;

    if (error) throw error;

    const mappedTickets = data.map((t: any) => ({
      id: t.id,
      titulo: t.titulo,
      descripcion: t.descripcion,
      estado: t.estado,
      prioridad: t.prioridad,
      fechaLimite: t.fecha_limite,
      autorEmail: t.autor?.email,
      asignadoA: t.asignado?.email || "",
      grupoId: t.grupo_id,
    }));

    return reply.status(200).send({
      statusCode: 200,
      intOpCode: 0,
      data: [{ tickets: mappedTickets, totalRecords: count || 0 }],
    });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error al obtener los tickets del grupo." }],
    });
  }
};

// ----- Obtener Mis Tickets Globales -----
export const getMyTickets = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const userId = request.user!.id;

    const { data, error, count } = await supabase
      .from("tickets")
      .select(
        `
        id, titulo, descripcion, estado, prioridad, fecha_limite, creado_en, grupo_id,
        grupos(nombre),
        autor:usuarios!tickets_autor_id_fkey(email, nombre_completo),
        asignado:usuarios!tickets_asignado_id_fkey(email, nombre_completo)
      `,
        { count: "exact" },
      )
      .eq("asignado_id", userId)
      .order("fecha_limite", { ascending: true });

    if (error) throw error;

    const mappedTickets = data.map((t: any) => ({
      id: t.id,
      titulo: t.titulo,
      descripcion: t.descripcion,
      estado: t.estado,
      prioridad: t.prioridad,
      fechaLimite: t.fecha_limite,
      autorEmail: t.autor?.email,
      asignadoA: t.asignado?.email,
      grupoId: t.grupo_id,
      grupoNombre: t.grupos?.nombre,
    }));

    return reply.status(200).send({
      statusCode: 200,
      intOpCode: 0,
      data: [{ tickets: mappedTickets, totalRecords: count || 0 }],
    });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error al obtener tus tickets." }],
    });
  }
};

// ----- Obtener Detalle de un Ticket (Eager Load) -----
export const getTicketDetail = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const ticketId = request.params.id;

    const { data, error } = await supabase
      .from("tickets")
      .select(
        `
        id, titulo, descripcion, estado, prioridad, fecha_limite, creado_en, grupo_id,
        autor:usuarios!tickets_autor_id_fkey(email, nombre_completo),
        asignado:usuarios!tickets_asignado_id_fkey(email, nombre_completo),
        comentarios (
          id, texto, creado_en,
          autor:usuarios!comentarios_autor_id_fkey(nombre_completo)
        ),
        historial_tickets (
          id, descripcion, creado_en,
          usuario:usuarios!historial_tickets_usuario_id_fkey(nombre_completo)
        )
      `,
      )
      .eq("id", ticketId)
      .single();

    if (error || !data) {
      return reply.status(404).send({
        statusCode: 404,
        intOpCode: 1,
        data: [{ message: "Ticket no encontrado." }],
      });
    }

    const ticketDetail = {
      id: data.id,
      titulo: data.titulo,
      descripcion: data.descripcion,
      estado: data.estado,
      prioridad: data.prioridad,
      fechaLimite: data.fecha_limite,
      fechaCreacion: data.creado_en,
      autorEmail: (data.autor as any)?.email,
      asignadoA: (data.asignado as any)?.email || "",
      grupoId: data.grupo_id,
      comentariosList: data.comentarios
        .map((c: any) => ({
          id: c.id,
          texto: c.texto,
          fecha: c.creado_en,
          autor: c.autor?.nombre_completo || "Desconocido",
        }))
        .sort(
          (a: any, b: any) =>
            new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
        ),
      historial: data.historial_tickets
        .map((h: any) => ({
          id: h.id,
          descripcion: h.descripcion,
          fecha: h.creado_en,
          autor: h.usuario?.nombre_completo || "Desconocido",
        }))
        .sort(
          (a: any, b: any) =>
            new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
        ),
    };

    return reply
      .status(200)
      .send({ statusCode: 200, intOpCode: 0, data: [ticketDetail] });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error al obtener el detalle." }],
    });
  }
};

// ----- Estadísticas -----
export const getTicketStats = async (
  request: FastifyRequest<{ Querystring: { groupId?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { groupId } = request.query;
    const userId = request.user!.id;

    let query = supabase.from("tickets").select("estado");

    if (groupId) {
      query = query.eq("grupo_id", groupId);
    } else {
      query = query.eq("asignado_id", userId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const stats = {
      total: data.length,
      pendientes: data.filter((t) => t.estado === "Pendiente").length,
      enProgreso: data.filter((t) => t.estado === "En Progreso").length,
      enRevision: data.filter((t) => t.estado === "Revisión").length,
      finalizados: data.filter((t) => t.estado === "Finalizado").length,
    };

    return reply
      .status(200)
      .send({ statusCode: 200, intOpCode: 0, data: [stats] });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error calculando estadísticas." }],
    });
  }
};

// ----- Crear Ticket -----
export const createTicket = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const userId = request.user!.id;
    const body = request.body as any;
    const {
      titulo,
      descripcion,
      estado,
      prioridad,
      fechaLimite,
      asignadoA,
      grupoId,
    } = body;

    if (!titulo) {
      return reply.status(400).send({
        statusCode: 400,
        intOpCode: 1,
        data: [
          {
            message: "El título del ticket es obligatorio.",
          },
        ],
      });
    }

    if (!descripcion) {
      return reply.status(400).send({
        statusCode: 400,
        intOpCode: 1,
        data: [
          {
            message: "La descripción del ticket es obligatoria.",
          },
        ],
      });
    }

    if (!grupoId) {
      return reply.status(400).send({
        statusCode: 400,
        intOpCode: 1,
        data: [
          {
            message: "El ID del grupo es obligatorio.",
          },
        ],
      });
    }

    const estadoFinal = estado || "Pendiente";
    if (!ESTADOS_PERMITIDOS.includes(estadoFinal)) {
      return reply.status(400).send({
        statusCode: 400,
        intOpCode: 1,
        data: [
          {
            message: `El estado del ticket no es válido. Debe ser uno de: ${ESTADOS_PERMITIDOS.join(", ")}`,
          },
        ],
      });
    }

    const prioridadFinal = prioridad || "Media";
    if (!PRIORIDADES_PERMITIDAS.includes(prioridadFinal)) {
      return reply.status(400).send({
        statusCode: 400,
        intOpCode: 1,
        data: [
          {
            message: `La prioridad del ticket no es válida. Debe ser una de: ${PRIORIDADES_PERMITIDAS.join(", ")}`,
          },
        ],
      });
    }

    const { data: autor } = await supabase
      .from("usuarios")
      .select("nombre_completo")
      .eq("id", userId)
      .single();
    const nombreAutor = autor?.nombre_completo || "Usuario";

    let asignadoId = null;
    if (asignadoA && asignadoA.trim() !== "") {
      const { data: userAsignado } = await supabase
        .from("usuarios")
        .select("id")
        .eq("email", asignadoA.toLowerCase().trim())
        .single();
      if (userAsignado) asignadoId = userAsignado.id;
    }

    const { data: newTicket, error: ticketError } = await supabase
      .from("tickets")
      .insert({
        grupo_id: grupoId,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        estado: estadoFinal,
        prioridad: prioridadFinal,
        fecha_limite: fechaLimite || null,
        autor_id: userId,
        asignado_id: asignadoId,
      })
      .select()
      .single();

    if (ticketError || !newTicket) {
      return reply.status(500).send({
        statusCode: 500,
        intOpCode: 2,
        data: [{ message: "Error al insertar el ticket en la base de datos." }],
      });
    }

    let textoHistorial = `${nombreAutor} creó el ticket.`;
    if (estadoFinal !== "Pendiente") {
      textoHistorial = `${nombreAutor} creó el ticket con estado '${estadoFinal}'.`;
    }

    await supabase.from("historial_tickets").insert({
      ticket_id: newTicket.id,
      usuario_id: userId,
      descripcion: textoHistorial,
    });

    return reply.status(201).send({
      statusCode: 201,
      intOpCode: 0,
      data: [
        { message: "Ticket creado exitosamente.", ticketId: newTicket.id },
      ],
    });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error interno al crear el ticket." }],
    });
  }
};

// ----- Actualizar Ticket -----
export const updateTicket = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const ticketId = request.params.id;
    const userId = request.user!.id;
    const body = request.body as any;
    const { titulo, descripcion, estado, prioridad, fechaLimite, asignadoA } =
      body;

    if (estado && !ESTADOS_PERMITIDOS.includes(estado)) {
      return reply.status(400).send({
        statusCode: 400,
        intOpCode: 1,
        data: [
          {
            message: `El estado del ticket no es válido. Debe ser uno de: ${ESTADOS_PERMITIDOS.join(", ")}`,
          },
        ],
      });
    }
    if (prioridad && !PRIORIDADES_PERMITIDAS.includes(prioridad)) {
      return reply.status(400).send({
        statusCode: 400,
        intOpCode: 1,
        data: [
          {
            message: `La prioridad del ticket no es válida. Debe ser una de: ${PRIORIDADES_PERMITIDAS.join(", ")}`,
          },
        ],
      });
    }

    const { data: ticketActual, error: fetchError } = await supabase
      .from("tickets")
      .select("*, asignado:usuarios!tickets_asignado_id_fkey(email)")
      .eq("id", ticketId)
      .single();
    if (fetchError || !ticketActual)
      return reply.status(404).send({
        statusCode: 404,
        intOpCode: 1,
        data: [{ message: "Ticket no encontrado." }],
      });

    const { data: memberData } = await supabase
      .from("grupo_miembros")
      .select("permisos_locales")
      .eq("grupo_id", ticketActual.grupo_id)
      .eq("usuario_id", userId)
      .single();

    const hasEditPerm = memberData?.permisos_locales?.includes("ticket:edit");
    const isAssigned = ticketActual.asignado_id === userId;

    if (!hasEditPerm && !isAssigned) {
      return reply.status(403).send({
        statusCode: 403,
        intOpCode: 1,
        data: [{ message: "No tienes permisos para editar este ticket." }],
      });
    }

    if (!hasEditPerm && isAssigned) {
      if (
        (titulo && titulo !== ticketActual.titulo) ||
        (descripcion && descripcion !== ticketActual.descripcion) ||
        (asignadoA !== undefined &&
          asignadoA !== (ticketActual.asignado?.email || "")) ||
        (fechaLimite !== undefined && fechaLimite !== ticketActual.fecha_limite)
      ) {
        return reply.status(403).send({
          statusCode: 403,
          intOpCode: 1,
          data: [
            {
              message:
                "Como responsable del ticket, solo puedes cambiar la prioridad y el estado.",
            },
          ],
        });
      }
    }

    let nuevoAsignadoId = ticketActual.asignado_id;
    let emailAsignadoAnterior = ticketActual.asignado?.email || "";

    if (asignadoA !== undefined && asignadoA !== emailAsignadoAnterior) {
      if (asignadoA.trim() === "") {
        nuevoAsignadoId = null;
      } else {
        const { data: userAsignado } = await supabase
          .from("usuarios")
          .select("id")
          .eq("email", asignadoA.toLowerCase().trim())
          .single();
        nuevoAsignadoId = userAsignado ? userAsignado.id : nuevoAsignadoId;
      }
    }

    const { error: updateError } = await supabase
      .from("tickets")
      .update({
        titulo: titulo ? titulo.trim() : ticketActual.titulo,
        descripcion: descripcion
          ? descripcion.trim()
          : ticketActual.descripcion,
        estado: estado || ticketActual.estado,
        prioridad: prioridad || ticketActual.prioridad,
        fecha_limite:
          fechaLimite !== undefined ? fechaLimite : ticketActual.fecha_limite,
        asignado_id: nuevoAsignadoId,
      })
      .eq("id", ticketId);

    if (updateError) throw updateError;

    const { data: autor } = await supabase
      .from("usuarios")
      .select("nombre_completo")
      .eq("id", userId)
      .single();
    const nombreAutor = autor?.nombre_completo || "Usuario";
    const cambios = [];

    if (ticketActual.estado !== estado && estado)
      cambios.push(`cambió el estado a '${estado}'`);
    if (ticketActual.prioridad !== prioridad && prioridad)
      cambios.push(`cambió la prioridad a '${prioridad}'`);
    if (emailAsignadoAnterior !== asignadoA && asignadoA !== undefined) {
      cambios.push(`reasignó la tarea a '${asignadoA || "Nadie"}'`);
    }

    if (cambios.length > 0) {
      await supabase.from("historial_tickets").insert({
        ticket_id: ticketId,
        usuario_id: userId,
        descripcion: `${nombreAutor} ${cambios.join(", ")}.`,
      });
    }

    return reply.status(200).send({
      statusCode: 200,
      intOpCode: 0,
      data: [{ message: "Ticket actualizado correctamente." }],
    });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error al actualizar el ticket." }],
    });
  }
};

// ----- Eliminar Ticket -----
export const deleteTicket = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const ticketId = request.params.id;

    const { error } = await supabase
      .from("tickets")
      .delete()
      .eq("id", ticketId);

    if (error) {
      return reply.status(400).send({
        statusCode: 400,
        intOpCode: 1,
        data: [
          {
            message: "No se pudo eliminar el ticket.",
            detalle: error.message,
          },
        ],
      });
    }

    return reply.status(200).send({
      statusCode: 200,
      intOpCode: 0,
      data: [{ message: "Ticket eliminado exitosamente." }],
    });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error interno al eliminar el ticket." }],
    });
  }
};

// ----- Cambiar Estado del Ticket -----
export const patchTicketStatus = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const ticketId = request.params.id;
    const userId = request.user!.id;
    const { estado } = request.body as any;

    if (!estado) {
      return reply.status(400).send({
        statusCode: 400,
        intOpCode: 1,
        data: [{ message: "El estado es requerido." }],
      });
    }

    // Validación Estricta
    if (!ESTADOS_PERMITIDOS.includes(estado)) {
      return reply.status(400).send({
        statusCode: 400,
        intOpCode: 1,
        data: [
          {
            message: `El estado debe ser uno de: ${ESTADOS_PERMITIDOS.join(", ")}`,
          },
        ],
      });
    }

    const { data: ticketActual, error: fetchError } = await supabase
      .from("tickets")
      .select("estado, grupo_id, asignado_id")
      .eq("id", ticketId)
      .single();
    if (fetchError || !ticketActual)
      return reply.status(404).send({
        statusCode: 404,
        intOpCode: 1,
        data: [{ message: "Ticket no encontrado." }],
      });

    const { data: memberData } = await supabase
      .from("grupo_miembros")
      .select("permisos_locales")
      .eq("grupo_id", ticketActual.grupo_id)
      .eq("usuario_id", userId)
      .single();

    const hasEditPerm = memberData?.permisos_locales?.includes("ticket:edit");
    const isAssigned = ticketActual.asignado_id === userId;

    if (!hasEditPerm && !isAssigned) {
      return reply.status(403).send({
        statusCode: 403,
        intOpCode: 1,
        data: [{ message: "No tienes permisos para mover este ticket." }],
      });
    }

    if (ticketActual.estado === estado) {
      return reply.status(200).send({
        statusCode: 200,
        intOpCode: 0,
        data: [{ message: "El ticket ya tiene ese estado." }],
      });
    }

    const { error: updateError } = await supabase
      .from("tickets")
      .update({ estado })
      .eq("id", ticketId);
    if (updateError) throw updateError;

    const { data: autor } = await supabase
      .from("usuarios")
      .select("nombre_completo")
      .eq("id", userId)
      .single();
    const nombreAutor = autor?.nombre_completo || "Usuario";

    await supabase.from("historial_tickets").insert({
      ticket_id: ticketId,
      usuario_id: userId,
      descripcion: `${nombreAutor} movió el ticket a '${estado}'.`,
    });

    return reply.status(200).send({
      statusCode: 200,
      intOpCode: 0,
      data: [{ message: `Estado actualizado a ${estado}.` }],
    });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error interno al cambiar el estado." }],
    });
  }
};

// ----- Agregar Comentario -----
export const addTicketComment = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const ticketId = request.params.id;
    const userId = request.user!.id;
    const { texto } = request.body as any;

    if (!texto || texto.trim() === "") {
      return reply.status(400).send({
        statusCode: 400,
        intOpCode: 1,
        data: [
          { message: "El texto del comentario para el ticket es obligatorio." },
        ],
      });
    }

    const { data: newComment, error: commentError } = await supabase
      .from("comentarios")
      .insert({
        ticket_id: ticketId,
        autor_id: userId,
        texto: texto.trim(),
      })
      .select(
        "id, texto, creado_en, autor:usuarios!comentarios_autor_id_fkey(nombre_completo)",
      )
      .single();

    if (commentError || !newComment) {
      return reply.status(500).send({
        statusCode: 500,
        intOpCode: 2,
        data: [{ message: "Error al guardar el comentario." }],
      });
    }

    const formattedComment = {
      id: newComment.id,
      texto: newComment.texto,
      fecha: newComment.creado_en,
      autor: (newComment.autor as any)?.nombre_completo || "Usuario",
    };

    return reply
      .status(201)
      .send({ statusCode: 201, intOpCode: 0, data: [formattedComment] });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error interno al agregar el comentario." }],
    });
  }
};
