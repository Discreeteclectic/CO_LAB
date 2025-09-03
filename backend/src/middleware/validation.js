const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message
      });
    }
    next();
  };
};

// User schemas
const userRegisterSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().min(2).max(50).required(),
  password: Joi.string().min(6).required()
});

const userLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Client schemas
const clientCreateSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  code: Joi.string().max(50).optional(),
  inn: Joi.string().pattern(/^\d{9,12}$/).optional(),
  contactPerson: Joi.string().max(100).optional(),
  position: Joi.string().max(100).optional(),
  phone: Joi.string().max(20).optional(),
  email: Joi.string().email().optional(),
  telegram: Joi.string().pattern(/^@?[a-zA-Z0-9_]{5,32}$/).optional().messages({
    'string.pattern.base': 'Telegram должен содержать от 5 до 32 символов и может включать только буквы, цифры и подчеркивания'
  }),
  address: Joi.string().max(500).optional(),
  notes: Joi.string().max(1000).optional()
});

const clientUpdateSchema = clientCreateSchema.fork(['name'], (schema) => schema.optional());

// Product schemas
const productCreateSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  code: Joi.string().max(100).optional(),
  supplier: Joi.string().max(200).optional(),
  unit: Joi.string().max(20).default('шт'),
  purchasePrice: Joi.number().min(0).required(),
  minStock: Joi.number().min(0).default(0),
  location: Joi.string().max(200).optional(),
  description: Joi.string().max(1000).optional(),
  manufactureDate: Joi.string().pattern(/^(0[1-9]|1[0-2])\/\d{4}$/).optional().messages({
    'string.pattern.base': 'Дата изготовления должна быть в формате MM/YYYY'
  }),
  certificationDate: Joi.string().pattern(/^(0[1-9]|1[0-2])\/\d{4}$/).optional().messages({
    'string.pattern.base': 'Дата переосвидетельствования должна быть в формате MM/YYYY'
  }),
  nextCertificationDate: Joi.string().pattern(/^(0[1-9]|1[0-2])\/\d{4}$/).optional().messages({
    'string.pattern.base': 'Следующая дата переосвидетельствования должна быть в формате MM/YYYY'
  })
});

const productUpdateSchema = productCreateSchema.fork(['name', 'purchasePrice'], (schema) => schema.optional());

// Warehouse schemas
const warehouseUpdateSchema = Joi.object({
  quantity: Joi.number().min(0).required()
});

// Transaction schemas
const transactionCreateSchema = Joi.object({
  productId: Joi.string().required(),
  type: Joi.string().valid('INCOMING', 'OUTGOING', 'INVENTORY').required(),
  quantity: Joi.number().min(0).required(),
  reason: Joi.string().max(500).optional(),
  clientId: Joi.string().optional(),
  serialNumbers: Joi.array().items(Joi.string()).optional(), // Для поступления
  serialNumberIds: Joi.array().items(Joi.string()).optional() // Для списания
});

// Calculation schemas
const calculationCreateSchema = Joi.object({
  clientId: Joi.string().optional(),
  name: Joi.string().min(1).max(200).required(),
  
  // Legacy fields for backward compatibility
  brokerPercent: Joi.number().min(0).default(0),
  transportCost: Joi.number().min(0).default(0),
  certificationCost: Joi.number().min(0).default(0),
  customsCost: Joi.number().min(0).default(0),
  vatPercent: Joi.number().min(0).default(12),
  quattroMargin: Joi.number().min(0).default(30),
  
  // New detailed cost breakdown fields (Себестоимость)
  gasCost: Joi.number().min(0).optional(),
  cylinderCost: Joi.number().min(0).optional(),
  preparationCost: Joi.number().min(0).optional(),
  logisticsCost: Joi.number().min(0).optional(),
  workersCost: Joi.number().min(0).optional(),
  kickbacksCost: Joi.number().min(0).optional(),
  
  // Sales price calculation fields
  productName: Joi.string().max(200).optional(),
  pricePerUnit: Joi.number().min(0).optional(),
  quantity: Joi.number().min(0).optional(),
  
  // Company and organization information
  sellingCompany: Joi.string().max(100).optional(),
  organizationINN: Joi.string().pattern(/^\d{9,12}$/).optional(),
  organizationName: Joi.string().max(200).optional(),
  responsibleManager: Joi.string().max(100).optional(),
  
  // Tax calculation fields
  incomeTaxPercent: Joi.number().min(0).max(100).default(20).optional(),
  
  items: Joi.array().items(
    Joi.object({
      productId: Joi.string().optional(),
      name: Joi.string().min(1).max(200).required(),
      cost: Joi.number().min(0).required(),
      duty: Joi.number().min(0).default(0),
      quantity: Joi.number().min(0).default(1)
    })
  ).optional() // Make items optional for new cost calculation system
});

const calculationUpdateSchema = calculationCreateSchema.fork(['name', 'items'], (schema) => schema.optional());

// Notification schemas
const notificationCreateSchema = Joi.object({
  type: Joi.string().valid('MESSAGE', 'REMINDER', 'ALERT', 'SYSTEM').required(),
  title: Joi.string().min(1).max(200).required(),
  content: Joi.string().max(1000).optional(),
  relatedId: Joi.string().optional(),
  relatedType: Joi.string().max(50).optional(),
  isUrgent: Joi.boolean().default(false),
  metadata: Joi.string().max(2000).optional(),
  expiresAt: Joi.date().iso().optional()
});

const notificationSettingsSchema = Joi.object({
  emailNotifications: Joi.boolean().default(true),
  types: Joi.object({
    MESSAGE: Joi.boolean().default(true),
    REMINDER: Joi.boolean().default(true),
    ALERT: Joi.boolean().default(true),
    SYSTEM: Joi.boolean().default(true)
  }).default({}),
  frequency: Joi.string().valid('INSTANT', 'DAILY', 'WEEKLY').default('INSTANT'),
  quietHours: Joi.object({
    enabled: Joi.boolean().default(false),
    start: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).default('22:00'),
    end: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).default('08:00')
  }).default({})
});

const notificationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  type: Joi.string().valid('MESSAGE', 'REMINDER', 'ALERT', 'SYSTEM').optional(),
  isRead: Joi.boolean().optional(),
  isUrgent: Joi.boolean().optional(),
  sortBy: Joi.string().valid('createdAt', 'title', 'type').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

const notificationClearSchema = Joi.object({
  type: Joi.string().valid('MESSAGE', 'REMINDER', 'ALERT', 'SYSTEM').optional()
});

module.exports = {
  validate,
  userRegisterSchema,
  userLoginSchema,
  clientCreateSchema,
  clientUpdateSchema,
  productCreateSchema,
  productUpdateSchema,
  warehouseUpdateSchema,
  transactionCreateSchema,
  calculationCreateSchema,
  calculationUpdateSchema,
  notificationCreateSchema,
  notificationSettingsSchema,
  notificationQuerySchema,
  notificationClearSchema
};