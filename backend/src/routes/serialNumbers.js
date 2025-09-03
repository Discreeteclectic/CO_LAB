const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { validate } = require('../middleware/validation');
const Joi = require('joi');

const router = express.Router();
const prisma = new PrismaClient();

// Схемы валидации
const serialNumberCreateSchema = Joi.object({
  productId: Joi.string().required(),
  serialNumbers: Joi.array().items(
    Joi.object({
      serialNumber: Joi.string().required(),
      manufactureDate: Joi.string().pattern(/^(0[1-9]|1[0-2])\/\d{4}$/).optional().messages({'string.pattern.base': 'Дата изготовления должна быть в формате MM/YYYY'}),
      certificationDate: Joi.string().pattern(/^(0[1-9]|1[0-2])\/\d{4}$/).optional().messages({'string.pattern.base': 'Дата переосвидетельствования должна быть в формате MM/YYYY'}),
      nextCertificationDate: Joi.string().pattern(/^(0[1-9]|1[0-2])\/\d{4}$/).optional().messages({'string.pattern.base': 'Следующая дата переосвидетельствования должна быть в формате MM/YYYY'})
    })
  ).min(1).required()
});

const serialNumberUpdateSchema = Joi.object({
  status: Joi.string().valid('IN_STOCK', 'OUT_OF_STOCK').optional(),
  manufactureDate: Joi.string().pattern(/^(0[1-9]|1[0-2])\/\d{4}$/).optional().messages({'string.pattern.base': 'Дата изготовления должна быть в формате MM/YYYY'}),
  certificationDate: Joi.string().pattern(/^(0[1-9]|1[0-2])\/\d{4}$/).optional().messages({'string.pattern.base': 'Дата переосвидетельствования должна быть в формате MM/YYYY'}),
  nextCertificationDate: Joi.string().pattern(/^(0[1-9]|1[0-2])\/\d{4}$/).optional().messages({'string.pattern.base': 'Следующая дата переосвидетельствования должна быть в формате MM/YYYY'})
});

