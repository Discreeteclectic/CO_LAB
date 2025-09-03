const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    
    // Create directory if it doesn't exist
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
    cb(null, `${uniqueSuffix}${ext}`);
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

// Upload files
router.post('/upload', upload.array('files', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { relatedId, relatedType } = req.body;

    const fileRecords = await Promise.all(
      req.files.map(async (file) => {
        return await prisma.file.create({
          data: {
            filename: file.filename,
            originalName: file.originalname,
            path: file.path,
            size: file.size,
            mimetype: file.mimetype,
            relatedId: relatedId || null,
            relatedType: relatedType || null
          }
        });
      })
    );

    res.status(201).json({
      message: 'Files uploaded successfully',
      files: fileRecords
    });
  } catch (error) {
    // Clean up uploaded files if database save fails
    if (req.files) {
      await Promise.all(
        req.files.map(async (file) => {
          try {
            await fs.unlink(file.path);
          } catch (unlinkError) {
            console.error('Error cleaning up file:', unlinkError);
          }
        })
      );
    }
    next(error);
  }
});

// Get files by related ID and type
router.get('/', async (req, res, next) => {
  try {
    const { relatedId, relatedType, page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    let where = {};
    
    if (relatedId) where.relatedId = relatedId;
    if (relatedType) where.relatedType = relatedType;

    const [files, total] = await Promise.all([
      prisma.file.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.file.count({ where })
    ]);

    res.json({
      files,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get file by ID
router.get('/:id', async (req, res, next) => {
  try {
    const file = await prisma.file.findUnique({
      where: { id: req.params.id }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(file);
  } catch (error) {
    next(error);
  }
});

// Download file
router.get('/:id/download', async (req, res, next) => {
  try {
    const file = await prisma.file.findUnique({
      where: { id: req.params.id }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if file exists on disk
    try {
      await fs.access(file.path);
    } catch {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Type', file.mimetype);

    // Send file
    res.sendFile(path.resolve(file.path));
  } catch (error) {
    next(error);
  }
});

// Delete file
router.delete('/:id', async (req, res, next) => {
  try {
    const file = await prisma.file.findUnique({
      where: { id: req.params.id }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete from database
    await prisma.file.delete({
      where: { id: req.params.id }
    });

    // Delete from disk
    try {
      await fs.unlink(file.path);
    } catch (unlinkError) {
      console.error('Error deleting file from disk:', unlinkError);
      // Don't fail the request if file deletion from disk fails
    }

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Update file metadata
router.put('/:id', async (req, res, next) => {
  try {
    const { relatedId, relatedType } = req.body;

    const file = await prisma.file.update({
      where: { id: req.params.id },
      data: {
        relatedId: relatedId || null,
        relatedType: relatedType || null
      }
    });

    res.json({
      message: 'File updated successfully',
      file
    });
  } catch (error) {
    next(error);
  }
});

// Get file statistics
router.get('/stats/overview', async (req, res, next) => {
  try {
    const [
      totalFiles,
      totalSize,
      filesByType,
      recentFiles
    ] = await Promise.all([
      prisma.file.count(),
      
      prisma.file.aggregate({
        _sum: { size: true }
      }),
      
      prisma.file.groupBy({
        by: ['mimetype'],
        _count: { mimetype: true },
        orderBy: { _count: { mimetype: 'desc' } },
        take: 10
      }),

      prisma.file.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          originalName: true,
          size: true,
          createdAt: true,
          relatedType: true
        }
      })
    ]);

    res.json({
      totalFiles,
      totalSize: totalSize._sum.size || 0,
      filesByType,
      recentFiles
    });
  } catch (error) {
    next(error);
  }
});

// Bulk delete files
router.delete('/bulk', async (req, res, next) => {
  try {
    const { fileIds } = req.body;

    if (!fileIds || !Array.isArray(fileIds)) {
      return res.status(400).json({ error: 'fileIds array is required' });
    }

    // Get files to delete
    const files = await prisma.file.findMany({
      where: { id: { in: fileIds } }
    });

    // Delete from database
    await prisma.file.deleteMany({
      where: { id: { in: fileIds } }
    });

    // Delete from disk
    await Promise.all(
      files.map(async (file) => {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error(`Error deleting file ${file.filename}:`, unlinkError);
        }
      })
    );

    res.json({ 
      message: `${files.length} files deleted successfully`,
      deletedCount: files.length
    });
  } catch (error) {
    next(error);
  }
});

// Upload photos for transaction (shipment confirmation)
router.post('/transaction/:id', upload.array('photos', 5), async (req, res, next) => {
  try {
    const transactionId = req.params.id;
    
    // Check if transaction exists
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded' });
    }

    // Validate that files are images
    const invalidFiles = req.files.filter(file => !file.mimetype.startsWith('image/'));
    if (invalidFiles.length > 0) {
      return res.status(400).json({ 
        error: 'Only image files are allowed for transaction photos' 
      });
    }

    // Save photo records to database
    const photos = await Promise.all(
      req.files.map(file => 
        prisma.file.create({
          data: {
            filename: file.filename,
            originalName: file.originalname,
            path: file.path,
            size: file.size,
            mimetype: file.mimetype,
            relatedId: transactionId,
            relatedType: 'TRANSACTION'
          }
        })
      )
    );

    res.status(201).json({
      message: `${photos.length} photos uploaded successfully`,
      photos: photos.map(photo => ({
        id: photo.id,
        filename: photo.filename,
        originalName: photo.originalName,
        size: photo.size,
        mimetype: photo.mimetype,
        url: `/uploads/${photo.filename}`
      }))
    });

  } catch (error) {
    // Clean up uploaded files if database save fails
    if (req.files) {
      await Promise.all(
        req.files.map(async (file) => {
          try {
            await fs.unlink(file.path);
          } catch (unlinkError) {
            console.error('Error cleaning up file:', unlinkError);
          }
        })
      );
    }
    next(error);
  }
});

module.exports = router;