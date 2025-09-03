const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/auth');
const { logWithContext, logBusinessEvent } = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for file attachments (reusing file upload logic)
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    
    try {
      await fs.mkdir(uploadPath, { recursive: true });
    } catch (error) {
      console.error('Error creating upload directory:', error);
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `message-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Allow common business file types
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'text/plain',
    'text/csv'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
  }
});

// Helper function to check if user can access client
const canAccessClient = async (userId, userRole, clientId) => {
  if (userRole === 'ADMIN') {
    return true;
  }
  
  if (userRole === 'MANAGER') {
    // Check if manager is assigned to this client
    const managerClient = await prisma.managerClient.findFirst({
      where: {
        manager: {
          userId: userId
        },
        clientId: clientId,
        isActive: true
      }
    });
    return !!managerClient;
  }
  
  return false;
};

// Helper function to get manager ID for user
const getManagerId = async (userId) => {
  const manager = await prisma.manager.findUnique({
    where: { userId: userId }
  });
  return manager?.id;
};

// Helper function to create notification
const createNotification = async (userId, type, title, content, relatedId, relatedType) => {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        content,
        relatedId,
        relatedType
      }
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};

// Validation schemas (basic validation functions)
const validateDialogueCreate = (body) => {
  const errors = [];
  
  if (!body.clientId) {
    errors.push('clientId is required');
  }
  
  if (!body.subject || body.subject.trim().length < 3) {
    errors.push('subject must be at least 3 characters long');
  }
  
  if (body.priority && !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(body.priority)) {
    errors.push('priority must be one of: LOW, NORMAL, HIGH, URGENT');
  }
  
  return errors;
};

const validateDialogueUpdate = (body) => {
  const errors = [];
  
  if (body.status && !['ACTIVE', 'CLOSED', 'ARCHIVED'].includes(body.status)) {
    errors.push('status must be one of: ACTIVE, CLOSED, ARCHIVED');
  }
  
  if (body.priority && !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(body.priority)) {
    errors.push('priority must be one of: LOW, NORMAL, HIGH, URGENT');
  }
  
  if (body.subject && body.subject.trim().length < 3) {
    errors.push('subject must be at least 3 characters long');
  }
  
  return errors;
};

const validateMessageCreate = (body) => {
  const errors = [];
  
  if (!body.content || body.content.trim().length === 0) {
    errors.push('content is required');
  }
  
  if (body.type && !['TEXT', 'NOTE', 'SYSTEM'].includes(body.type)) {
    errors.push('type must be one of: TEXT, NOTE, SYSTEM');
  }
  
  return errors;
};

// Apply role-based access to all routes
router.use(requireRole(['MANAGER', 'ADMIN']));

// GET /api/dialogues - Get dialogues for current manager
router.get('/', async (req, res, next) => {
  try {
    const { 
      search, 
      page = 1, 
      limit = 20, 
      sort = 'lastMessageAt', 
      order = 'DESC',
      status,
      priority,
      clientId
    } = req.query;

    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate and sanitize pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100); // Max 100 items per page
    const skip = (pageNum - 1) * limitNum;

    // Validate sort field
    const validSortFields = ['subject', 'status', 'priority', 'createdAt', 'updatedAt', 'lastMessageAt'];
    const sortField = validSortFields.includes(sort) ? sort : 'lastMessageAt';
    
    // Validate order
    const sortOrder = order.toUpperCase() === 'ASC' ? 'asc' : 'desc';

    // Build where clause for access control, search and filters
    let where = {};

    // Access control: Managers can only see dialogues for their assigned clients
    if (userRole === 'MANAGER') {
      const managerId = await getManagerId(userId);
      if (!managerId) {
        return res.status(403).json({ error: 'Manager profile not found' });
      }
      where.managerId = managerId;
    }
    // Admin can see all dialogues (no additional where clause needed)

    // Search across subject and client name
    if (search && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { subject: { contains: searchTerm, mode: 'insensitive' } },
        { 
          client: { 
            OR: [
              { name: { contains: searchTerm, mode: 'insensitive' } },
              { email: { contains: searchTerm, mode: 'insensitive' } },
              { contactPerson: { contains: searchTerm, mode: 'insensitive' } }
            ]
          } 
        }
      ];
    }

    // Status filter
    if (status && ['ACTIVE', 'CLOSED', 'ARCHIVED'].includes(status)) {
      where.status = status;
    }

    // Priority filter
    if (priority && ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority)) {
      where.priority = priority;
    }

    // Client filter
    if (clientId) {
      // Check if user can access this client
      if (userRole === 'MANAGER') {
        const canAccess = await canAccessClient(userId, userRole, clientId);
        if (!canAccess) {
          return res.status(403).json({ error: 'Access denied to this client' });
        }
      }
      where.clientId = clientId;
    }

    // Execute queries in parallel for performance
    const [dialogues, total, totalUnfiltered] = await Promise.all([
      prisma.dialogue.findMany({
        where,
        skip: skip,
        take: limitNum,
        orderBy: sortField === 'lastMessageAt' 
          ? [
              { lastMessageAt: sortOrder },
              { createdAt: sortOrder }
            ]
          : { [sortField]: sortOrder },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              contactPerson: true
            }
          },
          manager: {
            select: {
              id: true,
              name: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          },
          // Get last message preview
          messages: {
            select: {
              id: true,
              content: true,
              type: true,
              createdAt: true,
              author: {
                select: {
                  id: true,
                  name: true
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          _count: {
            select: {
              messages: true
            }
          }
        }
      }),
      prisma.dialogue.count({ where }),
      prisma.dialogue.count(userRole === 'MANAGER' ? 
        { where: { managerId: await getManagerId(userId) } } : 
        {}
      )
    ]);

    // Get unread message counts for each dialogue
    const dialogueIds = dialogues.map(d => d.id);
    const unreadCounts = await prisma.message.groupBy({
      by: ['dialogueId'],
      where: {
        dialogueId: { in: dialogueIds },
        readAt: null,
        authorId: { not: userId } // Don't count own messages as unread
      },
      _count: {
        id: true
      }
    });

    // Create unread count map
    const unreadMap = {};
    unreadCounts.forEach(uc => {
      unreadMap[uc.dialogueId] = uc._count.id;
    });

    // Enhance dialogues with unread count and last message preview
    const enhancedDialogues = dialogues.map(dialogue => ({
      id: dialogue.id,
      subject: dialogue.subject,
      status: dialogue.status,
      priority: dialogue.priority,
      lastMessageAt: dialogue.lastMessageAt,
      createdAt: dialogue.createdAt,
      updatedAt: dialogue.updatedAt,
      client: dialogue.client,
      manager: dialogue.manager,
      lastMessage: dialogue.messages[0] || null,
      messageCount: dialogue._count.messages,
      unreadCount: unreadMap[dialogue.id] || 0
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;
    const nextPage = hasNext ? pageNum + 1 : null;
    const prevPage = hasPrev ? pageNum - 1 : null;

    logWithContext('info', 'Dialogues retrieved', req, {
      userId: userId,
      userRole: userRole,
      totalReturned: enhancedDialogues.length,
      search: search || null,
      filters: { status, priority, clientId }
    });

    res.json({
      dialogues: enhancedDialogues,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: totalPages,
        hasNext,
        hasPrev,
        nextPage,
        prevPage
      },
      meta: {
        search: search || null,
        sort: sortField,
        order: sortOrder.toUpperCase(),
        totalFiltered: total,
        totalUnfiltered,
        filters: {
          status: status || null,
          priority: priority || null,
          clientId: clientId || null
        }
      }
    });
  } catch (error) {
    logWithContext('error', 'Error retrieving dialogues', req, { error: error.message });
    next(error);
  }
});

// POST /api/dialogues - Create new dialogue with client
router.post('/', async (req, res, next) => {
  try {
    const validationErrors = validateDialogueCreate(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: validationErrors
      });
    }

    const { clientId, subject, priority = 'NORMAL' } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check if user can access this client
    const canAccess = await canAccessClient(userId, userRole, clientId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied to this client' });
    }

    // Get manager ID
    const managerId = await getManagerId(userId);
    if (!managerId) {
      return res.status(403).json({ error: 'Manager profile not found' });
    }

    // Create dialogue in a transaction to ensure atomicity
    const dialogue = await prisma.$transaction(async (tx) => {
      // Create the dialogue
      const subjectTrimmed = subject.trim();
      const newDialogue = await tx.dialogue.create({
        data: {
          managerId,
          clientId,
          subject: subjectTrimmed,
          priority,
          status: 'ACTIVE'
        },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              contactPerson: true
            }
          },
          manager: {
            select: {
              id: true,
              name: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      });

      // Create initial system message
      await tx.message.create({
        data: {
          dialogueId: newDialogue.id,
          authorId: userId,
          content: `Dialogue created: ${subjectTrimmed}`,
          type: 'SYSTEM'
        }
      });

      // Update dialogue's lastMessageAt
      await tx.dialogue.update({
        where: { id: newDialogue.id },
        data: { lastMessageAt: new Date() }
      });

      return newDialogue;
    });

    // Create notification for client's other managers (if any)
    // Get other managers assigned to this client
    const otherManagers = await prisma.managerClient.findMany({
      where: {
        clientId,
        isActive: true,
        manager: {
          userId: { not: userId }
        }
      },
      include: {
        manager: {
          select: {
            userId: true
          }
        }
      }
    });

    // Create notifications for other managers
    await Promise.all(
      otherManagers.map(mc => 
        createNotification(
          mc.manager.userId,
          'MESSAGE',
          'New Dialogue Created',
          `New dialogue "${subject}" was created for client ${dialogue.client.name}`,
          dialogue.id,
          'DIALOGUE'
        )
      )
    );

    logBusinessEvent('dialogue_created', req, {
      dialogueId: dialogue.id,
      clientId,
      subject,
      priority,
      managerId
    });

    res.status(201).json({
      message: 'Dialogue created successfully',
      dialogue: {
        ...dialogue,
        messageCount: 1,
        unreadCount: 0
      }
    });
  } catch (error) {
    logWithContext('error', 'Error creating dialogue', req, { error: error.message });
    next(error);
  }
});

// GET /api/dialogues/:id - Get specific dialogue with messages
router.get('/:id', async (req, res, next) => {
  try {
    const { id: dialogueId } = req.params;
    const { 
      page = 1, 
      limit = 50,
      messageType,
      markAsRead = true
    } = req.query;

    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 50), 100);
    const skip = (pageNum - 1) * limitNum;

    // First, get the dialogue and check access
    const dialogue = await prisma.dialogue.findUnique({
      where: { id: dialogueId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            contactPerson: true,
            phone: true,
            address: true
          }
        },
        manager: {
          select: {
            id: true,
            name: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!dialogue) {
      return res.status(404).json({ error: 'Dialogue not found' });
    }

    // Check access permissions
    if (userRole === 'MANAGER') {
      const canAccess = await canAccessClient(userId, userRole, dialogue.clientId);
      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this dialogue' });
      }
    }

    // Build message filter
    let messageWhere = { dialogueId };
    if (messageType && ['TEXT', 'NOTE', 'SYSTEM'].includes(messageType)) {
      messageWhere.type = messageType;
    }

    // Get messages with pagination
    const [messages, totalMessages] = await Promise.all([
      prisma.message.findMany({
        where: messageWhere,
        skip: skip,
        take: limitNum,
        orderBy: { createdAt: 'asc' }, // Oldest first for chat display
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          },
          messageFiles: {
            include: {
              file: {
                select: {
                  id: true,
                  filename: true,
                  originalName: true,
                  size: true,
                  mimetype: true,
                  createdAt: true
                }
              }
            }
          }
        }
      }),
      prisma.message.count({ where: messageWhere })
    ]);

    // Mark messages as read if requested
    if (markAsRead === true || markAsRead === 'true') {
      const unreadMessageIds = messages
        .filter(message => !message.readAt && message.authorId !== userId)
        .map(message => message.id);
      
      if (unreadMessageIds.length > 0) {
        await prisma.message.updateMany({
          where: { 
            id: { in: unreadMessageIds }
          },
          data: { readAt: new Date() }
        });
      }
    }

    // Get total message count for dialogue
    const totalDialogueMessages = await prisma.message.count({
      where: { dialogueId }
    });

    // Get unread count for user
    const unreadCount = await prisma.message.count({
      where: {
        dialogueId,
        readAt: null,
        authorId: { not: userId }
      }
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalMessages / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    // Format messages response
    const formattedMessages = messages.map(message => ({
      id: message.id,
      content: message.content,
      type: message.type,
      isImportant: message.isImportant,
      readAt: message.readAt,
      createdAt: message.createdAt,
      author: message.author,
      attachments: message.messageFiles.map(mf => ({
        id: mf.file.id,
        filename: mf.file.filename,
        originalName: mf.file.originalName,
        size: mf.file.size,
        mimetype: mf.file.mimetype,
        downloadUrl: `/api/files/${mf.file.id}/download`,
        createdAt: mf.file.createdAt
      }))
    }));

    logWithContext('info', 'Dialogue retrieved', req, {
      dialogueId,
      messagesReturned: formattedMessages.length,
      markedAsRead: markAsRead === true || markAsRead === 'true'
    });

    res.json({
      dialogue: {
        id: dialogue.id,
        subject: dialogue.subject,
        status: dialogue.status,
        priority: dialogue.priority,
        lastMessageAt: dialogue.lastMessageAt,
        createdAt: dialogue.createdAt,
        updatedAt: dialogue.updatedAt,
        client: dialogue.client,
        manager: dialogue.manager,
        totalMessages: totalDialogueMessages,
        unreadCount: markAsRead === true || markAsRead === 'true' ? 0 : unreadCount
      },
      messages: formattedMessages,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalMessages,
        pages: totalPages,
        hasNext,
        hasPrev,
        nextPage: hasNext ? pageNum + 1 : null,
        prevPage: hasPrev ? pageNum - 1 : null
      }
    });
  } catch (error) {
    logWithContext('error', 'Error retrieving dialogue', req, { 
      dialogueId: req.params.id, 
      error: error.message 
    });
    next(error);
  }
});

// PUT /api/dialogues/:id - Update dialogue (status, priority, subject)
router.put('/:id', async (req, res, next) => {
  try {
    const { id: dialogueId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate input
    const validationErrors = validateDialogueUpdate(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors
      });
    }

    // Check if dialogue exists and get access info
    const dialogue = await prisma.dialogue.findUnique({
      where: { id: dialogueId },
      select: {
        id: true,
        clientId: true,
        managerId: true,
        subject: true,
        status: true,
        priority: true
      }
    });

    if (!dialogue) {
      return res.status(404).json({ error: 'Dialogue not found' });
    }

    // Check access permissions
    if (userRole === 'MANAGER') {
      const canAccess = await canAccessClient(userId, userRole, dialogue.clientId);
      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this dialogue' });
      }
    }

    // Extract updateable fields
    const { status, priority, subject } = req.body;
    const updateData = {};
    
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (subject !== undefined) updateData.subject = subject.trim();
    
    // If no fields to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        error: 'No valid fields to update',
        validFields: ['status', 'priority', 'subject']
      });
    }

    // Update dialogue
    const updatedDialogue = await prisma.dialogue.update({
      where: { id: dialogueId },
      data: updateData,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            contactPerson: true
          }
        },
        manager: {
          select: {
            id: true,
            name: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    // Create system message for significant changes
    const changes = [];
    if (status && status !== dialogue.status) {
      changes.push(`Status changed from ${dialogue.status} to ${status}`);
    }
    if (priority && priority !== dialogue.priority) {
      changes.push(`Priority changed from ${dialogue.priority} to ${priority}`);
    }
    if (subject && subject.trim() !== dialogue.subject) {
      changes.push(`Subject changed from "${dialogue.subject}" to "${subject.trim()}"`);
    }

    if (changes.length > 0) {
      await prisma.message.create({
        data: {
          dialogueId,
          authorId: userId,
          content: `Dialogue updated: ${changes.join(', ')}`,
          type: 'SYSTEM'
        }
      });

      // Update lastMessageAt
      await prisma.dialogue.update({
        where: { id: dialogueId },
        data: { lastMessageAt: new Date() }
      });
    }

    // Create notifications for other managers if there were significant changes
    if (changes.length > 0) {
      const otherManagers = await prisma.managerClient.findMany({
        where: {
          clientId: dialogue.clientId,
          isActive: true,
          manager: {
            userId: { not: userId }
          }
        },
        include: {
          manager: {
            select: {
              userId: true
            }
          }
        }
      });

      await Promise.all(
        otherManagers.map(mc => 
          createNotification(
            mc.manager.userId,
            'MESSAGE',
            'Dialogue Updated',
            `Dialogue "${updatedDialogue.subject}" was updated: ${changes.join(', ')}`,
            dialogueId,
            'DIALOGUE'
          )
        )
      );
    }

    logBusinessEvent('dialogue_updated', req, {
      dialogueId,
      changes: updateData,
      changeCount: changes.length
    });

    res.json({
      message: 'Dialogue updated successfully',
      dialogue: updatedDialogue,
      changes: changes
    });
  } catch (error) {
    logWithContext('error', 'Error updating dialogue', req, {
      dialogueId: req.params.id,
      error: error.message
    });
    next(error);
  }
});

// DELETE /api/dialogues/:id - Archive dialogue (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id: dialogueId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check if dialogue exists and get access info
    const dialogue = await prisma.dialogue.findUnique({
      where: { id: dialogueId },
      select: {
        id: true,
        clientId: true,
        subject: true,
        status: true
      }
    });

    if (!dialogue) {
      return res.status(404).json({ error: 'Dialogue not found' });
    }

    // Check access permissions
    if (userRole === 'MANAGER') {
      const canAccess = await canAccessClient(userId, userRole, dialogue.clientId);
      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this dialogue' });
      }
    }

    // Check if already archived
    if (dialogue.status === 'ARCHIVED') {
      return res.status(400).json({ error: 'Dialogue is already archived' });
    }

    // Archive the dialogue (soft delete)
    const archivedDialogue = await prisma.$transaction(async (tx) => {
      // Update dialogue status to ARCHIVED
      const updated = await tx.dialogue.update({
        where: { id: dialogueId },
        data: { 
          status: 'ARCHIVED',
          lastMessageAt: new Date()
        }
      });

      // Create system message
      await tx.message.create({
        data: {
          dialogueId,
          authorId: userId,
          content: `Dialogue archived by user`,
          type: 'SYSTEM'
        }
      });

      return updated;
    });

    // Create notifications for other managers
    const otherManagers = await prisma.managerClient.findMany({
      where: {
        clientId: dialogue.clientId,
        isActive: true,
        manager: {
          userId: { not: userId }
        }
      },
      include: {
        manager: {
          select: {
            userId: true
          }
        }
      }
    });

    await Promise.all(
      otherManagers.map(mc => 
        createNotification(
          mc.manager.userId,
          'ALERT',
          'Dialogue Archived',
          `Dialogue "${dialogue.subject}" has been archived`,
          dialogueId,
          'DIALOGUE'
        )
      )
    );

    logBusinessEvent('dialogue_archived', req, {
      dialogueId,
      subject: dialogue.subject
    });

    res.json({
      message: 'Dialogue archived successfully',
      dialogue: archivedDialogue
    });
  } catch (error) {
    logWithContext('error', 'Error archiving dialogue', req, {
      dialogueId: req.params.id,
      error: error.message
    });
    next(error);
  }
});

// POST /api/dialogues/:id/messages - Send message to dialogue
router.post('/:id/messages', upload.array('attachments', 5), async (req, res, next) => {
  try {
    const { id: dialogueId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate input
    const validationErrors = validateMessageCreate(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors
      });
    }

    const { content, type = 'TEXT', isImportant = false } = req.body;

    // Check if dialogue exists and get access info
    const dialogue = await prisma.dialogue.findUnique({
      where: { id: dialogueId },
      select: {
        id: true,
        clientId: true,
        status: true,
        client: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!dialogue) {
      return res.status(404).json({ error: 'Dialogue not found' });
    }

    // Check if dialogue is archived
    if (dialogue.status === 'ARCHIVED') {
      return res.status(400).json({ error: 'Cannot send messages to archived dialogue' });
    }

    // Check access permissions
    if (userRole === 'MANAGER') {
      const canAccess = await canAccessClient(userId, userRole, dialogue.clientId);
      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this dialogue' });
      }
    }

    // Handle file attachments
    let fileRecords = [];
    if (req.files && req.files.length > 0) {
      fileRecords = await Promise.all(
        req.files.map(async (file) => {
          return await prisma.file.create({
            data: {
              filename: file.filename,
              originalName: file.originalname,
              path: file.path,
              size: file.size,
              mimetype: file.mimetype,
              relatedType: 'MESSAGE'
            }
          });
        })
      );
    }

    // Create message in transaction
    const message = await prisma.$transaction(async (tx) => {
      // Create the message
      const newMessage = await tx.message.create({
        data: {
          dialogueId,
          authorId: userId,
          content: content.trim(),
          type,
          isImportant: Boolean(isImportant)
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      });

      // Link file attachments to message
      if (fileRecords.length > 0) {
        await tx.messageFile.createMany({
          data: fileRecords.map(file => ({
            messageId: newMessage.id,
            fileId: file.id
          }))
        });

        // Update file records with message relation
        await tx.file.updateMany({
          where: { id: { in: fileRecords.map(f => f.id) } },
          data: { relatedId: newMessage.id }
        });
      }

      // Update dialogue's lastMessageAt
      await tx.dialogue.update({
        where: { id: dialogueId },
        data: { lastMessageAt: new Date() }
      });

      return newMessage;
    });

    // Get other managers for notifications
    const otherManagers = await prisma.managerClient.findMany({
      where: {
        clientId: dialogue.clientId,
        isActive: true,
        manager: {
          userId: { not: userId }
        }
      },
      include: {
        manager: {
          select: {
            userId: true
          }
        }
      }
    });

    // Create notifications for other managers
    const notificationContent = fileRecords.length > 0 
      ? `New message with ${fileRecords.length} attachment(s) in dialogue for ${dialogue.client.name}`
      : `New message in dialogue for ${dialogue.client.name}`;

    await Promise.all(
      otherManagers.map(mc => 
        createNotification(
          mc.manager.userId,
          'MESSAGE',
          'New Message',
          notificationContent,
          dialogueId,
          'DIALOGUE'
        )
      )
    );

    // Format response with attachments
    const responseMessage = {
      id: message.id,
      content: message.content,
      type: message.type,
      isImportant: message.isImportant,
      readAt: message.readAt,
      createdAt: message.createdAt,
      author: message.author,
      attachments: fileRecords.map(file => ({
        id: file.id,
        filename: file.filename,
        originalName: file.originalName,
        size: file.size,
        mimetype: file.mimetype,
        downloadUrl: `/api/files/${file.id}/download`,
        createdAt: file.createdAt
      }))
    };

    logBusinessEvent('message_sent', req, {
      dialogueId,
      messageId: message.id,
      type,
      hasAttachments: fileRecords.length > 0,
      attachmentCount: fileRecords.length
    });

    res.status(201).json({
      message: 'Message sent successfully',
      messageData: responseMessage
    });
  } catch (error) {
    logWithContext('error', 'Error sending message', req, {
      dialogueId: req.params.id,
      error: error.message
    });
    next(error);
  }
});

// GET /api/dialogues/:id/messages - Get messages with pagination
router.get('/:id/messages', async (req, res, next) => {
  try {
    const { id: dialogueId } = req.params;
    const { 
      page = 1, 
      limit = 50,
      messageType,
      authorId,
      dateFrom,
      dateTo,
      markAsRead = true
    } = req.query;

    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 50), 100);
    const skip = (pageNum - 1) * limitNum;

    // Check if dialogue exists and access permissions
    const dialogue = await prisma.dialogue.findUnique({
      where: { id: dialogueId },
      select: {
        id: true,
        clientId: true
      }
    });

    if (!dialogue) {
      return res.status(404).json({ error: 'Dialogue not found' });
    }

    // Check access permissions
    if (userRole === 'MANAGER') {
      const canAccess = await canAccessClient(userId, userRole, dialogue.clientId);
      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this dialogue' });
      }
    }

    // Build message filter
    let messageWhere = { dialogueId };

    // Filter by message type
    if (messageType && ['TEXT', 'NOTE', 'SYSTEM'].includes(messageType)) {
      messageWhere.type = messageType;
    }

    // Filter by author
    if (authorId) {
      messageWhere.authorId = authorId;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      messageWhere.createdAt = {};
      if (dateFrom) {
        messageWhere.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        messageWhere.createdAt.lte = new Date(dateTo);
      }
    }

    // Get messages with pagination
    const [messages, totalMessages] = await Promise.all([
      prisma.message.findMany({
        where: messageWhere,
        skip: skip,
        take: limitNum,
        orderBy: { createdAt: 'asc' }, // Oldest first for chat display
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          },
          messageFiles: {
            include: {
              file: {
                select: {
                  id: true,
                  filename: true,
                  originalName: true,
                  size: true,
                  mimetype: true,
                  createdAt: true
                }
              }
            }
          }
        }
      }),
      prisma.message.count({ where: messageWhere })
    ]);

    // Mark messages as read if requested
    if (markAsRead === true || markAsRead === 'true') {
      const unreadMessageIds = messages
        .filter(message => !message.readAt && message.authorId !== userId)
        .map(message => message.id);
      
      if (unreadMessageIds.length > 0) {
        await prisma.message.updateMany({
          where: { 
            id: { in: unreadMessageIds }
          },
          data: { readAt: new Date() }
        });
      }
    }

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalMessages / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    // Format messages response
    const formattedMessages = messages.map(message => ({
      id: message.id,
      content: message.content,
      type: message.type,
      isImportant: message.isImportant,
      readAt: message.readAt,
      createdAt: message.createdAt,
      author: message.author,
      attachments: message.messageFiles.map(mf => ({
        id: mf.file.id,
        filename: mf.file.filename,
        originalName: mf.file.originalName,
        size: mf.file.size,
        mimetype: mf.file.mimetype,
        downloadUrl: `/api/files/${mf.file.id}/download`,
        createdAt: mf.file.createdAt
      }))
    }));

    logWithContext('info', 'Messages retrieved', req, {
      dialogueId,
      messagesReturned: formattedMessages.length,
      filters: { messageType, authorId, dateFrom, dateTo }
    });

    res.json({
      messages: formattedMessages,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalMessages,
        pages: totalPages,
        hasNext,
        hasPrev,
        nextPage: hasNext ? pageNum + 1 : null,
        prevPage: hasPrev ? pageNum - 1 : null
      },
      filters: {
        messageType: messageType || null,
        authorId: authorId || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null
      }
    });
  } catch (error) {
    logWithContext('error', 'Error retrieving messages', req, {
      dialogueId: req.params.id,
      error: error.message
    });
    next(error);
  }
});

// PUT /api/messages/:id - Update message (edit content, mark important)
router.put('/messages/:id', async (req, res, next) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const { content, isImportant } = req.body;

    // Validate that at least one field is being updated
    if (content === undefined && isImportant === undefined) {
      return res.status(400).json({ 
        error: 'No valid fields to update',
        validFields: ['content', 'isImportant']
      });
    }

    // Validate content if provided
    if (content !== undefined && (!content || content.trim().length === 0)) {
      return res.status(400).json({ error: 'Content cannot be empty' });
    }

    // Get message and check permissions
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        dialogue: {
          select: {
            id: true,
            clientId: true,
            status: true
          }
        },
        author: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if dialogue is archived
    if (message.dialogue.status === 'ARCHIVED') {
      return res.status(400).json({ error: 'Cannot edit messages in archived dialogue' });
    }

    // Check access permissions
    if (userRole === 'MANAGER') {
      const canAccess = await canAccessClient(userId, userRole, message.dialogue.clientId);
      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this dialogue' });
      }
    }

    // For content editing, only allow the author to edit within time limit
    if (content !== undefined) {
      if (message.authorId !== userId) {
        return res.status(403).json({ error: 'Only the message author can edit content' });
      }

      // Check time limit for editing (e.g., 15 minutes)
      const editTimeLimit = 15 * 60 * 1000; // 15 minutes in milliseconds
      const messageAge = Date.now() - new Date(message.createdAt).getTime();
      
      if (messageAge > editTimeLimit) {
        return res.status(400).json({ 
          error: 'Message can only be edited within 15 minutes of posting' 
        });
      }
    }

    // Build update data
    const updateData = {};
    if (content !== undefined) updateData.content = content.trim();
    if (isImportant !== undefined) updateData.isImportant = Boolean(isImportant);

    // Update the message
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        messageFiles: {
          include: {
            file: {
              select: {
                id: true,
                filename: true,
                originalName: true,
                size: true,
                mimetype: true,
                createdAt: true
              }
            }
          }
        }
      }
    });

    // Create system message for content edits
    if (content !== undefined) {
      await prisma.message.create({
        data: {
          dialogueId: message.dialogue.id,
          authorId: userId,
          content: `Message edited by ${message.author.name}`,
          type: 'SYSTEM'
        }
      });

      // Update dialogue's lastMessageAt for content changes
      await prisma.dialogue.update({
        where: { id: message.dialogue.id },
        data: { lastMessageAt: new Date() }
      });
    }

    // Create notifications if the message is marked as important
    if (isImportant === true) {
      const otherManagers = await prisma.managerClient.findMany({
        where: {
          clientId: message.dialogue.clientId,
          isActive: true,
          manager: {
            userId: { not: userId }
          }
        },
        include: {
          manager: {
            select: {
              userId: true
            }
          }
        }
      });

      await Promise.all(
        otherManagers.map(mc => 
          createNotification(
            mc.manager.userId,
            'ALERT',
            'Important Message',
            `Message marked as important: ${updatedMessage.content.substring(0, 100)}...`,
            message.dialogue.id,
            'DIALOGUE'
          )
        )
      );
    }

    // Format response
    const responseMessage = {
      id: updatedMessage.id,
      content: updatedMessage.content,
      type: updatedMessage.type,
      isImportant: updatedMessage.isImportant,
      readAt: updatedMessage.readAt,
      createdAt: updatedMessage.createdAt,
      author: updatedMessage.author,
      attachments: updatedMessage.messageFiles.map(mf => ({
        id: mf.file.id,
        filename: mf.file.filename,
        originalName: mf.file.originalName,
        size: mf.file.size,
        mimetype: mf.file.mimetype,
        downloadUrl: `/api/files/${mf.file.id}/download`,
        createdAt: mf.file.createdAt
      }))
    };

    logBusinessEvent('message_updated', req, {
      messageId,
      dialogueId: message.dialogue.id,
      changes: updateData,
      isImportant: updatedMessage.isImportant
    });

    res.json({
      message: 'Message updated successfully',
      messageData: responseMessage
    });
  } catch (error) {
    logWithContext('error', 'Error updating message', req, {
      messageId: req.params.id,
      error: error.message
    });
    next(error);
  }
});

module.exports = router;