// Получить все серийные номера товара
router.get('/product/:productId', async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { status } = req.query;

    const where = { productId };
    if (status) {
      where.status = status;
    }

    const serialNumbers = await prisma.serialNumber.findMany({
      where,
      include: {
        product: {
          select: { name: true, code: true }
        },
        transactions: {
          select: {
            id: true,
            type: true,
            createdAt: true,
            client: {
              select: { name: true }
            },
            user: {
              select: { name: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { serialNumber: 'asc' }
    });

    res.json({ serialNumbers });
  } catch (error) {
    next(error);
  }
});

// Получить историю серийного номера
router.get('/:id/history', async (req, res, next) => {
  try {
    const serialNumber = await prisma.serialNumber.findUnique({
      where: { id: req.params.id },
      include: {
        product: {
          select: { name: true, code: true }
        },
        transactions: {
          include: {
            user: {
              select: { name: true }
            },
            client: {
              select: { name: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!serialNumber) {
      return res.status(404).json({ error: 'Serial number not found' });
    }

    res.json(serialNumber);
  } catch (error) {
    next(error);
  }
});

// Добавить серийные номера при поступлении товара
router.post('/', validate(serialNumberCreateSchema), async (req, res, next) => {
  try {
    console.log('=== SERIAL NUMBERS POST REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    const { productId, serialNumbers } = req.body;

    // Проверяем, что товар существует
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Получаем или создаем warehouse item
    let warehouseItem = await prisma.warehouseItem.findUnique({
      where: { productId }
    });

    if (!warehouseItem) {
      warehouseItem = await prisma.warehouseItem.create({
        data: {
          productId,
          quantity: 0
        }
      });
    }

    // Проверяем на дублирование серийных номеров
    const serialNumberValues = serialNumbers.map(s => typeof s === 'string' ? s : s.serialNumber);
    const existingSerials = await prisma.serialNumber.findMany({
      where: {
        productId,
        serialNumber: { in: serialNumberValues }
      }
    });

    if (existingSerials.length > 0) {
      const duplicates = existingSerials.map(s => s.serialNumber);
      return res.status(400).json({
        error: 'Duplicate serial numbers found',
        duplicates
      });
    }

    // Создаем серийные номера
    const created = await prisma.$transaction(async (tx) => {
      // Создаем серийные номера
      const createdSerials = await Promise.all(
        serialNumbers.map(serialData => {
          const data = typeof serialData === 'string' ? 
            { serialNumber: serialData } : 
            serialData;
          
          // Преобразуем строки дат в объекты Date
          const processDate = (dateStr) => {
            if (!dateStr) return null;
            
            // Если формат MM/YYYY или MMYYYY, преобразуем в полную дату
            let processedDate;
            if (dateStr.includes('/')) {
              // Формат MM/YYYY
              const [month, year] = dateStr.split('/');
              processedDate = new Date(parseInt(year), parseInt(month) - 1, 1);
            } else if (dateStr.length === 6) {
              // Формат MMYYYY
              const month = dateStr.substring(0, 2);
              const year = dateStr.substring(2);
              processedDate = new Date(parseInt(year), parseInt(month) - 1, 1);
            } else {
              // Попытка парсить как обычную дату
              processedDate = new Date(dateStr);
            }
            
            // Проверяем валидность даты
            if (isNaN(processedDate.getTime())) {
              console.error('Invalid date:', dateStr);
              return null;
            }
            
            console.log('Processing date:', dateStr, 'to:', processedDate);
            return processedDate;
          };
          
          console.log('Serial data received:', data);
          
          return tx.serialNumber.create({
            data: {
              productId,
              warehouseItemId: warehouseItem.id,
              serialNumber: data.serialNumber,
              manufactureDate: processDate(data.manufactureDate),
              certificationDate: processDate(data.certificationDate),
              nextCertificationDate: processDate(data.nextCertificationDate),
              status: 'IN_STOCK'
            }
          });
        })
      );

      // Обновляем количество на складе
      await tx.warehouseItem.update({
        where: { id: warehouseItem.id },
        data: {
          quantity: {
            increment: serialNumbers.length
          }
        }
      });

      return createdSerials;
    });

    res.status(201).json({
      message: `Added ${serialNumbers.length} serial numbers`,
      serialNumbers: created
    });

  } catch (error) {
    next(error);
  }
});

// Обновить статус серийного номера
router.put('/:id', validate(serialNumberUpdateSchema), async (req, res, next) => {
  try {
    const { status } = req.body;

    const serialNumber = await prisma.serialNumber.findUnique({
      where: { id: req.params.id }
    });

    if (!serialNumber) {
      return res.status(404).json({ error: 'Serial number not found' });
    }

    const updated = await prisma.serialNumber.update({
      where: { id: req.params.id },
      data: { status }
    });

    res.json({
      message: 'Serial number updated successfully',
      serialNumber: updated
    });

  } catch (error) {
    next(error);
  }
});

// Удалить серийный номер (только если статус OUT_OF_STOCK)
router.delete('/:id', async (req, res, next) => {
  try {
    const serialNumber = await prisma.serialNumber.findUnique({
      where: { id: req.params.id },
      include: {
        warehouseItem: true
      }
    });

    if (!serialNumber) {
      return res.status(404).json({ error: 'Serial number not found' });
    }

    if (serialNumber.status === 'IN_STOCK') {
      return res.status(400).json({
        error: 'Cannot delete serial number that is still in stock'
      });
    }

    await prisma.$transaction(async (tx) => {
      // Удаляем серийный номер
      await tx.serialNumber.delete({
        where: { id: req.params.id }
      });

      // Обновляем количество на складе (если нужно)
      const remainingCount = await tx.serialNumber.count({
        where: {
          productId: serialNumber.productId,
          status: 'IN_STOCK'
        }
      });

      await tx.warehouseItem.update({
        where: { id: serialNumber.warehouseItemId },
        data: {
          quantity: remainingCount
        }
      });
    });

    res.json({ message: 'Serial number deleted successfully' });

  } catch (error) {
    next(error);
  }
});

// Поиск по серийному номеру
router.get('/search', async (req, res, next) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const serialNumbers = await prisma.serialNumber.findMany({
      where: {
        serialNumber: {
          contains: query
        }
      },
      include: {
        product: {
          select: { name: true, code: true }
        },
        transactions: {
          select: {
            id: true,
            type: true,
            createdAt: true,
            client: {
              select: { name: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      },
      take: 20
    });

    res.json({ serialNumbers });

  } catch (error) {
    next(error);
  }
});

// Получить все серийные номера сгруппированные по товарам
router.get('/grouped', async (req, res, next) => {
  try {
    const { status } = req.query;

    // Получаем все товары с их серийными номерами
    const products = await prisma.product.findMany({
      include: {
        serialNumbers: {
          where: status ? { status } : {},
          orderBy: { serialNumber: 'asc' }
        },
        warehouseItems: {
          select: { quantity: true }
        }
      }
    });

    // Фильтруем только товары у которых есть серийные номера
    const grouped = products
      .filter(product => product.serialNumbers.length > 0)
      .map(product => ({
        id: product.id,
        name: product.name,
        code: product.code,
        totalQuantity: product.warehouseItems[0]?.quantity || 0,
        serialNumbers: product.serialNumbers,
        inStockCount: product.serialNumbers.filter(s => s.status === 'IN_STOCK').length,
        outOfStockCount: product.serialNumbers.filter(s => s.status === 'OUT_OF_STOCK').length
      }));

    res.json({ grouped });

  } catch (error) {
    next(error);
  }
});

module.exports = router;